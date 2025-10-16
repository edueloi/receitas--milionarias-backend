// src/index.js
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from '../swaggerConfig.js';
import cron from 'node-cron';
import session from 'express-session';

import { updatePendingCommissions } from './controllers/commissionController.js';
import { handleWebhook } from './controllers/stripeDashboardController.js';

// Rotas de API
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
import healthRoutes from './routes/healthRoutes.js';
import pdfRoutes from './routes/pdfRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import commissionRoutes from './routes/commissionRoutes.js';
import withdrawalRoutes from './routes/withdrawalRoutes.js';
import stripeRoutes from './routes/stripeRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import payoutRoutes from './routes/payoutRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

// __dirname para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// -------------------- Middlewares base --------------------
app.use(cors());

// webhook precisa vir ANTES do express.json()
app.post('/stripe-webhook', express.raw({ type: 'application/json' }), handleWebhook);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sessão (se não for usar auth agora, tudo bem manter)
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'supersecret',
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

// -------------------- Estáticos --------------------
// public e uploads ficam um nível ACIMA de src
app.use(express.static(path.resolve(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads')));


// -------------------- Front-end (APENAS AQUI) --------------------
app.get('/dashboard', (_req, res) => {
  console.log('HIT /dashboard -> views/stripe-dashboard.html');
  res.sendFile(path.join(__dirname, 'views', 'stripe-dashboard.html'));
});

app.get('/', (_req, res) => res.redirect('/dashboard'));

app.get('/test-index', (_req, res) => {
  res.send('Index test route is working!');
});

// -------------------- APIs --------------------
console.log('Registrando rotas da API...');
app.use(userRoutes);
app.use(courseRoutes);
app.use(categoryRoutes);
app.use(tagRoutes);
app.use(recipeRoutes);
app.use(mediaRoutes);
app.use(commentRoutes);
app.use(analyticsRoutes);
app.use('/earnings', earningsRoutes);
app.use(userPreferenceRoutes);
app.use(healthRoutes);
app.use(pdfRoutes);
app.use(paymentRoutes);
app.use(commissionRoutes);
app.use(withdrawalRoutes);
app.use(stripeRoutes); // NÃO deve declarar /dashboard aqui
app.use('/wallet', walletRoutes);
app.use('/payouts', payoutRoutes);
app.use(adminRoutes);
console.log('Rotas da API registradas.');

// -------------------- Docs --------------------
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// -------------------- Loggers úteis --------------------
app.use((req, _res, next) => {
  // log simples de 404 para descobrir rotas perdidas
  console.log('404 ->', req.method, req.url);
  next();
});

app.use((err, _req, res, _next) => {
  console.error('ERROR middleware:', err?.stack || err);
  res.status(500).send('Erro interno');
});

// -------------------- Server --------------------
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📖 Documentação da API disponível em http://localhost:${PORT}/api-docs`);
});

// -------------------- CRON --------------------
cron.schedule(
  '0 1 * * *',
  () => {
    console.log('🏃‍♂️ Atualizando comissões pendentes (CRON)...');
    updatePendingCommissions();
  },
  { timezone: 'America/Sao_Paulo' }
);
