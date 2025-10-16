// src/routes/walletRoutes.js
import express from 'express';
import { getBalance } from '../controllers/walletController.js';

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

router.get('/test', (_req, res) => {
  res.json({ message: 'Wallet test route is working!' });
});

export default router;
