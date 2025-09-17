// src/routes/userPreferenceRoutes.js
import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { getUserPreferences, setUserPreference } from '../controllers/userPreferenceController.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Preferências do Usuário
 *   description: Endpoints para gerenciar as preferências do usuário logado
 */

/**
 * @swagger
 * /users/me/preferences:
 *   get:
 *     summary: Retorna todas as preferências do usuário logado
 *     tags: [Preferências do Usuário]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Um objeto com as preferências do usuário
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 theme: 'dark'
 *                 notifications: 'enabled'
 *       401:
 *         description: Não autorizado
 */
router.get('/users/me/preferences', authMiddleware, getUserPreferences);

/**
 * @swagger
 * /users/me/preferences:
 *   post:
 *     summary: Salva ou atualiza uma preferência para o usuário logado
 *     tags: [Preferências do Usuário]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - preferencia_chave
 *             properties:
 *               preferencia_chave: { type: string, example: 'theme' }
 *               preferencia_valor: { type: string, example: 'dark' }
 *     responses:
 *       200:
 *         description: Preferência salva com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autorizado
 */
router.post('/users/me/preferences', authMiddleware, setUserPreference);

export default router;
