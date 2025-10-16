// src/routes/payoutRoutes.js
import express from 'express';
import {
    createStripeConnectedAccount,
    createPayout
} from '../controllers/payoutController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Pagamentos
 *   description: Endpoints para gerenciar pagamentos e saques
 */

/**
 * @swagger
 * /payouts/stripe-connect:
 *   post:
 *     summary: Cria uma conta conectada do Stripe para o usuário logado
 *     tags: [Pagamentos]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200: { description: 'URL de onboarding do Stripe' }
 */
router.post('/stripe-connect', authMiddleware, createStripeConnectedAccount);

/**
 * @swagger
 * /payouts:
 *   post:
 *     summary: (Admin) Cria um novo pagamento para um afiliado
 *     tags: [Pagamentos]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount: { type: number }
 *               affiliateId: { type: number }
 *     responses:
 *       200: { description: 'Pagamento realizado com sucesso' }
 */
router.post('/', authMiddleware, createPayout);

export default router;
