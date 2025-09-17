// src/routes/categoryRoutes.js
import express from 'express';
import {
    createCategory,
    getAllCategories,
    updateCategory,
    deleteCategory
} from '../controllers/categoryController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Categorias de Receitas
 *   description: Gerenciamento das categorias de receitas
 */

/**
 * @swagger
 * /categories:
 *   post:
 *     summary: (Admin) Cria uma nova categoria
 *     tags: [Categorias de Receitas]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome: { type: string, example: 'Sobremesas' }
 *               descricao: { type: string, example: 'Doces, bolos e tortas.' }
 *     responses:
 *       201: { description: 'Categoria criada' }
 *   get:
 *     summary: Lista todas as categorias
 *     tags: [Categorias de Receitas]
 *     responses:
 *       200: { description: 'Lista de categorias' }
 */
router.route('/categories')
    .post(authMiddleware, createCategory)
    .get(getAllCategories);

/**
 * @swagger
 * /categories/{id}:
 *   put:
 *     summary: (Admin) Atualiza uma categoria
 *     tags: [Categorias de Receitas]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome: { type: string }
 *               descricao: { type: string }
 *     responses:
 *       200: { description: 'Categoria atualizada' }
 *   delete:
 *     summary: (Admin) Deleta uma categoria
 *     tags: [Categorias de Receitas]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: 'Categoria deletada' }
 */
router.route('/categories/:id')
    .put(authMiddleware, updateCategory)
    .delete(authMiddleware, deleteCategory);

export default router;
