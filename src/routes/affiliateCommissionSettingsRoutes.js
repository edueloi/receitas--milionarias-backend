// src/routes/affiliateCommissionSettingsRoutes.js
import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminMiddleware } from "../middleware/adminMiddleware.js";
import {
  fetchCommissionSettings,
  fetchCommissionSettingsByRole,
  updateCommissionSettings,
} from "../controllers/affiliateCommissionSettingsController.js";

const router = Router();

router.get(
  "/affiliate-commission-settings",
  authMiddleware,
  adminMiddleware,
  fetchCommissionSettings
);

router.get(
  "/affiliate-commission-settings/:role",
  authMiddleware,
  adminMiddleware,
  fetchCommissionSettingsByRole
);

router.put(
  "/affiliate-commission-settings/:role",
  authMiddleware,
  adminMiddleware,
  updateCommissionSettings
);

export default router;
