import express from 'express';
import { requestWithdrawal, getWithdrawals } from '../controllers/withdrawalController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Saques
 *   description: Endpoints para solicitar e visualizar saques
 */

/**
 * @swagger
 * /withdrawals/request:
 *   post:
 *     summary: (User) Solicita um saque do saldo disponível
 *     tags: [Saques]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 format: float
 *                 description: O valor a ser sacado do saldo disponível.
 *     responses:
 *       201:
 *         description: Solicitação de saque enviada com sucesso.
 *       400:
 *         description: Valor inválido, saldo insuficiente ou chave PIX não cadastrada.
 *       401:
 *         description: Não autorizado.
 */
router.post('/withdrawals/request', authMiddleware, requestWithdrawal);

/**
 * @swagger
 * /withdrawals:
 *   get:
 *     summary: (User) Lista o histórico de saques do usuário logado
 *     tags: [Saques]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Uma lista de saques.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   valor:
 *                     type: number
 *                     format: float
 *                   status:
 *                     type: string
 *                     enum: [pendente, aprovado, rejeitado]
 *                   data_solicitacao:
 *                     type: string
 *                     format: date-time
 *       401:
 *         description: Não autorizado.
 */
router.get('/withdrawals', authMiddleware, getWithdrawals);

export default router;
