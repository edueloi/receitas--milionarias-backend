
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
    // Exemplo: await yourDB.updateUser(userId, { stripeAccountId: account.id });

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: "http://localhost:3003/success.html", // Volta para o início se expirar
      return_url: "http://localhost:3003/", // Volta para sucesso após cadastro
      type: "account_onboarding",
    });

    res.json({ url: accountLink.url });
  } catch (error) {
    console.error("❌ Erro ao criar conta de afiliado:", error.message);
    res.status(500).send({ error: "Erro ao criar conta de afiliado" });
  }
};

// Rota para o CADASTRO DO CLIENTE FINAL
export const createCheckoutSession = async (req, res) => {
  const { email, firstName, lastName, affiliateId } = req.body;

  console.log(`[STRIPE] 🚀 Iniciando createCheckoutSession para: ${email}`);

  try {
    const priceId = "price_1SEbQd3Qt7AZrHCLjQha9N8X";
    console.log(`[STRIPE] ✅ Price ID definido: ${priceId}`);

    const sessionPayload = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      client_reference_id: `user_${Date.now()}`,
      success_url: "http://localhost:3003/frontend/success.html?cs={CHECKOUT_SESSION_ID}",
      cancel_url: "http://localhost:3003/frontend/index.html",
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

    // Se o pagamento da fatura foi bem-sucedido
    if (invoice.status === "paid") {
      const subscriptionId = invoice.subscription;
      const customerId = invoice.customer;

      // ====================================================================
      // LÓGICA DE TRANSFERÊNCIA PARA AFILIADO
      // ====================================================================

      // 1. Busque a assinatura no SEU banco de dados para ver se tem um afiliado.
      //    Exemplo: const subscriptionData = await yourDB.findSubscription({ stripeSubscriptionId: subscriptionId });
      //    Para este exemplo, vamos simular que encontramos os dados:
      const subscriptionData = {
        affiliateId: "user_afiliado_123", // ID do afiliado no SEU sistema
      };

      // 2. Verifique se esta assinatura foi indicada por um afiliado
      if (subscriptionData && subscriptionData.affiliateId) {
        // 3. Busque os dados do afiliado no SEU banco de dados para pegar o ID da conta Stripe dele
        //    Exemplo: const affiliate = await yourDB.findUser({ userId: subscriptionData.affiliateId });
        const affiliate = {
          stripeAccountId: "acct_1SEc1v3Qt7iOJNgH", // ID da Conta Conectada do afiliado (exemplo)
        };

        if (affiliate && affiliate.stripeAccountId) {
          try {
            // 4. Crie a transferência de R$ 9,90 para o afiliado
            const transfer = await stripe.transfers.create({
              amount: 990, // Valor em centavos!
              currency: "brl",
              destination: affiliate.stripeAccountId,
              // Liga a transferência a este pagamento específico para seu controle
              transfer_group: `sub_${subscriptionId}`,
            });
            console.log(
              `💸 Transferência de R$ 9,90 realizada com sucesso para o afiliado ${affiliate.stripeAccountId}`
            );
          } catch (error) {
            console.error(
              "❌ Falha ao criar transferência para afiliado:",
              error.message
            );
          }
        }
      } else {
        console.log(" assinante não foi indicado por um afiliado.");
      }
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
};
