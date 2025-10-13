// src/controllers/dashboardController.js
import stripePackage from "stripe";
import db from '../config/db.js';

const stripe = stripePackage(process.env.STRIPE_SECRET_KEY);

/**
 * Agrega dados do Stripe e do banco de dados local para um painel financeiro.
 */
export const getDashboardData = async (req, res) => {
    try {
        const { id: userId, role: userRole } = req.user;
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

        // Admin (role 1) gets all data
        if (userRole === 1) {
            const chargesParams = {
                limit: 100,
                expand: ["data.balance_transaction"],
            };
            if (gte) chargesParams.created = { gte };

            const [customersList, subsList, chargesList, transfersList, balance, payouts] = await Promise.all([
                stripe.customers.list({ limit: 100, expand: ["data.subscriptions"] }),
                stripe.subscriptions.list({ limit: 100, status: 'all' }),
                stripe.charges.list(chargesParams),
                stripe.transfers.list({ limit: 100, created: gte ? { gte } : undefined }),
                stripe.balance.retrieve(),
                stripe.payouts.list({ limit: 10, created: gte ? { gte } : undefined }),
            ]);

            let totalBruto = 0, totalTarifa = 0, totalLiquido = 0;
            chargesList.data.forEach(c => {
                if (c.paid && !c.refunded) {
                    totalBruto += c.amount || 0;
                    totalTarifa += c.balance_transaction?.fee ?? 0;
                    totalLiquido += c.balance_transaction?.net ?? 0;
                }
            });

            const availableBrl = balance.available.find(b => b.currency === "brl")?.amount ?? 0;
            const pendingBrl = balance.pending.find(b => b.currency === "brl")?.amount ?? 0;

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

            const totalAssinaturasAtivas = subsList.data.filter(s => s.status === "active").length;
            const totalTransferencias = transfersList.data.reduce((sum, t) => sum + (t.amount || 0), 0);

            return res.json({
                period: range,
                total: { bruto: totalBruto, tarifa: totalTarifa, liquido: totalLiquido },
                balance: { availableBrl, pendingBrl },
                counts: { totalClientes: clientes.length, totalAssinaturasAtivas: totalAssinaturasAtivas },
                totalTransferencias,
                pagamentos,
                clientes,
            });
        } else {
            // Non-admin users get their own data
            const [userRows] = await db.query("SELECT stripe_customer_id, stripe_account_id FROM usuarios WHERE id = ?", [userId]);

            if (userRows.length === 0) {
                return res.status(404).json({ message: "Usuário não encontrado." });
            }

            const { stripe_customer_id, stripe_account_id } = userRows[0];

            let customerData = {};
            let chargesData = { data: [] };
            let transfersData = { data: [] };
            let affiliateBalance = { available: [], pending: [] };

            if (stripe_customer_id) {
                customerData = await stripe.customers.retrieve(stripe_customer_id);
                chargesData = await stripe.charges.list({ customer: stripe_customer_id, limit: 100 });
            }

            // Fetch transfers and balance if the user is an affiliate (has a stripe_account_id)
            if (stripe_account_id) {
                transfersData = await stripe.transfers.list({ destination: stripe_account_id, limit: 100 });
                affiliateBalance = await stripe.balance.retrieve({ stripeAccount: stripe_account_id });
            }

            let totalBruto = 0, totalTarifa = 0, totalLiquido = 0;
            chargesData.data.forEach(c => {
                if (c.paid && !c.refunded) {
                    totalBruto += c.amount || 0;
                    totalTarifa += c.balance_transaction?.fee ?? 0;
                    totalLiquido += c.balance_transaction?.net ?? 0;
                }
            });

            const totalTransferencias = transfersData.data.reduce((sum, t) => sum + (t.amount || 0), 0);

            const pagamentos = chargesData.data.map(c => ({
                id: c.id,
                amount: c.amount,
                created: c.created,
                status: c.status,
            })).sort((a, b) => b.created - a.created);

            const availableBrl = affiliateBalance.available.find(b => b.currency === "brl")?.amount ?? 0;
            const pendingBrl = affiliateBalance.pending.find(b => b.currency === "brl")?.amount ?? 0;


            res.json({
                period: range,
                total: { bruto: totalBruto, tarifa: totalTarifa, liquido: totalLiquido },
                balance: { availableBrl, pendingBrl },
                counts: {
                    totalAssinaturasAtivas: customerData.subscriptions ? customerData.subscriptions.total_count : 0,
                },
                totalTransferencias,
                pagamentos,
                clientes: customerData ? [{
                    id: customerData.id,
                    name: customerData.name || "Sem nome",
                    email: customerData.email || "—",
                    status: 'Ativo', // Simplified status for user's own view
                }] : [],
            });
        }
    } catch (error) {
        console.error("❌ Erro em /dashboard-data:", error);
        res.status(500).json({ message: "Erro ao carregar dados do painel", error: error.message });
    }
};