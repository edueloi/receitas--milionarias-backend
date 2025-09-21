// src/index.js
import dotenv from 'dotenv';
dotenv.config({ path: '/var/www/receitas-backend/.env' });
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from '../swaggerConfig.js';

import userRoutes from './routes/userRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import tagRoutes from './routes/tagRoutes.js';
import recipeRoutes from './routes/recipeRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';
import commentRoutes from './routes/commentRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import earningsRoutes from './routes/earningsRoutes.js';
import userPreferenceRoutes from './routes/userPreferenceRoutes.js';
import healthRoutes from "./routes/healthRoutes.js";

// Define __dirname para Módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuração de CORS ---
// Nginx ou outro proxy reverso deve gerenciar os cabeçalhos CORS.
// O backend aceita requisições de qualquer origem para simplificar.
app.use(cors());

// --- Middlewares ---
app.use(express.json());
// --- Configuração para servir arquivos estáticos ---
app.use('/uploads', express.static('uploads'));

// --- Rotas da API ---
app.use(userRoutes);
app.use(courseRoutes);
app.use(categoryRoutes);
app.use(tagRoutes);
app.use(recipeRoutes);
app.use(mediaRoutes);
app.use(commentRoutes);
app.use(analyticsRoutes);
app.use(earningsRoutes);
app.use(userPreferenceRoutes);
app.use(healthRoutes);

// --- Rota da Documentação ---
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// --- Rota Raiz ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// --- Inicia o Servidor ---
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📖 Documentação da API disponível em http://localhost:${PORT}/api-docs`);
});