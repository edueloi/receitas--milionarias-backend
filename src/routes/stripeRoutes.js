import express from "express";
import { getStripeDashboardData } from "../controllers/stripeDashboardController.js";
import { createCheckoutSession, onboardUser, getConnectedAccount } from "../controllers/stripeController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();
// Protege a rota para que possamos filtrar por usuário quando necessário
router.get("/stripe-dashboard-data", authMiddleware, getStripeDashboardData);
router.post("/create-checkout-session", createCheckoutSession);
router.post("/stripe/connect/onboard-user", authMiddleware, onboardUser);
router.get("/stripe/connect/account", authMiddleware, getConnectedAccount);

export default router;
