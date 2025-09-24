// src/routes/recipeRoutes.js
import express from 'express';
import {
  createRecipe,
  getRecipeById,
  getAllRecipes,
  updateRecipe,
  deleteRecipe,
  deactivateRecipe,
  activateRecipe,
} from '../controllers/recipeController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// -----------------------------------------------------------------------------
//                               Multer / Uploads
// -----------------------------------------------------------------------------
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path
      .basename(file.originalname, ext)
      .replace(/\s+/g, '-')
      .toLowerCase();
    cb(null, `imagem-${Date.now()}-${base}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const ok = /^(image|video)\//.test(file.mimetype);
  cb(ok ? null : new Error('Tipo de arquivo não suportado (apenas imagem ou vídeo).'), ok);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// -----------------------------------------------------------------------------
//                                   Swagger
// -----------------------------------------------------------------------------

/**
 * @swagger
 * tags:
 *   name: Receitas
 *   description: Gerenciamento completo de receitas
 */



// -----------------------------------------------------------------------------
//                                   Rotas base
// -----------------------------------------------------------------------------

/**
 * @swagger
 * /recipes:
 *   get:
 *     summary: Lista receitas com filtros, paginação e ordenação
 *     tags: [Receitas]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 12
 *           maximum: 100
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pendente, ativo, inativo]
 *       - in: query
 *         name: categoria
 *         schema:
 *           type: integer
 *       - in: query
 *         name: produtor
 *         schema:
 *           type: integer
 *       - in: query
 *         name: tag
 *         schema:
 *           type: integer
 *       - in: query
 *         name: search
 *         description: Busca por título/resumo
 *         schema:
 *           type: string
 *       - in: query
 *         name: sort
 *         description: 'Campo para ordenar (ex: r.created_at, r.titulo)'
 *         schema:
 *           type: string
 *           default: r.id
 *       - in: query
 *         name: order
 *         description: Direção (ASC|DESC)
 *         schema:
 *           type: string
 *           default: DESC
 *     responses:
 *       200:
 *         description: 'Lista de receitas (com metadados de paginação)'
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
 *                 type: object
 *                 description: 'Objeto JSON com os dados da receita.'
 *                 properties:
 *                   titulo: { type: string, example: "Pizza Margherita" }
 *                   resumo: { type: string, example: "A clássica pizza italiana." }
 *                   id_categoria: { type: integer, example: 1 }
 *                   dificuldade: { type: string, enum: ["fácil", "médio", "difícil"], example: "médio" }
 *                   tempo_preparo_min: { type: integer, example: 20 }
 *                   tempo_cozimento_min: { type: integer, example: 15 }
 *                   porcoes: { type: integer, example: 4 }
 *                   status: { type: string, enum: ["pendente", "ativo", "inativo", "rascunho"], example: "pendente" }
 *                   calorias_kcal: { type: number, format: float, example: 250.5 }
 *                   proteinas_g: { type: number, format: float, example: 12.3 }
 *                   carboidratos_g: { type: number, format: float, example: 30.0 }
 *                   gorduras_g: { type: number, format: float, example: 10.5 }
 *                   grupos_ingredientes:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         titulo: { type: string, example: "Massa" }
 *                         ordem: { type: integer, example: 1 }
 *                         ingredientes:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               descricao: { type: string, example: "200g de farinha" }
 *                               observacao: { type: string, example: "peneirada" }
 *                               ordem: { type: integer, example: 1 }
 *                   passos_preparo:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         descricao: { type: string, example: "Misture a farinha e a água." }
 *                         observacao: { type: string, example: "Até ficar homogêneo." }
 *                         ordem: { type: integer, example: 1 }
 *                   tags:
 *                     type: array
 *                     items:
 *                       type: integer
 *                       example: 801
 *               imagem:
 *                 type: string
 *                 format: binary
 *                 description: 'Arquivo de mídia principal (imagem/vídeo) da receita.'
 *     responses:
 *       201:
 *         description: 'Receita criada com sucesso'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Recipe'
 */
router
  .route('/recipes')
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Recipe'
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
 *                 type: object
 *                 description: 'Objeto JSON com os dados da receita a serem atualizados.'
 *                 properties:
 *                   titulo: { type: string, example: "Bolo de Chocolate Atualizado" }
 *                   resumo: { type: string, example: "Um delicioso bolo de chocolate com nova cobertura." }
 *                   id_categoria: { type: integer, example: 101 }
 *                   dificuldade: { type: string, enum: ["fácil", "médio", "difícil"], example: "difícil" }
 *                   tempo_preparo_min: { type: integer, example: 35 }
 *                   tempo_cozimento_min: { type: integer, example: 45 }
 *                   porcoes: { type: integer, example: 10 }
 *                   status: { type: string, enum: ["pendente", "ativo", "inativo", "rascunho"], example: "ativo" }
 *                   calorias_kcal: { type: number, format: float, example: 380.0 }
 *                   proteinas_g: { type: number, format: float, example: 18.0 }
 *                   carboidratos_g: { type: number, format: float, example: 55.0 }
 *                   gorduras_g: { type: number, format: float, example: 22.0 }
 *                   grupos_ingredientes:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         titulo: { type: string, example: "Cobertura" }
 *                         ordem: { type: integer, example: 2 }
 *                         ingredientes:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               descricao: { type: string, example: "200g de chocolate meio amargo" }
 *                               observacao: { type: string, example: "derretido" }
 *                               ordem: { type: integer, example: 1 }
 *                   passos_preparo:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         descricao: { type: string, example: "Cubra o bolo com a cobertura." }
 *                         observacao: { type: string, example: "Espalhe uniformemente." }
 *                         ordem: { type: integer, example: 3 }
 *                   tags:
 *                     type: array
 *                     items:
 *                       type: integer
 *                       example: 802
 *               imagem:
 *                 type: string
 *                 format: binary
 *                 description: 'Novo arquivo de mídia principal (imagem/vídeo) da receita.'
 *     responses:
 *       200:
 *         description: 'Receita atualizada com sucesso'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Recipe'
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
router
  .route('/recipes/:id')
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

// -----------------------------------------------------------------------------
//                           Rotas auxiliares (listas)
// -----------------------------------------------------------------------------

/**
 * @swagger
 * /users/{userId}/recipes:
 *   get:
 *     summary: Lista receitas criadas por um usuário
 *     tags: [Receitas]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 12 }
 *       - in: query
 *         name: sort
 *         schema: { type: string, default: r.id }
 *       - in: query
 *         name: order
 *         schema: { type: string, default: DESC }
 *     responses:
 *       200: { description: Lista do usuário }
 */
router.get('/users/:userId/recipes', getAllRecipes); // controller lê req.params.userId

/**
 * @swagger
 * /categories/{categoryId}/recipes:
 *   get:
 *     summary: Lista receitas por categoria
 *     tags: [Receitas]
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 12 }
 *     responses:
 *       200: { description: Lista por categoria }
 */
router.get('/categories/:categoryId/recipes', getAllRecipes); // controller lê req.params.categoryId

/**
 * @swagger
 * /tags/{tagId}/recipes:
 *   get:
 *     summary: Lista receitas por tag
 *     tags: [Receitas]
 *     parameters:
 *       - in: path
 *         name: tagId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 12 }
 *     responses:
 *       200: { description: Lista por tag }
 */
router.get('/tags/:tagId/recipes', getAllRecipes); // controller lê req.params.tagId

export default router;
