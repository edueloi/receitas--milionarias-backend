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

import multer from 'multer';
import path from 'path';

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const extname = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${Date.now()}${extname}`);
    }
});

const upload = multer({ storage: storage });

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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               data:
 *                 type: string
 *                 description: 'Objeto JSON com os dados da receita (título, resumo, etc.).'
 *               imagem:
 *                 type: string
 *                 format: binary
 *                 description: 'Arquivo de imagem principal da receita.'
 *     responses:
 *       201:
 *         description: 'Receita criada com sucesso'
 */
router.route('/recipes')
    .get(getAllRecipes)
    .post(authMiddleware, upload.single('imagem'), createRecipe);

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
 *       200:
 *         description: 'Dados da receita'
 *       404:
 *         description: 'Receita não encontrada'
 *   put:
 *     summary: Atualiza uma receita completa pelo ID
 *     tags: [Receitas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               data:
 *                 type: string
 *                 description: 'Objeto JSON com os dados da receita (título, resumo, etc.).'
 *               imagem:
 *                 type: string
 *                 format: binary
 *                 description: 'Novo arquivo de imagem principal da receita.'
 *     responses:
 *       200:
 *         description: 'Receita atualizada com sucesso'
 *       404:
 *         description: 'Receita não encontrada ou sem permissão'
 *   delete:
 *     summary: Deleta uma receita
 *     tags: [Receitas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: 'Receita deletada com sucesso'
 *       404:
 *         description: 'Receita não encontrada ou sem permissão'
 */
router.route('/recipes/:id')
    .get(getRecipeById)
    .put(authMiddleware, upload.single('imagem'), updateRecipe)
    .delete(authMiddleware, deleteRecipe);

/**
 * @swagger
 * /recipes/{id}/deactivate:
 *   put:
 *     summary: Inativa uma receita pelo ID
 *     tags: [Receitas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 'Receita inativada com sucesso'
 *       404:
 *         description: 'Receita não encontrada'
 */
router.put('/recipes/:id/deactivate', authMiddleware, deactivateRecipe);

/**
 * @swagger
 * /recipes/{id}/activate:
 *   put:
 *     summary: Ativa uma receita pelo ID
 *     tags: [Receitas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 'Receita ativada com sucesso'
 *       404:
 *         description: 'Receita não encontrada'
 */
router.put('/recipes/:id/activate', authMiddleware, activateRecipe);

export default router;