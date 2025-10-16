// src/routes/walletRoutes.js
import express from 'express';
import { getBalance, getUserBalances } from '../controllers/walletController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Carteira
 *   description: Endpoints para gerenciar a carteira do usuário
 */

/**
 * @swagger
 * /wallet/balance:
 *   get:
 *     summary: Consulta o saldo (público)
 *     tags: [Carteira]
 *     parameters:
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *           enum: [stripe, db]
 *         description: "Fonte do saldo; padrão: stripe se houver STRIPE_SECRET_KEY, senão db"
 *       - in: query
 *         name: userId
 *         schema:
 *           type: integer
 *         description: "(quando source=db) Id do usuário para consultar saldo no banco"
 *     responses:
 *       200:
 *         description: "Saldo"
 */
router.get('/balance', getBalance);

/**
 * @swagger
 * /wallet/me/balances:
 *   get:
 *     summary: Consulta os saldos do usuário logado
 *     tags: [Carteira]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saldos do usuário
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 saldo_disponivel:
 *                   type: number
 *                   format: float
 *                 saldo_pendente:
 *                   type: number
 *                   format: float
 *       401:
 *         description: Não autorizado
 *       404:
 *         description: Usuário não encontrado
 */
router.get('/me/balances', authMiddleware, getUserBalances);

router.get('/test', (_req, res) => {
  res.json({ message: 'Wallet test route is working!' });
});

export default router;
