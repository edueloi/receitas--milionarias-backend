// src/controllers/notificationsController.js
import db from '../config/db.js';

// Buscar todas as notificações do usuário
export const getNotifications = async (req, res) => {
  const userId = req.user.id;
  const { limit = 20, offset = 0, unreadOnly = false } = req.query;

  try {
    let query = `
      SELECT 
        id,
        tipo,
        titulo,
        mensagem,
        link,
        lida,
        created_at as createdAt
      FROM notificacoes
      WHERE user_id = ?
    `;

    const params = [userId];

    if (unreadOnly === 'true') {
      query += ' AND lida = FALSE';
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [notifications] = await db.query(query, params);

    // Buscar contagem de não lidas
    const [countResult] = await db.query(
      'SELECT COUNT(*) as unreadCount FROM notificacoes WHERE user_id = ? AND lida = FALSE',
      [userId]
    );

    res.json({
      notifications,
      unreadCount: countResult[0].unreadCount,
      total: notifications.length,
    });
  } catch (error) {
    console.error('Erro ao buscar notificações:', error);
    res.status(500).json({ message: 'Erro ao buscar notificações.' });
  }
};

// Marcar notificação como lida
export const markAsRead = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    await db.query(
      'UPDATE notificacoes SET lida = TRUE WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    res.json({ message: 'Notificação marcada como lida.' });
  } catch (error) {
    console.error('Erro ao marcar notificação como lida:', error);
    res.status(500).json({ message: 'Erro ao atualizar notificação.' });
  }
};

// Marcar todas as notificações como lidas
export const markAllAsRead = async (req, res) => {
  const userId = req.user.id;

  try {
    await db.query('UPDATE notificacoes SET lida = TRUE WHERE user_id = ? AND lida = FALSE', [
      userId,
    ]);

    res.json({ message: 'Todas as notificações marcadas como lidas.' });
  } catch (error) {
    console.error('Erro ao marcar todas as notificações como lidas:', error);
    res.status(500).json({ message: 'Erro ao atualizar notificações.' });
  }
};

// Deletar notificação
export const deleteNotification = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    await db.query('DELETE FROM notificacoes WHERE id = ? AND user_id = ?', [id, userId]);

    res.json({ message: 'Notificação deletada com sucesso.' });
  } catch (error) {
    console.error('Erro ao deletar notificação:', error);
    res.status(500).json({ message: 'Erro ao deletar notificação.' });
  }
};

// Criar nova notificação (para uso interno do sistema)
export const createNotification = async (req, res) => {
  const { userId, tipo, titulo, mensagem, link } = req.body;

  try {
    const [result] = await db.query(
      'INSERT INTO notificacoes (user_id, tipo, titulo, mensagem, link) VALUES (?, ?, ?, ?, ?)',
      [userId, tipo, titulo, mensagem, link || null]
    );

    res.status(201).json({
      message: 'Notificação criada com sucesso.',
      notificationId: result.insertId,
    });
  } catch (error) {
    console.error('Erro ao criar notificação:', error);
    res.status(500).json({ message: 'Erro ao criar notificação.' });
  }
};

// Função helper para criar notificação (não é rota, para uso interno)
export const createNotificationHelper = async (userId, tipo, titulo, mensagem, link = null) => {
  try {
    await db.query(
      'INSERT INTO notificacoes (user_id, tipo, titulo, mensagem, link) VALUES (?, ?, ?, ?, ?)',
      [userId, tipo, titulo, mensagem, link]
    );
    return true;
  } catch (error) {
    console.error('Erro ao criar notificação helper:', error);
    return false;
  }
};
