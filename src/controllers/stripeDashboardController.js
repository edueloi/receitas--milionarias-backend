// src/controllers/stripeDashboardController.js

import stripePackage from "stripe";
import dotenv from 'dotenv';
dotenv.config();

// Inicializa o Stripe com a sua chave secreta
const stripe = stripePackage(process.env.STRIPE_SECRET_KEY);

// ================================
// 🔐 AUTENTICAÇÃO
// ================================

// Middleware para verificar se o usuário está autenticado
export const isAuthenticated = (req, res, next) => {
  if (req.session.isAuthenticated) {
    return next();
  }
  res.redirect("/login");
};

// Função de Login
export const login = (req, res) => {
  const { username, password } = req.body;

  // Logs para depuração
  console.log("Tentativa de login recebida:", { username, password });
  console.log("Credenciais esperadas:", { 
    user: process.env.ADMIN_USER, 
    pass: process.env.ADMIN_PASS 
  });

  // ATENÇÃO: Lógica de autenticação insegura apenas para demonstração.
  // Substitua por uma verificação segura com hash de senhas em um banco de dados.
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    req.session.isAuthenticated = true;
    res.status(200).json({ message: "Login bem-sucedido!" });
  } else {
    res.status(401).json({ message: "Utilizador ou senha inválidos." });
  }
};

// Função de Logout
export const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Não foi possível fazer logout." });
    }
    res.redirect("/login");
  });
};


export const getStripeDashboardData = async (req, res) => {
  try {
    const range = (req.query.range || "7d").toLowerCase();
    const now = Math.floor(Date.now() / 1000);

    const startOfDay = (ts) => {
      const d = new Date(ts * 1000);
      d.setHours(0, 0, 0, 0);
      return Math.floor(d.getTime() / 1000);
    };

    let gte;
    if (range === "day") gte = startOfDay(now);
    else if (range === "7d") gte = now - 7 * 24 * 3600;
    else if (range === "30d") gte = now - 30 * 24 * 3600;
    else gte = undefined; // all

    const chargesParams = {
      limit: 100,
      expand: ["data.balance_transaction", "data.payment_intent"],
    };
    if (gte) chargesParams.created = { gte };

    // ================================
    // 🔄 Requisições principais Stripe
    // ================================
    const [customersList, subsList, chargesList, transfersList, balance, payouts] =
      await Promise.all([
        stripe.customers.list({ limit: 100 }),
        stripe.subscriptions.list({ limit: 100, expand: ["data.latest_invoice"] }),
        stripe.charges.list(chargesParams),
        stripe.transfers.list({ limit: 100 }),
        stripe.balance.retrieve(),
        stripe.payouts.list({ limit: 5 }),
      ]);

    const customers = customersList.data;
    const subs = subsList.data;
    const charges = chargesList.data;
    const transfers = transfersList.data;

    // ================================
    // 🧭 Mapas auxiliares
    // ================================
    const customerMap = new Map(
      customers.map((c) => [c.id, { name: c.name || "", email: c.email || "" }])
    );

    const subscriptionStatusMap = new Map();
    subs.forEach((s) => {
      if (!s.customer) return;
      let status = "Inativo";
      if (s.status === "active") status = "Ativo";
      else if (["past_due", "unpaid"].includes(s.status))
        status = "Pagamento Pendente";
      else if (s.status === "canceled") status = "Cancelado";
      subscriptionStatusMap.set(s.customer, status);
    });

    const pagamentosPorCliente = new Map();
    charges.forEach((c) => {
      if (!c.customer) return;
      if (!pagamentosPorCliente.has(c.customer))
        pagamentosPorCliente.set(c.customer, []);
      pagamentosPorCliente.get(c.customer).push(c);
    });

    function getStatusPorPagamento(customerId) {
      const lista = pagamentosPorCliente.get(customerId);
      if (!lista || lista.length === 0) return "Inativo";

      const pago = lista.find((p) => p.paid === true);
      const pendente = lista.find((p) =>
        ["pending", "requires_payment_method"].includes(p.status)
      );

      if (pago) {
        const dataPagamento = new Date(pago.created * 1000);
        const diffDias = (Date.now() - dataPagamento) / (1000 * 60 * 60 * 24);
        if (diffDias <= 30) return "Ativo";
      }

      if (pendente) return "Pagamento Pendente";
      return "Inativo";
    }

    // ================================
    // 👥 Clientes com status final
    // ================================
    const clientesComStatus = customers.map((c) => {
      let status = subscriptionStatusMap.get(c.id);
      if (!status) status = getStatusPorPagamento(c.id);
      return {
        id: c.id,
        name: c.name || "Sem nome",
        email: c.email || "—",
        status,
      };
    });

    // ================================
    // 💰 Totais do período
    // ================================
    let totalBruto = 0,
      totalTarifa = 0,
      totalLiquido = 0;
    charges.forEach((c) => {
      if (c.paid && !c.refunded) {
        const bt = c.balance_transaction;
        const bruto = c.amount || 0;
        const tarifa = bt?.fee ?? 0;
        const liquido = bt?.net ?? bruto - tarifa;
        totalBruto += bruto;
        totalTarifa += tarifa;
        totalLiquido += liquido;
      }
    });

    // ================================
    // 📅 Próximos vencimentos
    // ================================
    const proximosVencimentos = subs
      .filter((s) => s.status === "active")
      .map((s) => ({
        id: s.id,
        customerId: s.customer,
        customerName: customerMap.get(s.customer)?.name || s.customer,
        customerEmail: customerMap.get(s.customer)?.email || "",
        nextPaymentDate: s.current_period_end, // Passando o timestamp diretamente
      }))
      .sort(
        (a, b) => (a.nextPaymentDate || 0) - (b.nextPaymentDate || 0)
      );

    // ================================
    // 💳 Pagamentos recentes
    // ================================
    const pagamentos = charges
      .map((c) => {
        const cust = c.customer && customerMap.get(c.customer);
        const bt = c.balance_transaction;
        return {
          id: c.id,
          amount: c.amount,
          fee: bt?.fee ?? null,
          net: bt?.net ?? null,
          created: c.created,
          paid: c.paid,
          status: c.status,
          customerId: c.customer || null,
          customerName: c.billing_details?.name || cust?.name || "",
          customerEmail: c.billing_details?.email || cust?.email || "",
          receiptUrl: c.receipt_url || null,
        };
      })
      .sort((a, b) => b.created - a.created);

    // ================================
    // 🔗 Relação de Afiliados e Indicados
    // ================================
    const afiliadosMap = new Map();
    subs.forEach((s) => {
      const affiliateId = s.metadata?.affiliate_id;
      if (affiliateId) {
        if (!afiliadosMap.has(affiliateId)) afiliadosMap.set(affiliateId, []);
        afiliadosMap.get(affiliateId).push({
          id: s.id,
          customerId: s.customer,
          email: customerMap.get(s.customer)?.email,
          name: customerMap.get(s.customer)?.name,
          status:
            s.status === "active"
              ? "Ativo"
              : s.status === "canceled"
              ? "Cancelado"
              : "Inativo",
          nextPayment: s.current_period_end
            ? new Date(s.current_period_end * 1000)
            : null,
        });
      }
    });

    // ================================
    // 💸 Ganhos por Afiliado
    // ================================
    const ganhosPorAfiliado = new Map();
    transfers.forEach((t) => {
      const destino = t.destination;
      if (!destino) return;
      const valor = t.amount || 0;
      ganhosPorAfiliado.set(
        destino,
        (ganhosPorAfiliado.get(destino) || 0) + valor
      );
    });

    // ================================
    // 💵 Totais de transferências e saldo
    // ================================
    const totalTransferencias = transfers.reduce(
      (sum, t) => sum + (t.amount || 0),
      0
    );

    const availableBrl =
      balance.available.find((b) => b.currency === "brl")?.amount ?? 0;
    const pendingBrl =
      balance.pending.find((b) => b.currency === "brl")?.amount ?? 0;

    const proximosRepasses = payouts.data.map((p) => ({
      id: p.id,
      amount: p.amount,
      arrivalDate: p.arrival_date ? new Date(p.arrival_date * 1000) : null,
      status: p.status,
    }));

    // ================================
    // ✅ Retorno completo
    // ================================
    res.json({
      period: range,
      customers: clientesComStatus,
      subscriptions: subs,
      pagamentos,
      total: {
        bruto: totalBruto,
        tarifa: totalTarifa,
        liquido: totalLiquido,
      },
      transfers,
      totalTransferencias,
      balance: { availableBrl, pendingBrl },
      proximosVencimentos,
      proximosRepasses,
      afiliados: Object.fromEntries(afiliadosMap),
      ganhosPorAfiliado: Object.fromEntries(ganhosPorAfiliado),
      totalClientes: customers.length,
      totalAssinaturas: subs.filter(s => s.status === 'active').length
    });

  } catch (error) {
    console.error("❌ Erro ao carregar dados do painel Stripe:", error);
    res.status(500).json({ error: "Erro ao carregar dados do painel" });
  }
};

export async function handleWebhook(req, res) {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.WEBHOOK_SECRET;
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.log(`❌ Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Evento que roda a cada pagamento MENSAL bem-sucedido
    if (event.type === "invoice.paid") {
      const invoice = event.data.object;
      console.log(`✅ Fatura [${invoice.id}] paga com sucesso.`);

      // Se o pagamento da fatura foi bem-sucedido
      if (invoice.status === "paid") {
        const subscriptionId = invoice.subscription;
        const customerId = invoice.customer;

        // Aqui você deve adicionar a lógica para interagir com seu banco de dados
        console.log(`Assinatura ${subscriptionId} paga pelo cliente ${customerId}.`);

      }
    }

    // Liberação de acesso para o primeiro pagamento
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.payment_status === "paid") {
        console.log(
          `🎉 Primeiro pagamento da assinatura [${session.subscription}] realizado! Liberando acesso...`
        );
        // AQUI: Lógica para mudar o status do usuário no seu DB para "ativo"
        // const userId = session.client_reference_id;
        // await yourDB.updateUser(userId, { status: 'ativo', stripeCustomerId: session.customer });
      }
    }

    res.status(200).send();
}