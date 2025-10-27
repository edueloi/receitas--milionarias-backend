import express from "express";
import { getStripeDashboardData } from "../controllers/stripeDashboardController.js";
import { createCheckoutSession, onboardUser } from "../controllers/stripeController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();
router.get("/stripe-dashboard-data", getStripeDashboardData);
router.post("/create-checkout-session", createCheckoutSession);
router.post("/stripe/connect/onboard-user", authMiddleware, onboardUser);

export default router;
