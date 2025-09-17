// src/routes/commentRoutes.js
import express from 'express';
import {
    addComment,
    getCommentsByRecipe,
    deleteComment
} from '../controllers/commentController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Comentários e Avaliações
 *   description: Gerenciamento de comentários e avaliações em receitas
 */

/**
 * @swagger
 * /recipes/{recipeId}/comments:
 *   post:
 *     summary: Adiciona um novo comentário ou avaliação a uma receita
 *     tags: [Comentários e Avaliações]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - { in: path, name: recipeId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               comentario: { type: string, example: 'Adorei a receita! Muito fácil de fazer.' }
 *               avaliacao: { type: integer, minimum: 1, maximum: 5, example: 5 }
 *               id_midia_anexo: { type: integer, description: 'ID de uma mídia previamente registrada.' }
 *               id_comentario_pai: { type: integer, description: 'ID do comentário que está sendo respondido.' }
 *     responses:
 *       201: { description: 'Comentário adicionado' }
 *   get:
 *     summary: Lista todos os comentários de uma receita
 *     tags: [Comentários e Avaliações]
 *     parameters:
 *       - { in: path, name: recipeId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: 'Lista de comentários, aninhados com respostas' }
 */
router.route('/recipes/:recipeId/comments')
    .post(authMiddleware, addComment)
    .get(getCommentsByRecipe);

/**
 * @swagger
 * /comments/{commentId}:
 *   delete:
 *     summary: Deleta um comentário
 *     tags: [Comentários e Avaliações]
 *     description: Permite que o autor do comentário ou um admin o delete.
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - { in: path, name: commentId, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: 'Comentário deletado' }
 *       403: { description: 'Não autorizado' }
 *       404: { description: 'Comentário não encontrado' }
 */
router.delete('/comments/:commentId', authMiddleware, deleteComment);

export default router;
