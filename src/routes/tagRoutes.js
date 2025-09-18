// src/routes/tagRoutes.js
import express from 'express';
import {
    createTag,
    getAllTags,
    deleteTag
} from '../controllers/tagController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Tags
 *   description: Gerenciamento de tags para receitas
 */

/**
 * @swagger
 * /tags:
 *   post:
 *     summary: (Admin) Cria uma nova tag
 *     tags: [Tags]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome: { type: string, example: 'Vegano' }
 *     responses:
 *       201: { description: 'Tag criada' }
 *   get:
 *     summary: Lista todas as tags
 *     tags: [Tags]
 *     responses:
 *       200: { description: 'Lista de tags' }
 */
router.route('/tags')
    .post(authMiddleware, upload.none(), createTag)
    .get(getAllTags);

/**
 * @swagger
 * /tags/{id}:
 *   delete:
 *     summary: (Admin) Deleta uma tag
 *     tags: [Tags]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: 'Tag deletada' }
 */
router.route('/tags/:id')
    .delete(authMiddleware, deleteTag);

export default router;
