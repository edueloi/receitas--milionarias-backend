// src/controllers/adminController.js
import db from '../config/db.js';

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
