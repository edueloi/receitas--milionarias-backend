// controllers/ebookCategoryController.js
import db from "../config/db.js";
import slugify from "slugify";

export const createEbookCategory = async (req, res) => {
  const { nome } = req.body;
  if (!nome) {
    return res.status(400).json({ message: "O nome da categoria é obrigatório." });
  }
  const slug = slugify(nome, { lower: true, strict: true });

  try {
    const [result] = await db.query(
      "INSERT INTO categorias_ebooks (nome, slug) VALUES (?, ?)",
      [nome, slug]
    );
    res.status(201).json({ id: result.insertId, nome, slug });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Esta categoria de ebook já existe." });
    }
    console.error("Erro ao criar categoria de ebook:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
};

export const getAllEbookCategories = async (_req, res) => {
  try {
    const [categories] = await db.query(
      "SELECT * FROM categorias_ebooks WHERE ativa = 1 ORDER BY nome"
    );
    res.json(categories);
  } catch (error) {
    console.error("Erro ao buscar categorias de ebook:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
};
