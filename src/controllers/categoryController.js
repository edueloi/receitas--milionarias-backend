import db from '../config/db.js';
import fs from 'fs';
import path from 'path';
import { notifyNewCategory } from '../services/notificationService.js';

const normalizeUploadUrl = (imagem_url) => {
    if (!imagem_url) return null;

    const raw = String(imagem_url).replace(/^[\\/]+/, '');
    if (raw.startsWith('uploads/')) return raw;
    if (raw.startsWith('images/')) return `uploads/${raw}`;

    const uploadsDir = path.join(process.cwd(), 'uploads');
    const imagesPath = path.join(uploadsDir, 'images', raw);

    if (fs.existsSync(imagesPath)) {
        return `uploads/images/${raw}`;
    }

    return `uploads/${raw}`;
};

const resolveImagePath = (imagem_url) => {
    if (!imagem_url) return null;

    const raw = String(imagem_url).replace(/^[\\/]+/, '');
    const cleaned = raw.startsWith('uploads/') ? raw.slice('uploads/'.length) : raw;
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const directPath = path.join(uploadsDir, cleaned);
    const imagesPath = path.join(uploadsDir, 'images', cleaned);

    if (fs.existsSync(directPath)) return directPath;
    if (fs.existsSync(imagesPath)) return imagesPath;

    return directPath;
};

// Middleware de verificação de admin (a ser criado/usado no futuro)
const isAdmin = (req, res, next) => {
    // Lógica para verificar se req.user.role é admin
    // Por enquanto, vamos simular
    next();
};

// POST /api/categories
export const createCategory = [isAdmin, async (req, res) => {
    try {
        const { nome, descricao } = req.body.data ? JSON.parse(req.body.data) : req.body;
        if (!nome) {
            return res.status(400).json({ message: 'O nome da categoria é obrigatório.' });
        }

        // Assume que a tabela `categorias_receitas` tem uma coluna `imagem_url`
        // Salva com subpasta "images" para bater com o destino do uploadMiddleware
        const imagem_url = req.file ? `images/${req.file.filename}` : null;

        const [result] = await db.query(
            'INSERT INTO categorias_receitas (nome, descricao, imagem_url) VALUES (?, ?, ?)',
            [nome, descricao, imagem_url]
        );

        const newCategory = {
            id: result.insertId,
            nome,
            descricao,
            imagem_url: normalizeUploadUrl(imagem_url)
        };

        // 🔔 Notificar admins sobre nova categoria
        await notifyNewCategory(nome);

        res.status(201).json(newCategory);
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

        const categoriesWithFullUrl = categories.map(category => ({
            ...category,
            imagem_url: normalizeUploadUrl(category.imagem_url)
        }));

        res.json(categoriesWithFullUrl);
    } catch (error) {
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};

// PUT /api/categories/:id
export const updateCategory = [isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, descricao } = req.body.data ? JSON.parse(req.body.data) : req.body;

        if (!nome) {
            return res.status(400).json({ message: 'O nome da categoria é obrigatório.' });
        }

        let query = 'UPDATE categorias_receitas SET nome = ?, descricao = ?';
        const params = [nome, descricao];

        if (req.file) {
            query += ', imagem_url = ?';
            params.push(`images/${req.file.filename}`);
        }

        query += ' WHERE id = ?';
        params.push(id);

        const [result] = await db.query(query, params);

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
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // First, get the category to find the image URL
        const [categories] = await connection.query('SELECT imagem_url FROM categorias_receitas WHERE id = ?', [id]);

        if (categories.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Categoria não encontrada.' });
        }

        const category = categories[0];
        const { imagem_url } = category;

        // If there is an image, delete it from the filesystem
        if (imagem_url) {
            const imagePath = resolveImagePath(imagem_url);
            if (imagePath && fs.existsSync(imagePath)) {
                fs.unlink(imagePath, (err) => {
                    if (err) {
                        // Log the error, but don't block the deletion of the category
                        console.error('Erro ao deletar a imagem da categoria:', err);
                    }
                });
            }
        }

        // Then, delete the category from the database
        const [result] = await connection.query('DELETE FROM categorias_receitas WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            // This case should ideally not be reached due to the check above, but as a safeguard:
            await connection.rollback();
            return res.status(404).json({ message: 'Categoria não encontrada.' });
        }

        await connection.commit();
        res.status(204).send(); // No content

    } catch (error) {
        await connection.rollback();
        // Check for foreign key constraint violation error
        if (error.code === 'ER_ROW_IS_REFERENCED_2') { 
            return res.status(409).json({
                message: 'Não é possível deletar esta categoria porque existem receitas associadas a ela. Por favor, remova ou reassocie as receitas antes de tentar novamente.'
            });
        }
        console.error('Erro ao deletar categoria:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    } finally {
        if (connection) connection.release();
    }
}];
