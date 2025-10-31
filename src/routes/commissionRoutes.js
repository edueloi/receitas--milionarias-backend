import express from 'express';
import * as commissionController from '../controllers/commissionController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Listar comissões (admin vê todas, afiliado vê apenas as suas)
router.get('/commissions', authMiddleware, commissionController.getCommissions);

// Resumo estatístico de comissões
router.get('/commissions/summary', authMiddleware, commissionController.getCommissionsSummary);

// Listar minhas indicações (usuários que cadastrei)
router.get('/commissions/referrals', authMiddleware, commissionController.getMyReferrals);

export default router;
