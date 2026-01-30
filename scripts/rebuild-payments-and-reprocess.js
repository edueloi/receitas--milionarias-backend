// scripts/rebuild-payments-and-reprocess.js
import Stripe from "stripe";
import "../config-loader.js";
import db from "../src/config/db.js";
import { all, get, run } from "../src/config/commissionPaymentsDb.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const toSqliteDateTime = (unixSeconds) => {
  const d = new Date(unixSeconds * 1000);
  return d.toISOString().replace("T", " ").slice(0, 19);
};

const findLatestPaidCharge = async (customerId) => {
  const charges = await stripe.charges.list({ customer: customerId, limit: 20 });
  const paid = (charges?.data || []).filter(
    (ch) => ch.paid && ch.status === "succeeded" && Number(ch.amount || 0) > 0
  );
  if (!paid.length) return null;
  paid.sort((a, b) => (b.created || 0) - (a.created || 0));
  return paid[0];
};

const upsertPaymentByCharge = async ({ userId, charge }) => {
  const paymentIntentId = charge.payment_intent || null;
  const chargeId = charge.id;
  const existing =
    (paymentIntentId
      ? await get(
          "SELECT id FROM pagamentos WHERE stripe_payment_intent_id = ? LIMIT 1",
          [paymentIntentId]
        )
      : null) ||
    (chargeId
      ? await get(
          "SELECT id FROM pagamentos WHERE stripe_charge_id = ? LIMIT 1",
          [chargeId]
        )
      : null);

  if (existing?.id) return existing.id;

  const paymentResult = await run(
    `INSERT INTO pagamentos
     (id_usuario, id_pagamento_gateway, valor, status, metodo_pagamento,
      data_pagamento, fonte, stripe_payment_intent_id, stripe_charge_id, metadata_json)
     VALUES (?, ?, ?, 'aprovado', 'card', ?, 'stripe', ?, ?, ?)`,
    [
      userId,
      chargeId,
      Number(charge.amount || 0) / 100,
      toSqliteDateTime(charge.created),
      paymentIntentId,
      chargeId,
      JSON.stringify({ charge_id: chargeId, customer: charge.customer || "" }),
    ]
  );

  return paymentResult.lastID;
};

const linkCommissionsToPayment = async (userId, paymentId) => {
  await run(
    `UPDATE comissoes
     SET id_pagamento_origem = ?, fonte = 'stripe', data_atualizacao = CURRENT_TIMESTAMP
     WHERE id_usuario_pagador = ? AND id_pagamento_origem IS NULL`,
    [paymentId, userId]
  );
};

const rebuildPaymentsFromStripe = async () => {
  const pendingPayers = await all(
    "SELECT DISTINCT id_usuario_pagador AS user_id FROM comissoes WHERE id_pagamento_origem IS NULL"
  );

  if (!pendingPayers.length) {
    console.log("Nenhuma comissão pendente sem pagamento vinculado.");
    return;
  }

  const ids = pendingPayers.map((p) => p.user_id);
  const placeholders = ids.map(() => "?").join(",");
  const [users] = await db.query(
    `SELECT id, email FROM usuarios WHERE id IN (${placeholders})`,
    ids
  );
  const usersMap = new Map(users.map((u) => [u.id, u]));

  let linked = 0;
  let skipped = 0;

  for (const payer of pendingPayers) {
    const user = usersMap.get(payer.user_id);
    if (!user?.email) {
      skipped += 1;
      continue;
    }

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers?.data?.[0]?.id;
    if (!customerId) {
      skipped += 1;
      continue;
    }

    const charge = await findLatestPaidCharge(customerId);
    if (!charge) {
      skipped += 1;
      continue;
    }

    const paymentId = await upsertPaymentByCharge({ userId: user.id, charge });
    await linkCommissionsToPayment(user.id, paymentId);
    linked += 1;
  }

  console.log(`Pagamentos vinculados: ${linked} | Pulados: ${skipped}`);
};

const reprocessTransfers = async () => {
  const rows = await all(
    `SELECT 
        c.id AS commission_id,
        c.valor AS commission_value,
        c.id_afiliado,
        c.stripe_transfer_id,
        c.status,
        c.fonte,
        p.stripe_payment_intent_id,
        p.stripe_charge_id
     FROM comissoes c
     JOIN pagamentos p ON c.id_pagamento_origem = p.id
     WHERE (c.fonte = 'stripe' OR c.fonte IS NULL)
       AND (c.stripe_transfer_id IS NULL OR c.stripe_transfer_id = '')
       AND (p.stripe_payment_intent_id IS NOT NULL OR p.stripe_charge_id IS NOT NULL)
       AND c.valor > 0
     ORDER BY c.id DESC`
  );

  if (!rows.length) {
    console.log("Nenhuma comissão elegível para reprocesso.");
    return;
  }

  const affiliateIds = rows.map((r) => r.id_afiliado);
  const placeholders = affiliateIds.map(() => "?").join(",");
  const [affiliates] = await db.query(
    `SELECT id, stripe_account_id, email, id_status FROM usuarios WHERE id IN (${placeholders})`,
    affiliateIds
  );
  const affMap = new Map(affiliates.map((a) => [a.id, a]));

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      const affiliate = affMap.get(row.id_afiliado);
      if (!affiliate?.stripe_account_id || Number(affiliate.id_status) !== 1) {
        skipped += 1;
        continue;
      }

      const account = await stripe.accounts.retrieve(affiliate.stripe_account_id);
      if (!account.payouts_enabled) {
        skipped += 1;
        continue;
      }

      let paymentIntentId = row.stripe_payment_intent_id;
      let chargeId = row.stripe_charge_id || null;
      let cappedCents = Math.round(Number(row.commission_value || 0) * 100);

      if (paymentIntentId && paymentIntentId.startsWith("pi_")) {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        cappedCents = Math.min(cappedCents, Number(pi.amount || 0));
        if (!chargeId) chargeId = pi.latest_charge || null;
      }

      if (!chargeId || cappedCents <= 0) {
        skipped += 1;
        continue;
      }

      const transfer = await stripe.transfers.create({
        amount: cappedCents,
        currency: "brl",
        destination: affiliate.stripe_account_id,
        source_transaction: chargeId,
        description: `Reprocessar comissão - ${affiliate.email || affiliate.id}`,
        transfer_group: paymentIntentId || undefined,
      });

      await run(
        "UPDATE comissoes SET stripe_transfer_id = ?, data_atualizacao = CURRENT_TIMESTAMP WHERE id = ?",
        [transfer.id, row.commission_id]
      );

      success += 1;
    } catch (err) {
      failed += 1;
      console.error("Erro ao reprocessar comissão:", row.commission_id, err?.message || err);
    }
  }

  console.log(`Reprocesso finalizado. Sucesso: ${success} | Falha: ${failed} | Pulados: ${skipped}`);
};

const main = async () => {
  await rebuildPaymentsFromStripe();
  await reprocessTransfers();
  process.exit(0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
