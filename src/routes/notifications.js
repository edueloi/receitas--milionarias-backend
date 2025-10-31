// src/routes/notifications.js
import express from 'express';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createNotification,
} from '../controllers/notificationsController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authMiddleware);

// GET /api/notifications - Listar notificações do usuário
router.get('/', getNotifications);

// PUT /api/notifications/:id/read - Marcar como lida
router.put('/:id/read', markAsRead);

// PUT /api/notifications/read-all - Marcar todas como lidas
router.put('/read-all', markAllAsRead);

// DELETE /api/notifications/:id - Deletar notificação
router.delete('/:id', deleteNotification);

// POST /api/notifications - Criar notificação (admin only - pode adicionar middleware)
router.post('/', createNotification);

export default router;
