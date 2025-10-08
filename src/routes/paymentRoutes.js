import express from 'express';
import * as paymentController from '../controllers/paymentController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Criar assinatura
router.post('/payments/create-subscription', authMiddleware, paymentController.createSubscription);

// Webhook (sem auth)
router.post('/payments/webhook', paymentController.handleWebhook);

export default router;
