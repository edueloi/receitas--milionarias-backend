// src/routes/courseRoutes.js
import express from 'express';
import {
    createCourse,
    getAllCourses,
    assignCourseToUser,
    getUserCourses
} from '../controllers/courseController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Cursos
 *   description: Endpoints para gerenciamento de cursos
 */

/**
 * @swagger
 * /courses:
 *   post:
 *     summary: (Admin) Cria um novo curso
 *     tags: [Cursos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome_curso
 *             properties:
 *               nome_curso: { type: string, example: 'Curso de Culinária' }
 *               descricao_curso: { type: string, example: 'Aprenda a cozinhar pratos incríveis.' }
 *     responses:
 *       201:
 *         description: Curso criado com sucesso
 *   get:
 *     summary: Lista todos os cursos
 *     tags: [Cursos]
 *     responses:
 *       200:
 *         description: Lista de cursos
 */
router.post('/courses', authMiddleware, createCourse); // Adicionar verificação de admin no controller
router.get('/courses', getAllCourses);

/**
 * @swagger
 * /users/{userId}/courses:
 *   post:
 *     summary: (Admin) Associa um curso a um usuário
 *     tags: [Cursos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - courseId
 *             properties:
 *               courseId: { type: integer, example: 1 }
 *     responses:
 *       201:
 *         description: Curso associado com sucesso
 *       409:
 *         description: Usuário já possui o curso
 *   get:
 *     summary: Lista os cursos de um usuário específico
 *     tags: [Cursos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lista de cursos do usuário
 */
router.post('/users/:userId/courses', authMiddleware, assignCourseToUser); // Adicionar verificação de admin
router.get('/users/:userId/courses', authMiddleware, getUserCourses);

export default router;