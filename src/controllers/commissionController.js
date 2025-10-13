import db from '../config/db.js';

// Histórico de comissões + saldos
export const getCommissions = async (req, res) => {
  const affiliateId = req.user?.id;
  if (!affiliateId) return res.status(401).json({ error: 'Não autenticado.' });

  console.log("User role:", req.user.role);

  try {
    let commissions;
    if (req.user.role === 1) {
      [commissions] = await db.query(
        `SELECT c.*, u.nome as nome_pagador
         FROM comissoes c
         JOIN usuarios u ON c.id_usuario_pagador = u.id
         ORDER BY c.data_criacao DESC`
      );
    } else {
      [commissions] = await db.query(
        `SELECT c.*, u.nome as nome_pagador
         FROM comissoes c
         JOIN usuarios u ON c.id_usuario_pagador = u.id
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

// --- Atualiza comissões pendentes para 'disponivel' quando chegar a data_liberacao
export const updatePendingCommissions = async () => {
  try {
    const [result] = await db.query(
      `
      UPDATE comissoes
         SET status = 'disponivel'
       WHERE status = 'pendente'
         AND data_liberacao <= NOW()
      `
    );
    console.log(`${result.affectedRows} comissões foram atualizadas para 'disponivel'.`);
  } catch (error) {
    console.error('Erro ao atualizar comissões pendentes:', error);
  }
};


const calculateBalances = async (user) => {
  if (user.role === 1) {
    const [rows] = await db.query(
      `SELECT 
          COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END), 0) AS saldo_pendente,
          COALESCE(SUM(CASE WHEN status = 'disponivel' THEN valor ELSE 0 END), 0) AS saldo_disponivel
       FROM comissoes`
    );
    return rows[0];
  } else {
    const [rows] = await db.query(
      `SELECT 
          COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END), 0) AS saldo_pendente,
          COALESCE(SUM(CASE WHEN status = 'disponivel' THEN valor ELSE 0 END), 0) AS saldo_disponivel
       FROM comissoes 
       WHERE id_afiliado = ?`,
      [user.id]
    );
    return rows[0];
  }
};
