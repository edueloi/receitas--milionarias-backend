import express from "express";
import { getStripeDashboardData } from "../controllers/stripeDashboardController.js";
import { createCheckoutSession } from "../controllers/stripeController.js";

const router = express.Router();
router.get("/stripe-dashboard-data", getStripeDashboardData);
router.post("/create-checkout-session", createCheckoutSession);
export default router;
