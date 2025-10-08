import express from 'express';
import * as withdrawalController from '../controllers/withdrawalController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/withdrawals/request', authMiddleware, withdrawalController.requestWithdrawal);
router.get('/withdrawals', authMiddleware, withdrawalController.getWithdrawals);

export default router;
