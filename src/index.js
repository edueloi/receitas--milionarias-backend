// src/index.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "../swaggerConfig.js";
import cron from "node-cron";
import session from "express-session";

import { updatePendingCommissions } from "./controllers/commissionController.js";
import { handleWebhook } from "./controllers/stripeDashboardController.js";
import { startNotificationCleanupJob } from "./jobs/notificationCleanupJob.js";

// Rotas
import userRoutes from "./routes/userRoutes.js";
import courseRoutes from "./routes/courseRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import ebookCategoryRoutes from "./routes/ebookCategoryRoutes.js";
import tagRoutes from "./routes/tagRoutes.js";
import recipeRoutes from "./routes/recipeRoutes.js";
import ebookRoutes from "./routes/ebookRoutes.js";
import mediaRoutes from "./routes/mediaRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import earningsRoutes from "./routes/earningsRoutes.js";
import userPreferenceRoutes from "./routes/userPreferenceRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import pdfRoutes from "./routes/pdfRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import commissionRoutes from "./routes/commissionRoutes.js";
import withdrawalRoutes from "./routes/withdrawalRoutes.js";
import stripeRoutes from "./routes/stripeRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import payoutRoutes from "./routes/payoutRoutes.js";
import rolePermissionsRoutes from "./routes/rolePermissionsRoutes.js";
import notificationsRoutes from "./routes/notifications.js";
import lancamentoRoutes from "./routes/lancamentoRoutes.js";
import cursosRoutes from "./routes/cursosRoutes.js";

// Store de sessão em MySQL (produção)
import MySQLStoreFactory from "express-mysql-session";
const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  createDatabaseTable: true,
});

// __dirname (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// conf de proxy (req.ip real atrás de nginx/cloudflare)
app.set("trust proxy", true);

// -------------------- Middlewares base --------------------
app.use(cors());

// DEBUG: Log all incoming requests
app.use((req, res, next) => {
  console.log("REQUEST RECEIVED:", req.method, req.originalUrl);
  next();
});

// Webhook do Stripe deve vir ANTES do body-parser JSON
app.post(
  "/stripe-webhook",
  express.raw({ type: "application/json" }),
  handleWebhook
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Sessão em produção usando MySQL
app.set("trust proxy", 1); // atrás de NGINX/HTTPS

app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false, // evita criar sessão sem necessidade
    store: sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === "production", // true em prod (HTTPS)
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

// -------------------- Estáticos --------------------
app.use(express.static(path.resolve(__dirname, "..", "public")));
app.use("/uploads", express.static(path.resolve(__dirname, "..", "uploads")));

// -------------------- Front-end --------------------
app.get("/dashboard", (_req, res) => {
  console.log("HIT /dashboard -> views/stripe-dashboard.html");
  res.sendFile(path.join(__dirname, "views", "stripe-dashboard.html"));
});

// Escolhe UMA home; aqui vou manter JSON de status
app.get("/", (_req, res) => res.json({ name: "Receitas API", status: "ok" }));

// rota de teste
app.get("/test-index", (_req, res) => res.send("Index test route is working!"));

// -------------------- APIs --------------------
console.log("Registrando rotas da API...");
app.use(rolePermissionsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use(lancamentoRoutes);
app.use("/api", cursosRoutes); // Rotas de cursos
app.use(userRoutes);
app.use(courseRoutes);
app.use(categoryRoutes);
app.use("/ebooks/categories", ebookCategoryRoutes);
app.use(tagRoutes);
app.use(recipeRoutes);
app.use("/ebooks", ebookRoutes);
app.use(mediaRoutes);
app.use(commentRoutes);
app.use(analyticsRoutes);
app.use("/earnings", earningsRoutes);
app.use(userPreferenceRoutes);
app.use(healthRoutes);
app.use(pdfRoutes);
app.use(paymentRoutes);
app.use(commissionRoutes);
app.use(withdrawalRoutes);
app.use(stripeRoutes); // não registre /dashboard aqui
app.use("/wallet", walletRoutes);
app.use("/payouts", payoutRoutes);
console.log("Rotas da API registradas.");

// -------------------- Docs --------------------
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// -------------------- 404 & error handlers --------------------
app.use((req, res) => {
  console.log("404 ->", req.method, req.originalUrl);
  res.status(404).json({ message: "Rota não encontrada." });
});

app.use((err, _req, res, _next) => {
  console.error("ERROR middleware:", err?.stack || err);
  res.status(500).json({ message: "Erro interno" });
});

// -------------------- Server --------------------
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📖 API docs: http://localhost:${PORT}/api-docs`);
  
  // Iniciar job de limpeza de notificações
  startNotificationCleanupJob();
});

// -------------------- CRON --------------------
cron.schedule(
  "0 1 * * *",
  () => {
    console.log("🏃‍♂️ Atualizando comissões pendentes (CRON)...");
    updatePendingCommissions();
  },
  { timezone: "America/Sao_Paulo" }
);
