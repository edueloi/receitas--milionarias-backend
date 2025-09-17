// src/routes/mediaRoutes.js
import express from 'express';
import {
    registerMedia,
    deleteMedia
} from '../controllers/mediaController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Mídia
 *   description: Gerenciamento de URLs de mídias (fotos, vídeos)
 */

/**
 * @swagger
 * /media:
 *   post:
 *     summary: Registra uma nova mídia
 *     tags: [Mídia]
 *     description: Recebe a URL de um arquivo já hospedado e a salva no banco de dados.
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url_arquivo, tipo_arquivo]
 *             properties:
 *               url_arquivo: { type: string, example: 'https://storage.example.com/imagem.jpg' }
 *               tipo_arquivo: { type: string, enum: ['imagem', 'video', 'documento'], example: 'imagem' }
 *     responses:
 *       201: { description: 'Mídia registrada com sucesso' }
 *       400: { description: 'Dados inválidos' }
 */
router.post('/media', authMiddleware, registerMedia);

/**
 * @swagger
 * /media/{id}:
 *   delete:
 *     summary: Deleta o registro de uma mídia
 *     tags: [Mídia]
 *     description: Remove a referência do arquivo no banco de dados. Não apaga o arquivo físico no servidor de armazenamento.
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: 'Mídia deletada com sucesso' }
 *       403: { description: 'Não autorizado' }
 *       404: { description: 'Mídia não encontrada' }
 */
router.delete('/media/:id', authMiddleware, deleteMedia);

export default router;
