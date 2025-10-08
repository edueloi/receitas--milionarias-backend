import dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });
console.log('🔑 Stripe Key carregada:', process.env.STRIPE_SECRET_KEY ? '✅ OK' : '❌ VAZIA');


import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from '../swaggerConfig.js';
import cron from 'node-cron'; // <-- NOVO: Importa o agendador de tarefas
import { updatePendingCommissions } from './controllers/commissionController.js'; // <-- NOVO: Importa a função a ser agendada

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
import pdfRoutes from './routes/pdfRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import commissionRoutes from './routes/commissionRoutes.js';
import withdrawalRoutes from './routes/withdrawalRoutes.js';
import stripeRoutes from './routes/stripeRoutes.js';
import { handleWebhook } from './controllers/stripeController.js';

// Define __dirname para Módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// --- Configuração de CORS ---
app.use(cors());

// --- Middlewares ---
app.post("/stripe-webhook", express.raw({ type: "application/json" }), handleWebhook);
app.use(express.json());
// --- Configuração para servir arquivos estáticos ---
app.use('/uploads', express.static('uploads'));

// --- ROTA DE TESTE TEMPORÁRIA ---
app.get('/test-route', (req, res) => {
    console.log('✅ ROTA DE TESTE ACESSADA COM SUCESSO!');
    res.status(200).send('A rota de teste funcionou!');
});

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
app.use(pdfRoutes);
app.use(paymentRoutes);
app.use(commissionRoutes);
app.use(withdrawalRoutes);
app.use(stripeRoutes);


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

// --- NOVO: Tarefa Agendada (Cron Job) ---
// Esta tarefa verifica e atualiza as comissões de 'pendente' para 'disponivel'
// A expressão '0 1 * * *' significa: "Execute à 1h da manhã, todos os dias".
console.log('⏰ Agendando tarefa para atualização diária de comissões.');
cron.schedule('0 1 * * *', () => {
  console.log('🏃‍♂️ Executando a tarefa agendada para atualizar comissões pendentes...');
  updatePendingCommissions();
}, {
  timezone: "America/Sao_Paulo" // É uma boa prática definir o fuso horário
});
