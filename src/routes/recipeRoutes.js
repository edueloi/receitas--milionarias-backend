// src/routes/recipeRoutes.js
import express from 'express';
import {
    createRecipe,
    getRecipeById,
    getAllRecipes,
    updateRecipe,
    deleteRecipe,
    deactivateRecipe,
    activateRecipe
} from '../controllers/recipeController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Receitas
 *   description: Gerenciamento completo de receitas
 */

/**
 * @swagger
 * /recipes:
 *   get:
 *     summary: Lista todas as receitas
 *     tags: [Receitas]
 *     responses:
 *       200:
 *         description: 'Lista de receitas'
 *   post:
 *     summary: Cria uma nova receita completa
 *     tags: [Receitas]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               titulo: { type: string, example: 'Bolo de Cenoura' }
 *               resumo: { type: string, example: 'Um bolo fofinho e delicioso.' }
 *               id_categoria: { type: integer, example: 1 }
 *               dificuldade: { type: string, enum: ['Fácil', 'Médio', 'Difícil'], example: 'Fácil' }
 *               tempo_preparo_min: { type: integer, example: 60 }
 *               grupos_ingredientes:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     titulo: { type: string, example: 'Massa' }
 *                     ordem: { type: integer, example: 1 }
 *                     ingredientes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           descricao: { type: string, example: '3 cenouras médias' }
 *                           ordem: { type: integer, example: 1 }
 *               passos_preparo:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     descricao: { type: string, example: 'Bata tudo no liquidificador.' }
 *                     ordem: { type: integer, example: 1 }
 *               tags:
 *                 type: array
 *                 items: { type: integer }
 *                 example: [1, 5]
 *     responses:
 *       201:
 *         description: 'Receita criada com sucesso'
 */
router.route('/recipes')
    .get(getAllRecipes)
    .post(authMiddleware, createRecipe);

/**
 * @swagger
 * /recipes/{id}:
 *   get:
 *     summary: Busca uma receita completa pelo ID
 *     tags: [Receitas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: 'Dados da receita' }
 *       404: { description: 'Receita não encontrada' }
 *   put:
 *     summary: Atualiza uma receita completa pelo ID
 *     tags: [Receitas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               titulo: { type: string, example: 'Novo Bolo de Cenoura' }
 *               resumo: { type: string, example: 'Atualizado para ser mais fofinho.' }
 *               id_categoria: { type: integer, example: 1 }
 *               dificuldade: { type: string, enum: ['Fácil', 'Médio', 'Difícil'], example: 'Fácil' }
 *               tempo_preparo_min: { type: integer, example: 50 }
 *               grupos_ingredientes:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     titulo: { type: string }
 *                     ordem: { type: integer }
 *                     ingredientes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           descricao: { type: string }
 *                           ordem: { type: integer }
 *               passos_preparo:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     descricao: { type: string }
 *                     ordem: { type: integer }
 *               tags:
 *                 type: array
 *                 items: { type: integer }
 *     responses:
 *       200: { description: 'Receita atualizada com sucesso' }
 *       404: { description: 'Receita não encontrada ou sem permissão' }
 *   delete:
 *     summary: Deleta uma receita
 *     tags: [Receitas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204: { description: 'Receita deletada com sucesso' }
 *       404: { description: 'Receita não encontrada ou sem permissão' }
 */
router.route('/recipes/:id')
    .get(getRecipeById)
    .put(authMiddleware, updateRecipe)
    .delete(authMiddleware, deleteRecipe);

/**
 * @swagger
 * /recipes/{id}/deactivate:
 *   put:
 *     summary: (Admin) Inativa uma receita pelo ID
 *     tags: [Receitas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: 'Receita inativada com sucesso' }
 *       404: { description: 'Receita não encontrada' }
 */
router.put('/recipes/:id/deactivate', authMiddleware, deactivateRecipe);

/**
 * @swagger
 * /recipes/{id}/activate:
 *   put:
 *     summary: (Admin) Ativa uma receita pelo ID
 *     tags: [Receitas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: 'Receita ativada com sucesso' }
 *       404: { description: 'Receita não encontrada' }
 */
router.put('/recipes/:id/activate', authMiddleware, activateRecipe);

export default router;