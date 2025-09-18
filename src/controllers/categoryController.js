import db from '../config/db.js';

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
        const imagem_url = req.file ? req.file.filename : null;

        const [result] = await db.query(
            'INSERT INTO categorias_receitas (nome, descricao, imagem_url) VALUES (?, ?, ?)',
            [nome, descricao, imagem_url]
        );

        const newCategory = {
            id: result.insertId,
            nome,
            descricao,
            imagem_url: imagem_url ? `uploads/${imagem_url}` : null
        };

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
            imagem_url: category.imagem_url
                ? `uploads/${category.imagem_url}`
                : null
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
            params.push(req.file.filename);
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
