// src/controllers/adminController.js
import db from '../config/db.js';
import Stripe from 'stripe';
import { all, run } from '../config/commissionPaymentsDb.js';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

/**
 * (Admin) Libera o saldo pendente de um usuário, movendo-o para o saldo disponível.
 * @param {object} req - O objeto de requisição do Express.
 * @param {object} res - O objeto de resposta do Express.
 */
export const releasePendingBalance = async (req, res) => {
  const { userId, amount } = req.body;

  if (!userId || !amount) {
    return res.status(400).json({ message: 'userId e amount são obrigatórios.' });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ message: 'O valor (amount) deve ser um número positivo.' });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 1. Verificar se o usuário existe e tem saldo pendente suficiente (com lock para evitar race condition)
    const [userRows] = await connection.query(
      'SELECT saldo_pendente FROM usuarios WHERE id = ? FOR UPDATE',
      [userId]
    );

    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    const user = userRows[0];
    if (user.saldo_pendente < parsedAmount) {
      await connection.rollback();
      return res.status(400).json({ message: 'Saldo pendente insuficiente.' });
    }

    // 2. Atualizar os saldos
    await connection.query(
      'UPDATE usuarios SET saldo_pendente = saldo_pendente - ?, saldo_disponivel = saldo_disponivel + ? WHERE id = ?',
      [parsedAmount, parsedAmount, userId]
    );
    
    // (Opcional) 3. Registrar a transação em uma tabela de log/histórico
    // await connection.query('INSERT INTO log_transacoes_admin (admin_id, user_id, amount, type) VALUES (?, ?, ?, ?)', [req.user.id, userId, parsedAmount, 'liberacao_saldo']);


    await connection.commit();

    res.status(200).json({ message: `R$ ${parsedAmount.toFixed(2)} liberados com sucesso para o usuário ${userId}.` });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Erro ao liberar saldo pendente:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * (Admin) Lista todas as solicitações de saque.
 * Pode filtrar por status.
 */
export const listWithdrawalRequests = async (req, res) => {
  const { status } = req.query; // 'pendente', 'aprovado', 'rejeitado'

  try {
    let sql = `
      SELECT s.id, s.id_usuario, u.nome as nome_usuario, s.valor, s.status, s.chave_pix_usada, s.data_solicitacao 
      FROM saques s
      JOIN usuarios u ON s.id_usuario = u.id
    `;
    const params = [];

    if (status) {
      sql += ' WHERE s.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY s.data_solicitacao DESC';

    const [requests] = await db.query(sql, params);
    res.json(requests);
  } catch (error) {
    console.error('Erro ao listar solicitações de saque:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
};

/**
 * (Admin) Aprova ou rejeita uma solicitação de saque.
 */
export const processWithdrawalRequest = async (req, res) => {
  const { withdrawalId } = req.params;
  const { status } = req.body; // 'aprovado' ou 'rejeitado'

  if (!status || !['aprovado', 'rejeitado'].includes(status)) {
    return res.status(400).json({ message: "O campo 'status' é obrigatório e deve ser 'aprovado' ou 'rejeitado'." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 1. Buscar o saque e verificar seu status (com lock)
    const [withdrawalRows] = await connection.query(
      'SELECT id, id_usuario, valor, status FROM saques WHERE id = ? FOR UPDATE',
      [withdrawalId]
    );

    if (withdrawalRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Solicitação de saque não encontrada.' });
    }

    const withdrawal = withdrawalRows[0];

    if (withdrawal.status !== 'pendente') {
      await connection.rollback();
      return res.status(400).json({ message: `Esta solicitação de saque já foi processada (status: ${withdrawal.status}).` });
    }

    // 2. Atualizar o status do saque
    await connection.query(
      'UPDATE saques SET status = ? WHERE id = ?',
      [status, withdrawalId]
    );

    // 3. Se for rejeitado, devolver o saldo ao usuário
    if (status === 'rejeitado') {
      await connection.query(
        'UPDATE usuarios SET saldo_disponivel = saldo_disponivel + ? WHERE id = ?',
        [withdrawal.valor, withdrawal.id_usuario]
      );
    }
    
    // Se for 'aprovado', o saldo já foi debitado no momento da solicitação.
    // O admin agora deve realizar a transferência PIX manualmente.

    await connection.commit();

    res.status(200).json({ message: `Solicitação de saque ${withdrawalId} foi marcada como '${status}'.` });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Erro ao processar solicitação de saque:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * (Admin) Reprocessa transferências Stripe de comissões sem repasse.
 * Tenta criar transfer usando source_transaction do payment_intent.
 */
export const retryStripeTransfers = async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ message: 'STRIPE_SECRET_KEY não configurada.' });
  }

  const limit = Number(req.query.limit || 100);
  if (!Number.isFinite(limit) || limit <= 0) {
    return res.status(400).json({ message: 'Limit inválido.' });
  }

  try {
    const rows = await all(
      `SELECT 
          c.id AS commission_id,
          c.valor AS commission_value,
          c.id_afiliado,
          c.id_usuario_pagador,
          c.stripe_transfer_id,
          c.status,
          c.fonte,
          p.id AS payment_id,
          p.stripe_payment_intent_id,
          p.stripe_charge_id
       FROM comissoes c
       JOIN pagamentos p ON c.id_pagamento_origem = p.id
       WHERE (c.fonte = 'stripe' OR c.fonte IS NULL)
         AND (c.stripe_transfer_id IS NULL OR c.stripe_transfer_id = '')
         AND (p.stripe_payment_intent_id IS NOT NULL OR p.stripe_charge_id IS NOT NULL)
         AND c.valor > 0
       ORDER BY c.id DESC
       LIMIT ?`,
      [limit]
    );

    const affiliateIds = rows.map((row) => row.id_afiliado);
    let usersMap = new Map();
    if (affiliateIds.length > 0) {
      const placeholders = affiliateIds.map(() => '?').join(',');
      const [users] = await db.query(
        `SELECT id, stripe_account_id, email, id_status FROM usuarios WHERE id IN (${placeholders})`,
        affiliateIds
      );
      usersMap = new Map(users.map((row) => [row.id, row]));
    }

    const pagadorIds = rows.map((row) => row.id_usuario_pagador);
    let pagadoresMap = new Map();
    if (pagadorIds.length > 0) {
      const placeholders = pagadorIds.map(() => '?').join(',');
      const [users] = await db.query(
        `SELECT id, email FROM usuarios WHERE id IN (${placeholders})`,
        pagadorIds
      );
      pagadoresMap = new Map(users.map((row) => [row.id, row]));
    }

    let success = 0;
    let failed = 0;
    let skipped = 0;
    const errors = [];
    const skippedDetails = [];

    for (const row of rows) {
      try {
        const user = usersMap.get(row.id_afiliado);
        if (!user?.stripe_account_id) {
          skipped += 1;
          skippedDetails.push({ commission_id: row.commission_id, reason: 'missing_stripe_account' });
          continue;
        }

        if (Number(user.id_status) !== 1) {
          skipped += 1;
          skippedDetails.push({ commission_id: row.commission_id, reason: 'affiliate_inactive' });
          continue;
        }

        const account = await stripe.accounts.retrieve(user.stripe_account_id);
        if (!account.payouts_enabled) {
          skipped += 1;
          skippedDetails.push({ commission_id: row.commission_id, reason: 'payouts_disabled' });
          continue;
        }

        let paymentIntentId = row.stripe_payment_intent_id;
        let chargeId = row.stripe_charge_id || null;
        let invoiceChargeId = null;
        if (paymentIntentId && paymentIntentId.startsWith('invoice_')) {
          const invoiceId = paymentIntentId.replace(/^invoice_/, '');
          try {
            const invoice = await stripe.invoices.retrieve(invoiceId);
            paymentIntentId = invoice?.payment_intent || null;
            invoiceChargeId = invoice?.charge || null;
          } catch (invErr) {
            skipped += 1;
            skippedDetails.push({ commission_id: row.commission_id, reason: 'invoice_not_found' });
            continue;
          }
        }

        if (!paymentIntentId && !chargeId) {
          const pagador = pagadoresMap.get(row.id_usuario_pagador);
          if (pagador?.email) {
            try {
              const customers = await stripe.customers.list({ email: pagador.email, limit: 1 });
              const customerId = customers?.data?.[0]?.id;
              if (customerId) {
                const charges = await stripe.charges.list({ customer: customerId, limit: 20 });
                const paid = (charges?.data || []).filter(
                  (ch) => ch.paid && ch.status === 'succeeded' && Number(ch.amount || 0) > 0
                );
                if (paid.length > 0) {
                  paid.sort((a, b) => (b.created || 0) - (a.created || 0));
                  const latest = paid[0];
                  chargeId = latest.id || chargeId;
                  paymentIntentId = latest.payment_intent || paymentIntentId;
                  if (row.payment_id) {
                    await run(
                      'UPDATE pagamentos SET stripe_payment_intent_id = ?, stripe_charge_id = ? WHERE id = ?',
                      [paymentIntentId || null, chargeId || null, row.payment_id]
                    );
                  }
                }
              }
            } catch (lookupErr) {
              console.error('Erro ao buscar charge por email:', lookupErr?.message || lookupErr);
            }
          }
        }

        if (!paymentIntentId && !chargeId) {
          skipped += 1;
          skippedDetails.push({ commission_id: row.commission_id, reason: 'missing_payment_intent' });
          continue;
        }

        const amountCents = Math.round(Number(row.commission_value || 0) * 100);
        let cappedCents = amountCents;

        if (paymentIntentId && paymentIntentId.startsWith("pi_")) {
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
          cappedCents = Math.min(amountCents, Number(pi.amount || 0));
          if (!chargeId) {
            chargeId = pi.latest_charge || null;
          }
        }

        if (!chargeId && paymentIntentId && paymentIntentId.startsWith("pi_")) {
          const charges = await stripe.charges.list({
            payment_intent: paymentIntentId,
            limit: 1,
          });
          chargeId = charges?.data?.[0]?.id || null;
        }

        if (!chargeId && invoiceChargeId) {
          chargeId = invoiceChargeId;
        }

        if (!chargeId || cappedCents <= 0) {
          skipped += 1;
          skippedDetails.push({ commission_id: row.commission_id, reason: 'missing_charge_or_amount' });
          continue;
        }

        const transfer = await stripe.transfers.create({
          amount: cappedCents,
          currency: 'brl',
          destination: user.stripe_account_id,
          source_transaction: chargeId,
          description: `Reprocessar comissão - ${user.email || row.id_afiliado}`,
          transfer_group: paymentIntentId || undefined,
        });

        await run(
          'UPDATE comissoes SET stripe_transfer_id = ?, data_atualizacao = CURRENT_TIMESTAMP WHERE id = ?',
          [transfer.id, row.commission_id]
        );

        success += 1;
      } catch (err) {
        failed += 1;
        errors.push({
          commission_id: row.commission_id,
          message: err?.message || 'erro',
        });
      }
    }

    return res.json({
      ok: true,
      total: rows.length,
      success,
      failed,
      skipped,
      skipped_details: skippedDetails,
      errors,
    });
  } catch (error) {
    console.error('Erro ao reprocessar transfers:', error);
    return res.status(500).json({ message: 'Erro interno do servidor.' });
  }
};

/**
 * (Admin) Limpa o stripe_account_id de um usuário para forçar novo onboarding.
 */
export const resetStripeConnectAccount = async (req, res) => {
  const { userId } = req.params;
  if (!userId || isNaN(Number(userId))) {
    return res.status(400).json({ message: "userId inválido." });
  }

  try {
    const [rows] = await db.query(
      "SELECT stripe_account_id, email FROM usuarios WHERE id = ?",
      [userId]
    );
    if (!rows.length) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    const oldId = rows[0].stripe_account_id || null;
    await db.query("UPDATE usuarios SET stripe_account_id = NULL WHERE id = ?", [userId]);

    return res.json({
      ok: true,
      userId: Number(userId),
      email: rows[0].email,
      previous_stripe_account_id: oldId,
    });
  } catch (error) {
    console.error("Erro ao resetar Stripe Connect:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};
