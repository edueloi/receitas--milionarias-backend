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
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Recipe'
 *             examples:
 *               RecipeList:
 *                 value:
 *                   - _id: "654321098765432109876543"
 *                     title: "Bolo de Chocolate"
 *                     description: "Um delicioso bolo de chocolate com cobertura de brigadeiro."
 *                     ingredients: ["farinha", "açúcar", "chocolate em pó", "ovos", "leite"]
 *                     instructions: ["Misture os ingredientes secos...", "Adicione os líquidos...", "Asse por 40 minutos..."]
 *                     category: "Sobremesas"
 *                     user: "654321098765432109876542"
 *                     images: ["http://localhost:3000/uploads/bolo-chocolate.jpg"]
 *                     rating: 4.8
 *                     numReviews: 120
 *                     isPublished: true
 *                     createdAt: "2023-10-26T10:00:00.000Z"
 *                     updatedAt: "2023-10-26T10:00:00.000Z"
 *                   - _id: "654321098765432109876544"
 *                     title: "Salada Caesar"
 *                     description: "Uma clássica salada Caesar com frango grelhado."
 *                     ingredients: ["alface", "frango", "molho caesar", "croutons", "parmesão"]
 *                     instructions: ["Grelhe o frango...", "Lave a alface...", "Misture tudo..."]
 *                     category: "Saladas"
 *                     user: "654321098765432109876542"
 *                     images: ["http://localhost:3000/uploads/salada-caesar.jpg"]
 *                     rating: 4.5
 *                     numReviews: 80
 *                     isPublished: true
 *                     createdAt: "2023-10-25T10:00:00.000Z"
 *                     updatedAt: "2023-10-25T10:00:00.000Z"
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
 *                 example: '{"title": "Pizza Margherita", "description": "A clássica pizza italiana.", "ingredients": ["massa", "molho de tomate", "muçarela", "manjericão"], "instructions": ["Prepare a massa...", "Adicione os ingredientes...", "Asse no forno..."], "category": "Pizzas"}'
 *               imagem:
 *                 type: string
 *                 format: binary
 *                 description: 'Arquivo de imagem principal da receita.'
 *     responses:
 *       201:
 *         description: 'Receita criada com sucesso'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Recipe'
 *             examples:
 *               RecipeCreated:
 *                 value:
 *                   _id: "654321098765432109876545"
 *                   title: "Pizza Margherita"
 *                   description: "A clássica pizza italiana."
 *                   ingredients: ["massa", "molho de tomate", "muçarela", "manjericão"]
 *                   instructions: ["Prepare a massa...", "Adicione os ingredientes...", "Asse no forno..."]
 *                   category: "Pizzas"
 *                   user: "654321098765432109876542"
 *                   images: ["http://localhost:3000/uploads/pizza-margherita.jpg"]
 *                   rating: 0
 *                   numReviews: 0
 *                   isPublished: true
 *                   createdAt: "2023-10-27T10:00:00.000Z"
 *                   updatedAt: "2023-10-27T10:00:00.000Z"
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Recipe'
 *             examples:
 *               SingleRecipe:
 *                 value:
 *                   _id: "654321098765432109876543"
 *                   title: "Bolo de Chocolate"
 *                   description: "Um delicioso bolo de chocolate com cobertura de brigadeiro."
 *                   ingredients: ["farinha", "açúcar", "chocolate em pó", "ovos", "leite"]
 *                   instructions: ["Misture os ingredientes secos...", "Adicione os líquidos...", "Asse por 40 minutos..."]
 *                   category: "Sobremesas"
 *                   user: "654321098765432109876542"
 *                   images: ["http://localhost:3000/uploads/bolo-chocolate.jpg"]
 *                   rating: 4.8
 *                   numReviews: 120
 *                   isPublished: true
 *                   createdAt: "2023-10-26T10:00:00.000Z"
 *                   updatedAt: "2023-10-26T10:00:00.000Z"
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
 *                 example: '{"title": "Bolo de Chocolate Atualizado", "description": "Um delicioso bolo de chocolate com nova cobertura.", "ingredients": ["farinha", "açúcar", "chocolate em pó", "ovos", "leite", "nova cobertura"], "instructions": ["Misture os ingredientes secos...", "Adicione os líquidos...", "Asse por 45 minutos..."], "category": "Sobremesas"}'
 *               imagem:
 *                 type: string
 *                 format: binary
 *                 description: 'Novo arquivo de imagem principal da receita.'
 *     responses:
 *       200:
 *         description: 'Receita atualizada com sucesso'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Recipe'
 *             examples:
 *               RecipeUpdated:
 *                 value:
 *                   _id: "654321098765432109876543"
 *                   title: "Bolo de Chocolate Atualizado"
 *                   description: "Um delicioso bolo de chocolate com nova cobertura."
 *                   ingredients: ["farinha", "açúcar", "chocolate em pó", "ovos", "leite", "nova cobertura"]
 *                   instructions: ["Misture os ingredientes secos...", "Adicione os líquidos...", "Asse por 45 minutos..."]
 *                   category: "Sobremesas"
 *                   user: "654321098765432109876542"
 *                   images: ["http://localhost:3000/uploads/bolo-chocolate-novo.jpg"]
 *                   rating: 4.8
 *                   numReviews: 120
 *                   isPublished: true
 *                   createdAt: "2023-10-26T10:00:00.000Z"
 *                   updatedAt: "2023-10-27T11:00:00.000Z"
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Recipe'
 *             examples:
 *               RecipeDeactivated:
 *                 value:
 *                   _id: "654321098765432109876543"
 *                   title: "Bolo de Chocolate"
 *                   description: "Um delicioso bolo de chocolate com cobertura de brigadeiro."
 *                   ingredients: ["farinha", "açúcar", "chocolate em pó", "ovos", "leite"]
 *                   instructions: ["Misture os ingredientes secos...", "Adicione os líquidos...", "Asse por 40 minutos..."]
 *                   category: "Sobremesas"
 *                   user: "654321098765432109876542"
 *                   images: ["http://localhost:3000/uploads/bolo-chocolate.jpg"]
 *                   rating: 4.8
 *                   numReviews: 120
 *                   isPublished: false
 *                   createdAt: "2023-10-26T10:00:00.000Z"
 *                   updatedAt: "2023-10-27T12:00:00.000Z"
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Recipe'
 *             examples:
 *               RecipeActivated:
 *                 value:
 *                   _id: "654321098765432109876543"
 *                   title: "Bolo de Chocolate"
 *                   description: "Um delicioso bolo de chocolate com cobertura de brigadeiro."
 *                   ingredients: ["farinha", "açúcar", "chocolate em pó", "ovos", "leite"]
 *                   instructions: ["Misture os ingredientes secos...", "Adicione os líquidos...", "Asse por 40 minutos..."]
 *                   category: "Sobremesas"
 *                   user: "654321098765432109876542"
 *                   images: ["http://localhost:3000/uploads/bolo-chocolate.jpg"]
 *                   rating: 4.8
 *                   numReviews: 120
 *                   isPublished: true
 *                   createdAt: "2023-10-26T10:00:00.000Z"
 *                   updatedAt: "2023-10-27T13:00:00.000Z"
 *       404:
 *         description: 'Receita não encontrada'
 */
router.put('/recipes/:id/activate', authMiddleware, activateRecipe);

export default router;