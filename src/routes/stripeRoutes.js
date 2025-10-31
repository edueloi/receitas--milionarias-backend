import express from "express";
import { getStripeDashboardData } from "../controllers/stripeDashboardController.js";
import { createCheckoutSession, onboardUser, getConnectedAccount } from "../controllers/stripeController.js";
import { handleStripeWebhook } from "../controllers/stripeWebhookController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Webhook do Stripe (sem auth - Stripe envia requests)
// IMPORTANTE: Esta rota precisa receber raw body, não JSON parsed
router.post("/webhook", express.raw({ type: 'application/json' }), handleStripeWebhook);

// Rotas protegidas
router.get("/stripe-dashboard-data", authMiddleware, getStripeDashboardData);
router.post("/create-checkout-session", createCheckoutSession);
router.post("/stripe/connect/onboard-user", authMiddleware, onboardUser);
router.get("/stripe/connect/account", authMiddleware, getConnectedAccount);

export default router;
