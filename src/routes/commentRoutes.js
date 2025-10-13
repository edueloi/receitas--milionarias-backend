import express from 'express';
import upload from '../middleware/uploadMiddleware.js';
import {
    addComment,
    getCommentsByRecipe,
    deleteComment,
    updateComment // Adicionado
} from '../controllers/commentController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

const commentUpload = upload.fields([{ name: 'foto', maxCount: 1 }])

router.route('/recipes/:recipeId/comments')
  .post(authMiddleware, commentUpload, addComment)
  .get(getCommentsByRecipe);

router.route('/comments/:commentId')
  .put(authMiddleware, updateComment) // Rota de Edição
  .delete(authMiddleware, deleteComment); // Rota de Deleção

export default router;