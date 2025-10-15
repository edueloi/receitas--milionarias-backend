import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getStripeDashboardData, login, logout, isAuthenticated } from "../controllers/stripeDashboardController.js";

const router = express.Router();

// Define __dirname para Módulos ES da forma correta
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rota para servir o arquivo HTML de login
router.get("/login", (req, res) => {
  res.sendFile(path.resolve(__dirname, "..", "views", "login.html"));
});

// Rota para processar o login
router.post("/login", login);

// Rota de logout
router.get("/logout", logout);

// Rota para servir o arquivo HTML do dashboard (protegida)
router.get("/stripe-dashboard", isAuthenticated, (req, res) => {
  res.sendFile(path.resolve(__dirname, "..", "views", "stripe-dashboard.html"));
});

// Rota para fornecer os dados do dashboard (protegida)
router.get("/stripe-dashboard-data", isAuthenticated, getStripeDashboardData);

export default router;