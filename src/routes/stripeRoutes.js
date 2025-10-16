import express from "express";
import { getStripeDashboardData } from "../controllers/stripeDashboardController.js";

const router = express.Router();
router.get("/stripe-dashboard-data", getStripeDashboardData);
export default router;
