// src/routes/categoryRoutes.js
import express from 'express';
import {
    createCategory,
    getAllCategories,
    updateCategory,
    deleteCategory
} from '../controllers/categoryController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js'; // Importa o middleware de upload

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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               data:
 *                 type: string
 *                 description: JSON string com os detalhes da categoria (nome, descricao).
 *                 example: '{"nome":"Sobremesas","descricao":"Doces, bolos e tortas."}'
 *               imagem:
 *                 type: string
 *                 format: binary
 *                 description: Arquivo de imagem para a categoria.
 *     responses:
 *       201: { description: 'Categoria criada' }
 *   get:
 *     summary: Lista todas as categorias
 *     tags: [Categorias de Receitas]
 *     responses:
 *       200: { description: 'Lista de categorias' }
 */
router.route('/categories')
    .post(authMiddleware, upload.single('imagem'), createCategory) // Adiciona o middleware de upload
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               data:
 *                 type: string
 *                 description: JSON string com os detalhes da categoria (nome, descricao).
 *                 example: '{"nome":"Sobremesas","descricao":"Doces, bolos e tortas."}'
 *               imagem:
 *                 type: string
 *                 format: binary
 *                 description: Arquivo de imagem para a categoria (opcional, se for atualizar).
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
    .put(authMiddleware, upload.single('imagem'), updateCategory) // Adiciona o middleware de upload
    .delete(authMiddleware, deleteCategory);

export default router;
