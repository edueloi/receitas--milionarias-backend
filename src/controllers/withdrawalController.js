// src/controllers/withdrawalController.js
import db from '../config/db.js';

/**
 * (User) Solicita um saque do seu saldo disponível.
 */
export const requestWithdrawal = async (req, res) => {
  const userId = req.user.id;
  const { amount } = req.body;

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return res.status(400).json({ message: 'O valor do saque deve ser um número positivo.' });
  }

  const parsedAmount = parseFloat(amount);
  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 1. Buscar usuário, saldo e chave pix (com lock para a transação)
    const [userRows] = await connection.query(
      'SELECT saldo_disponivel, chave_pix FROM usuarios WHERE id = ? FOR UPDATE',
      [userId]
    );

    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    const user = userRows[0];

    // 2. Verificar se tem chave PIX
    if (!user.chave_pix) {
      await connection.rollback();
      return res.status(400).json({ message: 'Você precisa cadastrar uma chave PIX no seu perfil antes de solicitar um saque.' });
    }

    // 3. Verificar se o saldo é suficiente
    if (user.saldo_disponivel < parsedAmount) {
      await connection.rollback();
      return res.status(400).json({ message: 'Saldo disponível insuficiente.' });
    }

    // 4. Debitar o saldo do usuário
    await connection.query(
      'UPDATE usuarios SET saldo_disponivel = saldo_disponivel - ? WHERE id = ?',
      [parsedAmount, userId]
    );

    // 5. Inserir o registro de saque
    const [withdrawalResult] = await connection.query(
      'INSERT INTO saques (id_usuario, valor, status, chave_pix_usada) VALUES (?, ?, ?, ?)',
      [userId, parsedAmount, 'pendente', user.chave_pix]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Solicitação de saque enviada com sucesso!',
      withdrawalId: withdrawalResult.insertId
    });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Erro ao solicitar saque:', error);
    res.status(500).json({ message: 'Erro interno do servidor ao processar a solicitação.' });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * (User) Lista os saques do usuário logado.
 */
export const getWithdrawals = async (req, res) => {
  const userId = req.user.id;

  try {
    const [withdrawals] = await db.query(
      'SELECT id, valor, status, data_solicitacao, data_atualizacao FROM saques WHERE id_usuario = ? ORDER BY data_solicitacao DESC',
      [userId]
    );
    res.json(withdrawals);
  } catch (error) {
    console.error('Erro ao buscar histórico de saques:', error);
    res.status(500).json({ message: 'Erro interno ao buscar histórico de saques.' });
  }
};
