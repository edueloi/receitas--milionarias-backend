// src/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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
import earningsRoutes from './routes/earningsRoutes.js'; // Importa rotas de ganhos
import userPreferenceRoutes from './routes/userPreferenceRoutes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// --- Rotas da API ---
app.use('/api', userRoutes);
app.use('/api', courseRoutes);
app.use('/api', categoryRoutes);
app.use('/api', tagRoutes);
app.use('/api', recipeRoutes);
app.use('/api', mediaRoutes);
app.use('/api', commentRoutes);
app.use('/api', analyticsRoutes);
app.use('/api', earningsRoutes); // Registra rotas de ganhos
app.use('/api', userPreferenceRoutes);

// --- Rota da Documentação ---
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// --- Rota Raiz ---
app.get('/', (req, res) => {
    res.send('API Receitas-Backend está no ar! Visite /api-docs para ver a documentação.');
});

// --- Inicia o Servidor ---
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Documentação da API disponível em http://localhost:${PORT}/api-docs`);
});