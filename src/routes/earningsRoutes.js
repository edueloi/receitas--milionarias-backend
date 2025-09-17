// src/routes/earningsRoutes.js
import express from 'express';
import {
    addEarning,
    getEarningsHistory
} from '../controllers/earningsController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Ganhos e Financeiro
 *   description: Endpoints para gerenciar ganhos de afiliados e saldo
 */

/**
 * @swagger
 * /earnings:
 *   post:
 *     summary: (Protegido) Adiciona um novo registro de ganho
 *     tags: [Ganhos e Financeiro]
 *     description: >
 *       Endpoint para ser usado por um serviço externo (ex: webhook de pagamento)
 *       para registrar um ganho a um usuário.
 *     security: [ { bearerAuth: [] } ] # Em produção, usar uma API Key dedicada
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id_usuario: { type: integer }
 *               valor: { type: number, format: double }
 *               descricao: { type: string }
 *               origem_id: { type: string }
 *               status: { type: string, enum: ['pendente', 'disponivel', 'pago', 'cancelado', 'futuro'] }
 *               data_referencia: { type: string, format: date, example: '2025-09-15' }
 *     responses:
 *       201: { description: 'Ganho registrado com sucesso' }
 *   get:
 *     summary: Consulta o histórico de ganhos do usuário logado
 *     tags: [Ganhos e Financeiro]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: ['30d', '60d', '365d']
 *         description: Filtra o histórico por um período de tempo.
 *     responses:
 *       200: { description: 'Histórico de ganhos e totais' }
 */
router.route('/earnings')
    .post(authMiddleware, addEarning) // Proteger com chave de API em produção
    .get(authMiddleware, getEarningsHistory);

export default router;
