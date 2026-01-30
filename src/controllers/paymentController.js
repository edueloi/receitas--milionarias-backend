import { MercadoPagoConfig, PreApproval, Payment } from "mercadopago";
import db from "../config/db.js";
import { getCommissionSettingsForRole, PERMISSION_ROLE_MAP } from "../config/commissionSettingsDb.js";
import { get, run } from "../config/commissionPaymentsDb.js";

const resolveRoleName = (permissionId) => PERMISSION_ROLE_MAP[permissionId] || "afiliado";

const PLAN_ID = process.env.MERCADOPAGO_PLAN_ID;

// ---- Helpers
const showTokenPrefix = () => {
  const prefix = (process.env.MERCADOPAGO_ACCESS_TOKEN || "").slice(0, 8);
  console.log("MP token prefix:", prefix || "(vazio)");
};
const normalizeMpError = (error) => ({
  name: error?.name,
  status: error?.status,
  message: error?.message,
  cause: error?.cause,
  request: error?.request,
});

// ---- Boot check (DESATIVADO - Usando apenas Stripe)
// if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
//   console.error(
//     "[BOOT] MERCADOPAGO_ACCESS_TOKEN não carregado! Verifique seu .env.development"
//   );
// }
// showTokenPrefix();

// ---- MP Client (DESATIVADO - Usando apenas Stripe)
const client = process.env.MERCADOPAGO_ACCESS_TOKEN 
  ? new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN })
  : null;

// Criar assinatura (Checkout de Assinatura)
export const createSubscription = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { userEmail } = req.body;

    if (!userId) return res.status(401).json({ error: 'Usuário não autenticado.' });
    if (!userEmail) return res.status(400).json({ error: 'O e-mail do usuário é obrigatório.' });

    const preapproval = new PreApproval(client);

    const body = {
      preapproval_plan_id: process.env.MERCADOPAGO_PLAN_ID || '91d83d1166d94939b7147de1640cdcad',
      payer_email: userEmail,
      back_url: `${process.env.FRONTEND_URL}/subscription/success`,
      reason: 'Assinatura Receitas Milionárias',
      external_reference: String(userId),

      // 👇 forçar o fluxo com checkout (sem exigir card_token_id)
      status: 'pending'
    };

    const result = await preapproval.create({ body });

    return res.json({
      checkoutUrl: result?.init_point,
      id: result?.id,
      status: result?.status
    });
  } catch (error) {
    console.error('MP Preapproval error:', error);
    return res.status(500).json({ error: 'Erro ao criar assinatura' });
  }
};

// Webhook de pagamentos (ex.: eventos de cobrança)
export const handleWebhook = async (req, res) => {
  try {
    const topic = req.body.topic || req.body.type || req.query.topic;
    const id = req.body.id || req.query.id;

    // Mercado Pago envia payments/notifications em diferentes formatos.
    // Mantemos sua lógica: quando vier "payment" + id, buscamos detalhes.

    if (
      (topic === "payment" ||
        (topic && topic.includes("authorized_payment"))) &&
      id
    ) {
      const payment = new Payment(client);
      const paymentInfo = await payment.get({ id });

      // Apenas processa pagamentos aprovados e com external_reference (userId)
      if (
        paymentInfo?.status === "approved" &&
        paymentInfo?.external_reference
      ) {
        const userId = parseInt(paymentInfo.external_reference, 10);

        // Evita duplicidade
        const existing = await get(
          "SELECT id FROM pagamentos WHERE id_pagamento_gateway = ?",
          [paymentInfo.id]
        );
        if (existing?.id) {
          return res.status(200).send("Pagamento já processado.");
        }

        try {
          // Registra pagamento
          const paymentResult = await run(
            `INSERT INTO pagamentos 
              (id_usuario, id_pagamento_gateway, valor, status, metodo_pagamento, data_pagamento)
             VALUES (?, ?, ?, ?, ?, datetime('now'))`,
            [
              userId,
              paymentInfo.id,
              paymentInfo.transaction_amount ?? 0,
              "aprovado",
              paymentInfo.payment_type_id ?? null,
            ]
          );
          const paymentOriginId = paymentResult.lastID;

          // Atualiza assinatura do usuário (30 dias)
          const expirationDate = new Date();
          expirationDate.setDate(expirationDate.getDate() + 30);
          await db.query(
            "UPDATE usuarios SET id_status = ?, data_expiracao_assinatura = ? WHERE id = ?",
            [1, expirationDate, userId]
          );
          // Comissão do afiliado (se houver)
          const [userRows] = await db.query(
            "SELECT id_afiliado_indicador FROM usuarios WHERE id = ?",
            [userId]
          );
          const affiliateId = userRows?.[0]?.id_afiliado_indicador;

          if (affiliateId) {
            const [affiliateRows] = await db.query(
              "SELECT id, id_permissao, id_status, id_afiliado_indicador FROM usuarios WHERE id = ?",
              [affiliateId]
            );
            const affiliate = affiliateRows?.[0];
            if (affiliate) {
              const affiliateRole = resolveRoleName(affiliate.id_permissao);
              const affiliateSettings = await getCommissionSettingsForRole(affiliateRole);
              const level1Cents = Math.max(0, Number(affiliateSettings.level1_cents || 0));
              if (level1Cents > 0) {
                const commissionValue = level1Cents / 100;
                const releaseDate = new Date();
                releaseDate.setDate(releaseDate.getDate() + 45);
                const releaseDateStr = releaseDate.toISOString().split('T')[0];

                await run(
                  `INSERT INTO comissoes 
                    (id_afiliado, id_usuario_pagador, id_pagamento_origem, valor, status, data_liberacao)
                   VALUES (?, ?, ?, ?, ?, ?)`,
                  [
                    affiliateId,
                    userId,
                    paymentOriginId,
                    commissionValue,
                    "pendente",
                    releaseDateStr,
                  ]
                );

                const parentAffiliateId = affiliate.id_afiliado_indicador;
                if (parentAffiliateId) {
                  const [parentRows] = await db.query(
                    "SELECT id, id_permissao, id_status FROM usuarios WHERE id = ?",
                    [parentAffiliateId]
                  );
                  const parent = parentRows?.[0];
                  if (parent) {
                    const parentRole = resolveRoleName(parent.id_permissao);
                    const parentSettings = await getCommissionSettingsForRole(parentRole);
                    const secondEnabled = Number(parentSettings.level2_enabled) === 1;
                    const secondCents = Math.max(0, Number(parentSettings.level2_cents || 0));
                    if (parentRole === "afiliado pro" && parent.id_status === 1 && secondEnabled && secondCents > 0) {
                      const secondValue = secondCents / 100;
                      await run(
                        `INSERT INTO comissoes 
                          (id_afiliado, id_usuario_pagador, id_pagamento_origem, valor, status, data_liberacao)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                          parent.id,
                          userId,
                          paymentOriginId,
                          secondValue,
                          "pendente",
                          releaseDateStr,
                        ]
                      );
                    }
                  }
                }
              }
            }
          }

        } catch (trxErr) {
          console.error("Erro na transação do webhook de pagamento:", trxErr);
          return res.status(500).send("Erro interno ao processar o pagamento.");
        }
      }

      return res.status(200).send("Webhook de pagamento recebido.");
    }

    // Outros tópicos ou payloads que não são processáveis
    return res
      .status(200)
      .send("Webhook recebido, mas não é um pagamento processável.");
  } catch (error) {
    console.error(
      "Erro ao processar webhook de pagamento:",
      JSON.stringify(normalizeMpError(error), null, 2)
    );
    return res.status(500).send("Erro ao processar webhook");
  }
};

