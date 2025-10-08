import express from 'express';
import * as commissionController from '../controllers/commissionController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/commissions', authMiddleware, commissionController.getCommissions);

export default router;
