import db from '../config/db.js';
import { all, get, run } from '../config/commissionPaymentsDb.js';

const fetchUsersByIds = async (ids) => {
  const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (uniqueIds.length === 0) return new Map();

  const placeholders = uniqueIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT id, nome, email, codigo_afiliado_proprio, id_status FROM usuarios WHERE id IN (${placeholders})`,
    uniqueIds
  );
  return new Map(rows.map((row) => [row.id, row]));
};

const fetchPaymentsByIds = async (ids) => {
  const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (uniqueIds.length === 0) return new Map();

  const placeholders = uniqueIds.map(() => '?').join(',');
  const payments = await all(
    `SELECT id, stripe_payment_intent_id, valor FROM pagamentos WHERE id IN (${placeholders})`,
    uniqueIds
  );
  return new Map(payments.map((row) => [row.id, row]));
};

// Histórico de comissões + saldos
export const getCommissions = async (req, res) => {
  const affiliateId = req.user?.id;
  if (!affiliateId) return res.status(401).json({ error: 'Não autenticado.' });

  console.log("User role:", req.user.role);

  try {
    let commissions = [];
    if (req.user.role === 1) {
      commissions = await all(
        `SELECT *
         FROM comissoes
         ORDER BY datetime(data_criacao) DESC
         LIMIT 1000`
      );
    } else {
      commissions = await all(
        `SELECT *
         FROM comissoes
         WHERE id_afiliado = ?
         ORDER BY datetime(data_criacao) DESC`,
        [affiliateId]
      );
    }

    const pagadorIds = commissions.map((item) => item.id_usuario_pagador);
    const afiliadoIds = commissions.map((item) => item.id_afiliado);
    const pagamentoIds = commissions.map((item) => item.id_pagamento_origem);

    const usersMap = await fetchUsersByIds([...pagadorIds, ...afiliadoIds]);
    const paymentsMap = await fetchPaymentsByIds(pagamentoIds);

    commissions = commissions.map((commission) => {
      const pagador = usersMap.get(commission.id_usuario_pagador);
      const afiliado = usersMap.get(commission.id_afiliado);
      const pagamento = paymentsMap.get(commission.id_pagamento_origem);
      return {
        ...commission,
        nome_pagador: pagador?.nome || null,
        email_pagador: pagador?.email || null,
        nome_afiliado: afiliado?.nome || null,
        email_afiliado: afiliado?.email || null,
        codigo_afiliado: afiliado?.codigo_afiliado_proprio || null,
        stripe_payment_intent_id: pagamento?.stripe_payment_intent_id || null,
        valor_pagamento_total: pagamento?.valor ?? null,
      };
    });

    const balances = await calculateBalances(req.user);

    return res.json({ commissions, balances });
  } catch (error) {
    console.error('Erro ao buscar comissões:', error);
    return res.status(500).json({ error: 'Erro interno ao buscar dados.' });
  }
};

// Resumo estatístico de comissões
export const getCommissionsSummary = async (req, res) => {
  const affiliateId = req.user?.id;
  if (!affiliateId) return res.status(401).json({ error: 'Não autenticado.' });

  try {
    let query, params;
    
    if (req.user.role === 1) {
      // Admin vê estatísticas globais
      query = `
        SELECT 
          COUNT(*) as total_comissoes,
          COUNT(DISTINCT id_afiliado) as total_afiliados,
          COUNT(DISTINCT id_usuario_pagador) as total_pagadores,
          SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END) as total_pendente,
          SUM(CASE WHEN status = 'disponivel' THEN valor ELSE 0 END) as total_disponivel,
          SUM(CASE WHEN status = 'paga' THEN valor ELSE 0 END) as total_pago,
          SUM(valor) as total_geral,
          AVG(valor) as media_comissao
        FROM comissoes
      `;
      params = [];
    } else {
      // Afiliado vê suas estatísticas
      query = `
        SELECT 
          COUNT(*) as total_comissoes,
          COUNT(DISTINCT id_usuario_pagador) as total_indicacoes,
          SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END) as total_pendente,
          SUM(CASE WHEN status = 'disponivel' THEN valor ELSE 0 END) as total_disponivel,
          SUM(CASE WHEN status = 'paga' THEN valor ELSE 0 END) as total_pago,
          SUM(valor) as total_ganho
        FROM comissoes
        WHERE id_afiliado = ?
      `;
      params = [affiliateId];
    }

    const summary = await get(query, params);
    return res.json(summary || {});
  } catch (error) {
    console.error('Erro ao buscar resumo de comissões:', error);
    return res.status(500).json({ error: 'Erro interno ao buscar resumo.' });
  }
};

// Atualiza comissões pendentes para 'disponivel' quando chegar a data_liberacao
export const updatePendingCommissions = async () => {
  try {
    const result = await get(
      `SELECT COUNT(*) as total
       FROM comissoes
       WHERE status = 'pendente'
       AND date(data_liberacao) <= date('now')`
    );
    await run(
      `UPDATE comissoes
       SET status = 'disponivel',
           data_atualizacao = CURRENT_TIMESTAMP
       WHERE status = 'pendente'
       AND date(data_liberacao) <= date('now')`
    );
    const updated = Number(result?.total || 0);
    console.log(`${updated} comissões foram atualizadas para 'disponivel'.`);
    return updated;
  } catch (error) {
    console.error('Erro ao atualizar comissões pendentes:', error);
    throw error;
  }
};

// Calcula saldos do usuário
const calculateBalances = async (user) => {
  if (user.role === 1) {
    // Admin vê saldos totais do sistema
    const rows = await get(
      `SELECT 
          COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END), 0) AS saldo_pendente,
          COALESCE(SUM(CASE WHEN status = 'disponivel' THEN valor ELSE 0 END), 0) AS saldo_disponivel,
          COALESCE(SUM(CASE WHEN status = 'paga' THEN valor ELSE 0 END), 0) AS total_pago
       FROM comissoes`
    );
    return rows || {};
  } else {
    // Usuário comum vê apenas seus saldos
    const rows = await get(
      `SELECT 
          COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END), 0) AS saldo_pendente,
          COALESCE(SUM(CASE WHEN status = 'disponivel' THEN valor ELSE 0 END), 0) AS saldo_disponivel,
          COALESCE(SUM(CASE WHEN status = 'paga' THEN valor ELSE 0 END), 0) AS total_pago
       FROM comissoes 
       WHERE id_afiliado = ?`,
      [user.id]
    );
    return rows || {};
  }
};

// Listar indicações (usuários que foram indicados por este afiliado)
export const getMyReferrals = async (req, res) => {
  const affiliateId = req.user?.id;
  if (!affiliateId) return res.status(401).json({ error: 'Não autenticado.' });

  try {
    const [referrals] = await db.query(
      `SELECT 
        u.id,
        u.nome,
        u.sobrenome,
        u.email,
        u.data_criacao as data_cadastro,
        u.id_status,
        s.nome as status,
       FROM usuarios u
       LEFT JOIN status_usuarios s ON u.id_status = s.id
       WHERE u.id_afiliado_indicador = ?
       ORDER BY u.data_criacao DESC`,
      [affiliateId]
    );

    const referralIds = referrals.map((item) => item.id);
    const totalsMap = new Map();

    if (referralIds.length > 0) {
      const placeholders = referralIds.map(() => '?').join(',');
      const totals = await all(
        `SELECT 
          id_usuario_pagador,
          COALESCE(SUM(valor), 0) as total_comissoes,
          COUNT(id) as quantidade_comissoes
         FROM comissoes
         WHERE id_afiliado = ?
           AND id_usuario_pagador IN (${placeholders})
         GROUP BY id_usuario_pagador`,
        [affiliateId, ...referralIds]
      );
      totals.forEach((row) => totalsMap.set(row.id_usuario_pagador, row));
    }

    const response = referrals.map((ref) => {
      const totals = totalsMap.get(ref.id) || {};
      return {
        ...ref,
        total_comissoes: totals.total_comissoes || 0,
        quantidade_comissoes: totals.quantidade_comissoes || 0,
      };
    });

    return res.json(response);
  } catch (error) {
    console.error('Erro ao buscar indicações:', error);
    return res.status(500).json({ error: 'Erro interno ao buscar indicações.' });
  }
};
