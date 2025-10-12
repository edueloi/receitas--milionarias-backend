// src/controllers/dashboardController.js
import stripePackage from "stripe";
import db from '../config/db.js';

const stripe = stripePackage(process.env.STRIPE_SECRET_KEY);

/**
 * Agrega dados do Stripe e do banco de dados local para um painel financeiro.
 */
export const getDashboardData = async (req, res) => {
    try {
        const range = (req.query.range || "7d").toLowerCase();
        const now = Math.floor(Date.now() / 1000);

        const startOfDay = (ts) => {
            const d = new Date(ts * 1000);
            d.setHours(0, 0, 0, 0);
            return Math.floor(d.getTime() / 1000);
        };

        let gte; // greater than or equal
        if (range === "day") gte = startOfDay(now);
        else if (range === "7d") gte = now - 7 * 24 * 3600;
        else if (range === "30d") gte = now - 30 * 24 * 3600;
        else gte = undefined; // all time

        const chargesParams = {
            limit: 100,
            expand: ["data.balance_transaction"],
        };
        if (gte) chargesParams.created = { gte };

        // --- Requisições em Paralelo para o Stripe ---
        const [customersList, subsList, chargesList, transfersList, balance, payouts] = await Promise.all([
            stripe.customers.list({ limit: 100, expand: ["data.subscriptions"] }),
            stripe.subscriptions.list({ limit: 100, status: 'all' }),
            stripe.charges.list(chargesParams),
            stripe.transfers.list({ limit: 100, created: gte ? { gte } : undefined }),
            stripe.balance.retrieve(),
            stripe.payouts.list({ limit: 10, created: gte ? { gte } : undefined }),
        ]);

        // --- Processamento e Agregação dos Dados ---

        // 1. Totais de cobranças
        let totalBruto = 0, totalTarifa = 0, totalLiquido = 0;
        chargesList.data.forEach(c => {
            if (c.paid && !c.refunded) {
                totalBruto += c.amount || 0;
                totalTarifa += c.balance_transaction?.fee ?? 0;
                totalLiquido += c.balance_transaction?.net ?? 0;
            }
        });

        // 2. Saldo (Balance)
        const availableBrl = balance.available.find(b => b.currency === "brl")?.amount ?? 0;
        const pendingBrl = balance.pending.find(b => b.currency === "brl")?.amount ?? 0;

        // 3. Pagamentos Recentes
        const pagamentos = chargesList.data.map(c => ({
            id: c.id,
            amount: c.amount,
            fee: c.balance_transaction?.fee ?? null,
            net: c.balance_transaction?.net ?? null,
            created: c.created,
            paid: c.paid,
            status: c.status,
            customerName: c.billing_details?.name || 'N/A',
            customerEmail: c.billing_details?.email || 'N/A',
        })).sort((a, b) => b.created - a.created);

        // 4. Clientes com Status do DB Local
        const [localUsers] = await db.query(`
            SELECT u.email, s.nome AS status_nome
            FROM usuarios u
            JOIN status_usuarios s ON u.id_status = s.id
        `);
        const localUserStatusMap = new Map(localUsers.map(u => [u.email, u.status_nome]));

        const clientes = customersList.data.map(c => ({
            id: c.id,
            name: c.name || "Sem nome",
            email: c.email || "—",
            status: localUserStatusMap.get(c.email) || 'Não Assinante',
        }));

        // 5. Assinaturas Ativas
        const totalAssinaturasAtivas = subsList.data.filter(s => s.status === "active").length;

        // 6. Transferências para Afiliados
        const totalTransferencias = transfersList.data.reduce((sum, t) => sum + (t.amount || 0), 0);

        // --- Resposta Final ---
        res.json({
            period: range,
            total: {
                bruto: totalBruto,
                tarifa: totalTarifa,
                liquido: totalLiquido,
            },
            balance: {
                availableBrl,
                pendingBrl,
            },
            counts: {
                totalClientes: clientes.length,
                totalAssinaturasAtivas: totalAssinaturasAtivas,
            },
            totalTransferencias,
            pagamentos,
            clientes,
            // Adicionar mais dados processados se necessário
            // proximosVencimentos, proximosRepasses, etc.
        });

    } catch (error) {
        console.error("❌ Erro em /dashboard-data:", error);
        res.status(500).json({ message: "Erro ao carregar dados do painel", error: error.message });
    }
};