import express from "express";
import {
  validateAffiliateProInvite,
  registerAffiliatePro,
  declineAffiliatePro,
} from "../controllers/affiliateProController.js";

const router = express.Router();

router.get("/affiliate-pro/invite", validateAffiliateProInvite);
router.post("/affiliate-pro/register", registerAffiliatePro);
router.post("/affiliate-pro/decline", declineAffiliatePro);

export default router;
