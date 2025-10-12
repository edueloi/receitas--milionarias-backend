// src/routes/dashboardRoutes.js
import express from 'express';
import { getDashboardData } from '../controllers/dashboardController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * /dashboard-data:
 *   get:
 *     summary: Retorna dados agregados para o painel financeiro
 *     tags: [Dashboard]
 *     description: Busca dados do Stripe e do banco de dados local para popular o painel financeiro. Requer autenticação.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [day, 7d, 30d, all]
 *           default: 7d
 *         description: O intervalo de tempo para filtrar os dados (Hoje, Últimos 7 dias, Últimos 30 dias, Tudo).
 *     responses:
 *       200:
 *         description: Dados do painel retornados com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 period: { type: string, example: '7d' }
 *                 total: { type: object }
 *                 balance: { type: object }
 *                 counts: { type: object }
 *                 pagamentos: { type: array, items: { type: object } }
 *                 clientes: { type: array, items: { type: object } }
 *       500:
 *         description: Erro interno no servidor.
 */
router.get('/dashboard-data', authMiddleware, getDashboardData);

export default router;
