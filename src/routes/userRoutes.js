// src/routes/userRoutes.js
import express from 'express';
import {
    registerUser,
    loginUser,
    getUserProfile,
    updateUserProfile,
    updatePassword,
    updateUserStatus,
    updateUserPermission,
    forgotPassword,
    resetPassword,
    checkSubscriptions,
    updateUser
} from '../controllers/userController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js'; // Importar o middleware de upload
import { getAllUsers } from "../controllers/userController.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Usuários
 *   description: Endpoints para gerenciamento de usuários e autenticação
 */

/**
 * @swagger
 * /users/register:
 *   post:
 *     summary: Registra um novo usuário
 *     tags: [Usuários]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *               - email
 *               - senha
 *               - cpf
 *             properties:
 *               nome: { type: string, example: 'João' }
 *               sobrenome: { type: string, example: 'Silva' }
 *               email: { type: string, format: email, example: 'joao.silva@example.com' }
 *               senha: { type: string, format: password, example: 'senha123' }
 *               cpf: { type: string, example: '123.456.789-00' }
 *               telefone: { type: string, example: '11999998888' }
               id_permissao: { type: integer, example: 6, description: 'ID da permissão do usuário (1 para Admin, 6 para Afiliado - padrão).' }
 *     responses:
 *       201:
 *         description: Usuário registrado com sucesso
 *       400:
 *         description: Dados inválidos
 *       409:
 *         description: Email ou CPF já em uso
 */
router.post('/users/register', registerUser);

/**
 * @swagger
 * /users/login:
 *   post:
 *     summary: Realiza o login do usuário
 *     tags: [Usuários]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - senha
 *             properties:
 *               email: { type: string, format: email, example: 'joao.silva@example.com' }
 *               senha: { type: string, format: password, example: 'senha123' }
 *     responses:
 *       200:
 *         description: Login bem-sucedido, retorna token JWT
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *       401:
 *         description: Credenciais inválidas
 */
router.post('/users/login', loginUser);

/**
 * @swagger
 * /users/forgot-password:
 *   post:
 *     summary: Solicita a redefinição de senha
 *     tags: [Usuários]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email: { type: string, format: email, example: 'joao.silva@example.com' }
 *     responses:
 *       200:
 *         description: Email de redefinição enviado
 */
router.post('/users/forgot-password', forgotPassword);

/**
 * @swagger
 * /users/reset-password:
 *   post:
 *     summary: Efetiva a redefinição de senha com um token
 *     tags: [Usuários]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - novaSenha
 *             properties:
 *               token: { type: string }
 *               novaSenha: { type: string, format: password }
 *     responses: 
 *       200:
 *         description: Senha redefinida com sucesso
 *       400:
 *         description: Token inválido ou expirado
 */
router.post('/users/reset-password', resetPassword);

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Retorna o perfil do usuário logado
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil do usuário
 *       401:
 *         description: Não autorizado
 *   put:
 *     summary: Atualiza o perfil do usuário logado
 *     description: Para upload de foto, use multipart/form-data. Os campos de texto devem ser enviados normalmente.
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               nome: { type: string }
 *               sobrenome: { type: string }
 *               telefone: { type: string }
 *               foto_perfil: { type: string, format: binary, description: 'Arquivo de imagem para a foto de perfil.' }
 *               # Adicione outros campos atualizáveis aqui
 *     responses:
 *       200:
 *         description: Perfil atualizado com sucesso
 *       401:
 *         description: Não autorizado
 */
router.get('/users/me', authMiddleware, getUserProfile);
router.put('/users/me', authMiddleware, upload.single('foto_perfil'), updateUserProfile);

/**
 * @swagger
 * /users/me/password:
 *   patch:
 *     summary: Altera a senha do usuário logado
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - senhaAntiga
 *               - novaSenha
 *             properties:
 *               senhaAntiga: { type: string, format: password }
 *               novaSenha: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Senha alterada com sucesso
 *       401:
 *         description: Senha antiga incorreta
 */
router.patch('/users/me/password', authMiddleware, updatePassword);

/**
 * @swagger
 * /users/{id}/status:
 *   patch:
 *     summary: (Admin) Atualiza o status de um usuário
 *     tags: [Usuários]
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive: { type: boolean, description: 'Define se o usuário pode logar.' }
 *               isPaying: { type: boolean, description: 'Define se o usuário é um assinante pagante.' }
 *               id_status: { type: integer, description: 'ID do status (1: Ativo, 2: Inativo, 3: Pendente, 4: Bloqueado).' }
 *     responses:
 *       200:
 *         description: Status atualizado
 *       404:
 *         description: Usuário não encontrado
 */
router.patch('/users/:id/status', authMiddleware, updateUserStatus);

/**
 * @swagger
 * /users/{id}/permission:
 *   patch:
 *     summary: (Admin) Atualiza a permissão de um usuário
 *     tags: [Usuários]
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
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id_permissao
 *             properties:
 *               id_permissao: { type: integer }
 *     responses:
 *       200:
 *         description: Permissão atualizada
 */
router.patch('/users/:id/permission', authMiddleware, updateUserPermission);

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: (Admin) Atualiza múltiplos campos de um usuário
 *     tags: [Usuários]
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id_permissao: { type: integer, description: 'ID da permissão do usuário.' }
 *               id_status: { type: integer, description: 'ID do status do usuário.' }
 *               # Adicione outros campos que podem ser atualizados aqui
 *     responses:
 *       200:
 *         description: Usuário atualizado com sucesso
 *       400:
 *         description: Nenhum dado fornecido para atualização ou dados inválidos
 *       401:
 *         description: Não autorizado
 *       403:
 *         description: Acesso negado
 *       404:
 *         description: Usuário não encontrado
 */
router.put('/users/:id', authMiddleware, updateUser);

/**
 * @swagger
 * /users/cron/check-subscriptions:
 *   post:
 *     summary: (CRON) Verifica e atualiza o status de assinaturas expiradas
 *     tags: [Usuários, CRON]
 *     description: Endpoint para ser chamado por um serviço de CRON para gerenciar o ciclo de vida das assinaturas.
 *     responses:
 *       200:
 *         description: Verificação concluída
 *       500:
 *         description: Erro interno no servidor
 */
// Recomenda-se proteger este endpoint com uma chave de API ou outra estratégia
router.post('/users/cron/check-subscriptions', checkSubscriptions);

router.get("/users", authMiddleware, getAllUsers);

export default router;