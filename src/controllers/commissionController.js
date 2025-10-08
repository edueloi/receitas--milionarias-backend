import db from '../config/db.js';

// Histórico de comissões + saldos
export const getCommissions = async (req, res) => {
  const affiliateId = req.user?.id;
  if (!affiliateId) return res.status(401).json({ error: 'Não autenticado.' });

  try {
    const [commissions] = await db.query(
      'SELECT * FROM comissoes WHERE id_afiliado = ? ORDER BY data_criacao DESC',
      [affiliateId]
    );

    const balances = await calculateBalances(affiliateId);

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


const calculateBalances = async (affiliateId) => {
  const [rows] = await db.query(
    `SELECT 
        COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END), 0) AS saldo_pendente,
        COALESCE(SUM(CASE WHEN status = 'disponivel' THEN valor ELSE 0 END), 0) AS saldo_disponivel
     FROM comissoes 
     WHERE id_afiliado = ?`,
    [affiliateId]
  );
  return rows[0];
};
