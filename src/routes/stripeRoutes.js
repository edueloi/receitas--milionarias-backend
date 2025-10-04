// src/routes/stripeRoutes.js
import express from "express";
import {
  createAffiliateAccount,
  createCheckoutSession,
} from "../controllers/stripeController.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Pagamentos
 *   description: Endpoints para integração de pagamentos com Stripe.
 */

/**
 * @swagger
 * /create-affiliate-account:
 *   post:
 *     summary: Cria uma nova conta de afiliado no Stripe
 *     tags: [Pagamentos]
 *     description: Cria uma Conta Conectada Express no Stripe para um usuário se tornar um afiliado e receber transferências.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userEmail:
 *                 type: string
 *                 description: O email do usuário que está se tornando um afiliado.
 *                 example: "afiliado@example.com"
 *               userId:
 *                 type: string
 *                 description: O ID do usuário no seu sistema.
 *                 example: "user_12345"
 *             required:
 *               - userEmail
 *               - userId
 *     responses:
 *       '200':
 *         description: URL de onboarding do Stripe gerada com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   format: url
 *                   description: A URL para onde o usuário deve ser redirecionado para completar o cadastro no Stripe.
 *       '500':
 *         description: Erro interno no servidor.
 */
router.post("/create-affiliate-account", createAffiliateAccount);

/**
 * @swagger
 * /create-checkout-session:
 *   post:
 *     summary: Cria uma sessão de checkout no Stripe para uma assinatura
 *     tags: [Pagamentos]
 *     description: Cria uma sessão de pagamento no Stripe para um cliente final assinar um plano.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 description: O email do cliente final.
 *                 example: "cliente@example.com"
 *               firstName:
 *                 type: string
 *                 description: O primeiro nome do cliente.
 *                 example: "João"
 *               lastName:
 *                 type: string
 *                 description: O sobrenome do cliente.
 *                 example: "Silva"
 *               affiliateId:
 *                 type: string
 *                 description: (Opcional) O ID do afiliado que indicou esta compra.
 *                 example: "afiliado_abc"
 *             required:
 *               - email
 *     responses:
 *       '200':
 *         description: ID da sessão de checkout do Stripe.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: O ID da sessão de checkout criada.
 *       '500':
 *         description: Erro interno no servidor.
 */
router.post("/create-checkout-session", createCheckoutSession);

export default router;