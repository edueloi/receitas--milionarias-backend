import db from "../config/db.js";
import slugify from "slugify";

export const createEbookCategory = async (req, res) => {
    const { nome } = req.body;
    if (!nome) {
        return res.status(400).json({ message: 'O nome da categoria é obrigatório.' });
    }
    const slug = slugify(nome, { lower: true, strict: true });

    try {
        const [result] = await db.query(
            'INSERT INTO categorias_ebooks (nome, slug) VALUES (?, ?)',
            [nome, slug]
        );
        const newCategory = { id: result.insertId, nome, slug };
        res.status(201).json(newCategory);
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Esta categoria de ebook já existe.' });
        }
        console.error("Erro ao criar categoria de ebook:", error);
        res.status(500).json({ message: "Erro interno no servidor." });
    }
};

export const getAllEbookCategories = async (req, res) => {
    try {
        const [categories] = await db.query('SELECT * FROM categorias_ebooks WHERE ativa = 1 ORDER BY nome');
        res.json(categories);
    } catch (error) {
        console.error("Erro ao buscar categorias de ebook:", error);
        res.status(500).json({ message: "Erro interno no servidor." });
    }
};

export const deleteEbookCategory = async (req, res) => {
    const { id } = req.params;
    try {
        const [ebooks] = await db.query('SELECT id FROM ebooks WHERE categoria_id = ?', [id]);
        if (ebooks.length > 0) {
            return res.status(409).json({ message: 'Não é possível deletar esta categoria, pois ela está sendo usada por ebooks.' });
        }

        const [result] = await db.query('DELETE FROM categorias_ebooks WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Categoria de ebook não encontrada.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error("Erro ao deletar categoria de ebook:", error);
        res.status(500).json({ message: "Erro interno no servidor." });
    }
};