// src/index.js
import 'dotenv/config';
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

// Define __dirname para Módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuração de CORS ---
const allowedOrigins = [
    'https://dashboard.receitasmilionarias.com.br',
    'https://receitasmilionarias.com.br',
    'http://localhost:3000', // Para testes locais
    'http://localhost:3001', // Porta comum para frontend dev
    'http://localhost:5173'  // Porta comum para Vite/React dev
];

const corsOptions = {
    origin: (origin, callback) => {
        // Permite requisições sem 'origin' (ex: Postman, mobile apps) ou da mesma origem
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Acesso não permitido pela política de CORS.'));
        }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true
};

// --- Middlewares ---
app.use(cors(corsOptions));
app.use(express.json());

// --- Configuração para servir arquivos estáticos ---
app.use('/uploads', express.static('uploads'));

// --- Rotas da API ---
app.use('/api', userRoutes);
app.use('/api', courseRoutes);
app.use('/api', categoryRoutes);
app.use('/api', tagRoutes);
app.use('/api', recipeRoutes);
app.use('/api', mediaRoutes);
app.use('/api', commentRoutes);
app.use('/api', analyticsRoutes);
app.use('/api', earningsRoutes);
app.use('/api', userPreferenceRoutes);

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