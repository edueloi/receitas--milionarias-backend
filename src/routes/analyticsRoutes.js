// src/routes/analyticsRoutes.js
import express from 'express';
import {
    createShareLink,
    trackVisit,
    getAffiliateStats
} from '../controllers/analyticsController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Analytics e Afiliados
 *   description: Endpoints para rastreamento de visitas e performance de afiliados
 */

/**
 * @swagger
 * /recipes/{recipeId}/share:
 *   post:
 *     summary: Cria um link de compartilhamento para uma receita
 *     tags: [Analytics e Afiliados]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - { in: path, name: recipeId, required: true, schema: { type: integer } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plataforma: { type: string, example: 'whatsapp' }
 *     responses:
 *       201: { description: 'Link de compartilhamento criado' }
 */
router.post('/recipes/:recipeId/share', authMiddleware, createShareLink);

/**
 * @swagger
 * /track-visit:
 *   post:
 *     summary: Registra uma visita a uma página
 *     tags: [Analytics e Afiliados]
 *     description: Endpoint para ser chamado pelo frontend para rastrear visualizações de página e referências.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url_visitada: { type: string, example: '/receitas/123' }
 *               codigo_afiliado: { type: string, example: 'afiliado_12345' }
 *               codigo_compartilhamento: { type: string, example: 'a1b2c3d4e5' }
 *     responses:
 *       201: { description: 'Visita registrada' }
 */
router.post('/track-visit', trackVisit); // Pode ser com ou sem auth, dependendo da estratégia

/**
 * @swagger
 * /affiliates/{affiliateId}/stats:
 *   get:
 *     summary: (Admin) Obtém estatísticas de um afiliado
 *     tags: [Analytics e Afiliados]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - { in: path, name: affiliateId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: 'Estatísticas do afiliado' }
 */
router.get('/affiliates/:affiliateId/stats', authMiddleware, getAffiliateStats);

export default router;
