import express from 'express';
import * as ebookCategoryController from '../controllers/ebookCategoryController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
    .get(ebookCategoryController.getAllEbookCategories)
    .post(authMiddleware, ebookCategoryController.createEbookCategory);

router.route('/:id')
    .delete(authMiddleware, ebookCategoryController.deleteEbookCategory);

export default router;