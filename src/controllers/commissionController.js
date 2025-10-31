import db from '../config/db.js';

// Histórico de comissões + saldos
export const getCommissions = async (req, res) => {
  const affiliateId = req.user?.id;
  if (!affiliateId) return res.status(401).json({ error: 'Não autenticado.' });

  console.log("User role:", req.user.role);

  try {
    let commissions;
    if (req.user.role === 1) {
      // Admin vê todas as comissões
      [commissions] = await db.query(
        `SELECT 
          c.*,
          u_pagador.nome as nome_pagador,
          u_pagador.email as email_pagador,
          u_afiliado.nome as nome_afiliado,
          u_afiliado.email as email_afiliado,
          u_afiliado.codigo_afiliado_proprio as codigo_afiliado,
          p.stripe_payment_intent_id,
          p.valor as valor_pagamento_total
         FROM comissoes c
         JOIN usuarios u_pagador ON c.id_usuario_pagador = u_pagador.id
         JOIN usuarios u_afiliado ON c.id_afiliado = u_afiliado.id
         LEFT JOIN pagamentos p ON c.id_pagamento_origem = p.id
         ORDER BY c.data_criacao DESC
         LIMIT 1000`
      );
    } else {
      // Afiliado vê apenas suas comissões
      [commissions] = await db.query(
        `SELECT 
          c.*,
          u.nome as nome_pagador,
          u.email as email_pagador,
          p.stripe_payment_intent_id,
          p.valor as valor_pagamento_total
         FROM comissoes c
         JOIN usuarios u ON c.id_usuario_pagador = u.id
         LEFT JOIN pagamentos p ON c.id_pagamento_origem = p.id
         WHERE c.id_afiliado = ?
         ORDER BY c.data_criacao DESC`,
        [affiliateId]
      );
    }

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

    const [summary] = await db.query(query, params);

    return res.json(summary[0]);
  } catch (error) {
    console.error('Erro ao buscar resumo de comissões:', error);
    return res.status(500).json({ error: 'Erro interno ao buscar resumo.' });
  }
};

// Atualiza comissões pendentes para 'disponivel' quando chegar a data_liberacao
export const updatePendingCommissions = async () => {
  try {
    const [result] = await db.query(
      `UPDATE comissoes
       SET status = 'disponivel'
       WHERE status = 'pendente'
       AND data_liberacao <= NOW()`
    );
    console.log(`${result.affectedRows} comissões foram atualizadas para 'disponivel'.`);
    return result.affectedRows;
  } catch (error) {
    console.error('Erro ao atualizar comissões pendentes:', error);
    throw error;
  }
};

// Calcula saldos do usuário
const calculateBalances = async (user) => {
  if (user.role === 1) {
    // Admin vê saldos totais do sistema
    const [rows] = await db.query(
      `SELECT 
          COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END), 0) AS saldo_pendente,
          COALESCE(SUM(CASE WHEN status = 'disponivel' THEN valor ELSE 0 END), 0) AS saldo_disponivel,
          COALESCE(SUM(CASE WHEN status = 'paga' THEN valor ELSE 0 END), 0) AS total_pago
       FROM comissoes`
    );
    return rows[0];
  } else {
    // Usuário comum vê apenas seus saldos
    const [rows] = await db.query(
      `SELECT 
          COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END), 0) AS saldo_pendente,
          COALESCE(SUM(CASE WHEN status = 'disponivel' THEN valor ELSE 0 END), 0) AS saldo_disponivel,
          COALESCE(SUM(CASE WHEN status = 'paga' THEN valor ELSE 0 END), 0) AS total_pago
       FROM comissoes 
       WHERE id_afiliado = ?`,
      [user.id]
    );
    return rows[0];
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
        COALESCE(SUM(c.valor), 0) as total_comissoes,
        COUNT(c.id) as quantidade_comissoes
       FROM usuarios u
       LEFT JOIN comissoes c ON c.id_usuario_pagador = u.id AND c.id_afiliado = ?
       LEFT JOIN status_usuarios s ON u.id_status = s.id
       WHERE u.id_afiliado_indicador = ?
       GROUP BY u.id
       ORDER BY u.data_criacao DESC`,
      [affiliateId, affiliateId]
    );

    return res.json(referrals);
  } catch (error) {
    console.error('Erro ao buscar indicações:', error);
    return res.status(500).json({ error: 'Erro interno ao buscar indicações.' });
  }
};
