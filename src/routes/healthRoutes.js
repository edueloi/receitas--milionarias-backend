import express from "express";
import db from "../config/db.js"; // ajuste o caminho conforme seu projeto

const router = express.Router();

router.get("/health", async (req, res) => {
  try {
    // Testa conexão com o banco
    await db.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
