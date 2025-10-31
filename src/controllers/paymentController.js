import { MercadoPagoConfig, PreApproval, Payment } from "mercadopago";
import db from "../config/db.js";

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
        const [existing] = await db.query(
          "SELECT id FROM pagamentos WHERE id_pagamento_gateway = ?",
          [paymentInfo.id]
        );
        if (existing.length > 0) {
          return res.status(200).send("Pagamento já processado.");
        }

        const connection = await db.getConnection();
        await connection.beginTransaction();
        try {
          // Registra pagamento
          const [paymentResult] = await connection.query(
            `INSERT INTO pagamentos 
              (id_usuario, id_pagamento_gateway, valor, status, metodo_pagamento, data_pagamento)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              userId,
              paymentInfo.id,
              paymentInfo.transaction_amount ?? 0,
              "aprovado",
              paymentInfo.payment_type_id ?? null,
              new Date(),
            ]
          );
          const paymentOriginId = paymentResult.insertId;

          // Atualiza assinatura do usuário (30 dias)
          const expirationDate = new Date();
          expirationDate.setDate(expirationDate.getDate() + 30);
          await connection.query(
            "UPDATE usuarios SET id_status = ?, data_expiracao_assinatura = ? WHERE id = ?",
            [1, expirationDate, userId]
          );

          // Comissão do afiliado (se houver)
          const [userRows] = await connection.query(
            "SELECT id_afiliado_indicador FROM usuarios WHERE id = ?",
            [userId]
          );
          const affiliateId = userRows?.[0]?.id_afiliado_indicador;

          if (affiliateId) {
            const commissionValue = 9.9;
            const releaseDate = new Date();
            releaseDate.setDate(releaseDate.getDate() + 45);

            await connection.query(
              `INSERT INTO comissoes 
                (id_afiliado, id_usuario_pagador, id_pagamento_origem, valor, status, data_liberacao)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                affiliateId,
                userId,
                paymentOriginId,
                commissionValue,
                "pendente",
                releaseDate,
              ]
            );
          }

          await connection.commit();
        } catch (trxErr) {
          await connection.rollback();
          console.error("Erro na transação do webhook de pagamento:", trxErr);
          return res.status(500).send("Erro interno ao processar o pagamento.");
        } finally {
          // só libera se a connection existir (proteção)
          try {
            await connection.release();
          } catch {}
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
