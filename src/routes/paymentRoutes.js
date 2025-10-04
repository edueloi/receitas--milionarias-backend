import { Router } from 'express';
import { createCheckoutSession } from '../controllers/paymentController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

// Rota para criar uma sessão de checkout do Stripe
// O authMiddleware garante que apenas usuários logados possam acessar esta rota
router.post('/create-checkout-session', authMiddleware, createCheckoutSession);

export default router;