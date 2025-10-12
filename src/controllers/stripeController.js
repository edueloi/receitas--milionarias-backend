
// src/controllers/stripeController.js
import stripePackage from "stripe";

const stripe = stripePackage(process.env.STRIPE_SECRET_KEY);

// Rota para CRIAR CONTA DE AFILIADO
export const createAffiliateAccount = async (req, res) => {
  const { userEmail, userId } = req.body; // Pegue o email e o ID do usuário logado no seu sistema

  try {
    const account = await stripe.accounts.create({
      type: "express",
      country: "BR",
      email: userEmail,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    // IMPORTANTE: Salve o ID da conta (account.id) no seu banco de dados, associado a este usuário.
    console.log(`Conta Conectada criada para ${userEmail}. ID: ${account.id}`);
    await db.query(
      "UPDATE usuarios SET stripe_account_id = ? WHERE id = ?",
      [account.id, userId]
    );

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.FRONTEND_URL}/onboarding/erro`,
      return_url: `${process.env.FRONTEND_URL}/onboarding/sucesso`,
      type: "account_onboarding",
    });

    res.json({ 
      accountId: account.id,
      onboardingUrl: accountLink.url 
    });
  } catch (error) {
    console.error("❌ Erro ao criar conta de afiliado:", error.message);
    res.status(500).send({ error: "Erro ao criar conta de afiliado" });
  }
};

// Rota para o CADASTRO DO CLIENTE FINAL
export const createCheckoutSession = async (req, res) => {
  const { email, firstName, lastName, affiliateId, success_url, cancel_url } = req.body;

  console.log(`[STRIPE] 🚀 Iniciando createCheckoutSession para: ${email}`);

  try {
    const priceId = "price_1SEbQd3Qt7AZrHCLjQha9N8X";
    console.log(`[STRIPE] ✅ Price ID definido: ${priceId}`);

    const sessionPayload = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      client_reference_id: `user_${Date.now()}`,
      success_url: success_url || "http://localhost:3003/frontend/success.html?cs={CHECKOUT_SESSION_ID}",
      cancel_url: cancel_url || "http://localhost:3003/frontend/index.html",
      metadata: { affiliate_id: affiliateId || "" },
      subscription_data: { metadata: { affiliate_id: affiliateId || "" } },
    };

    console.log("[STRIPE] 📦 Montando payload para o Stripe:", sessionPayload);

    console.log("[STRIPE] ⏳ Tentando criar a sessão no Stripe...");
    const session = await stripe.checkout.sessions.create(sessionPayload);
    console.log("[STRIPE] 🎉 Sessão criada com sucesso:", session.id);

    console.log("[STRIPE] ➡️ Enviando ID da sessão para o frontend.");
    res.json({ id: session.id });

  } catch (error) {
    console.error("❌ [ERRO FATAL NO STRIPE]:", error); // Log completo do erro
    res.status(500).json({
        message: "Erro ao criar sessão de pagamento no Stripe.",
        error: error.message,
        type: error.type,
        code: error.code,
    });
  }
};

import db from "../config/db.js"; // IMPORTANTE: Adicionar import do DB

// Webhook para lidar com eventos do Stripe
export const handleWebhook = async (req, res) => {
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

    if (invoice.status === "paid") {
      // Evita duplicidade
      const [existing] = await db.query(
        "SELECT id FROM pagamentos WHERE id_pagamento_gateway = ?",
        [invoice.id]
      );
      if (existing.length > 0) {
        return res.status(200).send("Pagamento já processado.");
      }

      const connection = await db.getConnection();
      await connection.beginTransaction();

      try {
        // 1. Buscar dados da assinatura no Stripe para pegar o metadata
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const affiliateId = subscription.metadata.affiliate_id;

        // 2. Buscar nosso usuário interno pelo ID de cliente do Stripe
        const [userRows] = await connection.query(
          "SELECT id FROM usuarios WHERE stripe_customer_id = ?",
          [invoice.customer]
        );
        const userId = userRows?.[0]?.id;

        if (!userId) {
          throw new Error(`Usuário não encontrado para stripe_customer_id: ${invoice.customer}`);
        }

        // 3. Registrar o pagamento na tabela `pagamentos`
        const [paymentResult] = await connection.query(
          `INSERT INTO pagamentos 
            (id_usuario, id_pagamento_gateway, valor, status, metodo_pagamento, data_pagamento, fonte)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            invoice.id, // ID da fatura do Stripe
            (invoice.amount_paid / 100).toFixed(2), // Valor em reais
            "aprovado",
            "stripe_card", // Método
            new Date(invoice.created * 1000), // Data do pagamento
            "stripe", // Fonte
          ]
        );
        const paymentOriginId = paymentResult.insertId;

        // 4. Se houver um afiliado, registrar a comissão
        if (affiliateId) {
          const commissionValue = 9.9; // Valor fixo da comissão
          const releaseDate = new Date();
          releaseDate.setDate(releaseDate.getDate() + 45); // Data de liberação

          await connection.query(
            `INSERT INTO comissoes 
              (id_afiliado, id_usuario_pagador, id_pagamento_origem, valor, status, data_liberacao, fonte)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              affiliateId,
              userId,
              paymentOriginId,
              commissionValue,
              "pendente",
              releaseDate,
              "stripe", // Fonte
            ]
          );
          console.log(`✅ Comissão de R$${commissionValue} registrada para o afiliado ${affiliateId}.`);
        }

        await connection.commit();
      } catch (trxErr) {
        await connection.rollback();
        console.error("❌ Erro na transação do webhook do Stripe:", trxErr);
        return res.status(500).send("Erro interno ao processar o pagamento do Stripe.");
      } finally {
        connection.release();
      }
    }
  }

  // Liberação de acesso e CRIAÇÃO DE USUÁRIO para o primeiro pagamento
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    if (session.payment_status === "paid") {
      console.log(
        `🎉 Primeiro pagamento da assinatura [${session.subscription}] realizado! Processando usuário...`
      );

      const stripeCustomerId = session.customer;
      const userId = session.metadata?.userId; // Pega o ID do nosso sistema

      if (stripeCustomerId && userId) {
        try {
          console.log(`✨ Vinculando stripe_customer_id ${stripeCustomerId} ao usuário ${userId}...`);
          await db.query(
            "UPDATE usuarios SET stripe_customer_id = ?, id_status = 1 WHERE id = ?",
            [stripeCustomerId, userId]
          );
          console.log(`✅ Usuário atualizado com sucesso!`);
        } catch (dbError) {
          console.error("❌ Erro ao vincular stripe_customer_id ao usuário:", dbError);
        }
      }
    }
  }

  res.status(200).send();
};
