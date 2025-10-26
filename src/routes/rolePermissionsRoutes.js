// src/routes/rolePermissionsRoutes.js
import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { getRolePermissions, setRolePermissions } from '../controllers/rolePermissionsController.js';

const router = express.Router();

// Nota: A verificação se o usuário é admin ou não deve ser feita no frontend.
// O backend apenas garante que o usuário está logado.

/**
 * @swagger
 * /permissions/{role}:
 *   get:
 *     summary: Obtém as permissões de UI para uma role específica
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: role
 *         required: true
 *         schema:
 *           type: string
 *         description: A role para a qual as permissões são solicitadas.
 *     responses:
 *       200:
 *         description: Objeto JSON com as permissões da UI.
 */
router.get('/permissions/:role', authMiddleware, getRolePermissions);

/**
 * @swagger
 * /permissions/{role}:
 *   post:
 *     summary: Salva ou atualiza as permissões de UI para uma role específica
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: role
 *         required: true
 *         schema:
 *           type: string
 *         description: A role para a qual as permissões serão salvas.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Um objeto JSON representando as permissões.
 *             example:
 *               dashboard: true
 *               receitas: false
 *     responses:
 *       200:
 *         description: Permissões salvas com sucesso.
 */
router.post('/permissions/:role', authMiddleware, setRolePermissions);

export default router;
