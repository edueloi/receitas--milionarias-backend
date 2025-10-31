// src/controllers/tagController.js
import db from '../config/db.js';
import { notifyNewTag } from '../services/notificationService.js';

// Middleware de verificação de admin (a ser criado/usado no futuro)
const isAdmin = (req, res, next) => {
    // Lógica para verificar se req.user.role é admin
    next();
};

// POST /api/tags
export const createTag = [isAdmin, async (req, res) => {
    try {
        const { nome } = req.body.data ? JSON.parse(req.body.data) : req.body;
        if (!nome) {
            return res.status(400).json({ message: 'O nome da tag é obrigatório.' });
        }

        const [result] = await db.query('INSERT INTO tags (nome) VALUES (?)', [nome]);
        
        // 🔔 Notificar admins sobre nova tag
        await notifyNewTag(nome);
        
        res.status(201).json({ id: result.insertId, nome });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Esta tag já existe.' });
        }
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
}];

// GET /api/tags
export const getAllTags = async (req, res) => {
    try {
        const [tags] = await db.query('SELECT * FROM tags ORDER BY nome');
        res.json(tags);
    } catch (error) {
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};

// DELETE /api/tags/:id
export const deleteTag = [isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.query('DELETE FROM tags WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Tag não encontrada.' });
        }
        res.status(204).send(); // No content
    } catch (error) {
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
}];
