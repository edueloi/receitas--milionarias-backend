// src/routes/recipeRoutes.js
import express from 'express';
import {
    createRecipe,
    getRecipeById,
    getAllRecipes
} from '../controllers/recipeController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Receitas
 *   description: Gerenciamento completo de receitas
 */

router.get('/recipes', getAllRecipes);

/**
 * @swagger
 * /recipes:
 *   post:
 *     summary: Cria uma nova receita completa
 *     tags: [Receitas]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               titulo:
 *                 type: string
 *                 example: 'Bolo de Cenoura'
 *               resumo:
 *                 type: string
 *                 example: 'Um bolo fofinho e delicioso.'
 *               id_categoria:
 *                 type: integer
 *                 example: 1
 *               dificuldade:
 *                 type: string
 *                 enum: ['Fácil', 'Médio', 'Difícil']
 *                 example: 'Fácil'
 *               tempo_preparo_min:
 *                 type: integer
 *                 example: 60
 *               grupos_ingredientes:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     titulo:
 *                       type: string
 *                       example: 'Massa'
 *                     ordem:
 *                       type: integer
 *                       example: 1
 *                     ingredientes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           descricao:
 *                             type: string
 *                             example: '3 cenouras médias'
 *                           ordem:
 *                             type: integer
 *                             example: 1
 *               passos_preparo:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     descricao:
 *                       type: string
 *                       example: 'Bata tudo no liquidificador.'
 *                     ordem:
 *                       type: integer
 *                       example: 1
 *               tags:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 5]
 *     responses:
 *       201:
 *         description: 'Receita criada com sucesso'
 */
router.post('/recipes', authMiddleware, createRecipe);

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
 *         schema:
 *           type: integer
 *     responses:
 *       200: { description: 'Dados da receita' }
 *       404: { description: 'Receita não encontrada' }
 */
router.get('/recipes/:id', getRecipeById);

export default router;
