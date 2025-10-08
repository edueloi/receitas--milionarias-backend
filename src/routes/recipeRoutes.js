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
  getUsedCategories,
  getUsedTags,
} from '../controllers/recipeController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Multer / Uploads Configuration
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/\s+/g, '-').toLowerCase();
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

// --- ROTAS DE RECEITAS ---
// NOTA: A ordem é importante. Rotas mais específicas devem vir antes de rotas com parâmetros (como /:id).

// Rotas para filtros dinâmicos
router.get('/recipes/used-categories', getUsedCategories);
router.get('/recipes/used-tags', getUsedTags);

// Rota principal para listar todas as receitas (com filtros) e criar novas
router.route('/recipes')
  .get(getAllRecipes)
  .post(authMiddleware, upload.single('imagem'), createRecipe);

// Rotas para ativar/desativar uma receita
router.put('/recipes/:id/deactivate', authMiddleware, deactivateRecipe);
router.put('/recipes/:id/activate', authMiddleware, activateRecipe);

// Rota para buscar, atualizar e deletar uma receita específica por ID
// Esta deve ser uma das últimas para não conflitar com as rotas acima
router.route('/recipes/:id')
  .get(getRecipeById)
  .put(authMiddleware, upload.single('imagem'), updateRecipe)
  .delete(authMiddleware, deleteRecipe);

// Rotas para listar receitas associadas a outras entidades
router.get('/users/:userId/recipes', getAllRecipes);
router.get('/categories/:categoryId/recipes', getAllRecipes);
router.get('/tags/:tagId/recipes', getAllRecipes);

export default router;