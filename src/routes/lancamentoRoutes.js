import express from 'express';
import { capturarLead, listarLeads, exportarLeads } from '../controllers/lancamentoController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @route POST /api/lancamento/lead
 * @desc Captura lead da página de lançamento
 * @access Public
 */
router.post('/api/lancamento/lead', capturarLead);

/**
 * @route GET /api/lancamento/leads
 * @desc Lista todos os leads (admin apenas)
 * @access Private/Admin
 */
router.get('/api/lancamento/leads', authMiddleware, listarLeads);

/**
 * @route GET /api/lancamento/leads/export
 * @desc Exporta leads para CSV (admin apenas)
 * @access Private/Admin
 */
router.get('/api/lancamento/leads/export', authMiddleware, exportarLeads);

export default router;

