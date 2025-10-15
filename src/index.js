import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from '../swaggerConfig.js';
import cron from 'node-cron';
import { updatePendingCommissions } from './controllers/commissionController.js';

// Importe as suas rotas de API
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
import { handleWebhook } from './controllers/stripeDashboardController.js';

// Define __dirname para Módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// --- Middlewares Essenciais ---
app.use(cors());
app.post("/stripe-webhook", express.raw({ type: "application/json" }), handleWebhook);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- REMOVIDO: Configuração do express-session ---

// --- Configuração para Servir Ficheiros Estáticos ---
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static('uploads'));


// ==========================================================
//           ✨ ROTAS DE FRONT-END SIMPLIFICADAS
// ==========================================================

// A página principal ('/') agora redireciona diretamente para o dashboard
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// A rota do dashboard agora é pública
app.get('/dashboard', (req, res) => {
    res.sendFile(path.resolve('public', 'dashboard.html'));
});

// --- REMOVIDO: Rotas de /login e /logout ---

// ==========================================================
//           📡 ROTAS DE API (sem alterações)
// ==========================================================
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

// --- Inicia o Servidor ---
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📖 Documentação da API disponível em http://localhost:${PORT}/api-docs`);
});

// --- Tarefa Agendada (Cron Job) ---
cron.schedule('0 1 * * *', () => {
  console.log('🏃‍♂️ Executando a tarefa agendada para atualizar comissões pendentes...');
  updatePendingCommissions();
}, { timezone: "America/Sao_Paulo" });