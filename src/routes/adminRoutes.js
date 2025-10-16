// src/routes/adminRoutes.js
import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { adminMiddleware } from '../middleware/adminMiddleware.js';
import { releasePendingBalance, listWithdrawalRequests, processWithdrawalRequest } from '../controllers/adminController.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Endpoints exclusivos para administradores
 */

/**
 * @swagger
 * /admin/release-balance:
 *   post:
 *     summary: (Admin) Libera o saldo pendente de um usuário
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - amount
 *             properties:
 *               userId:
 *                 type: integer
 *                 description: ID do usuário que receberá o saldo.
 *               amount:
 *                 type: number
 *                 format: float
 *                 description: O valor a ser movido do saldo pendente para o disponível.
 *     responses:
 *       200:
 *         description: Saldo liberado com sucesso.
 *       400:
 *         description: Dados inválidos ou saldo pendente insuficiente.
 *       401:
 *         description: Não autorizado (token não fornecido).
 *       403:
 *         description: Acesso negado (não é um administrador).
 *       404:
 *         description: Usuário não encontrado.
 */
router.post('/admin/release-balance', authMiddleware, adminMiddleware, releasePendingBalance);

/**
 * @swagger
 * /admin/withdrawals:
 *   get:
 *     summary: (Admin) Lista as solicitações de saque
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pendente, aprovado, rejeitado]
 *         description: Filtra as solicitações pelo status.
 *     responses:
 *       200:
 *         description: Lista de solicitações de saque.
 *       401:
 *         description: Não autorizado.
 *       403:
 *         description: Acesso negado.
 */
router.get('/admin/withdrawals', authMiddleware, adminMiddleware, listWithdrawalRequests);

/**
 * @swagger
 * /admin/withdrawals/{withdrawalId}/process:
 *   post:
 *     summary: (Admin) Aprova ou rejeita uma solicitação de saque
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: withdrawalId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da solicitação de saque.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [aprovado, rejeitado]
 *                 description: O novo status da solicitação.
 *     responses:
 *       200:
 *         description: Solicitação processada com sucesso.
 *       400:
 *         description: Status inválido ou a solicitação já foi processada.
 *       404:
 *         description: Solicitação de saque não encontrada.
 */
router.post('/admin/withdrawals/:withdrawalId/process', authMiddleware, adminMiddleware, processWithdrawalRequest);

export default router;
