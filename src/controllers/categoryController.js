// src/controllers/categoryController.js
import db from '../config/db.js';

// Middleware de verificação de admin (a ser criado/usado no futuro)
const isAdmin = (req, res, next) => {
    // Lógica para verificar se req.user.role é admin
    // Por enquanto, vamos simular
    next();
};

// POST /api/categories
export const createCategory = [isAdmin, async (req, res) => {
    const { nome, descricao } = req.body;
    if (!nome) {
        return res.status(400).json({ message: 'O nome da categoria é obrigatório.' });
    }
    try {
        const [result] = await db.query('INSERT INTO categorias_receitas (nome, descricao) VALUES (?, ?)', [nome, descricao]);
        res.status(201).json({ id: result.insertId, nome, descricao });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Esta categoria já existe.' });
        }
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
}];

// GET /api/categories
export const getAllCategories = async (req, res) => {
    try {
        const [categories] = await db.query('SELECT * FROM categorias_receitas ORDER BY nome');
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};

// PUT /api/categories/:id
export const updateCategory = [isAdmin, async (req, res) => {
    const { id } = req.params;
    const { nome, descricao } = req.body;
    if (!nome) {
        return res.status(400).json({ message: 'O nome da categoria é obrigatório.' });
    }
    try {
        const [result] = await db.query('UPDATE categorias_receitas SET nome = ?, descricao = ? WHERE id = ?', [nome, descricao, id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Categoria não encontrada.' });
        }
        res.json({ message: 'Categoria atualizada com sucesso.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
}];

// DELETE /api/categories/:id
export const deleteCategory = [isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.query('DELETE FROM categorias_receitas WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Categoria não encontrada.' });
        }
        res.status(204).send(); // No content
    } catch (error) {
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
}];
