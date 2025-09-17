// src/controllers/courseController.js
import db from '../config/db.js';

// --- GESTÃO DE CURSOS (ADMIN) ---
// POST /api/courses (Cria um novo curso)
export const createCourse = async (req, res) => {
    // Adicionar verificação de permissão de admin
    const { nome_curso, descricao_curso } = req.body;

    if (!nome_curso) {
        return res.status(400).json({ message: 'O nome do curso é obrigatório.' });
    }

    try {
        const sql = 'INSERT INTO cursos (nome_curso, descricao_curso) VALUES (?, ?)';
        const [result] = await db.query(sql, [nome_curso, descricao_curso]);
        res.status(201).json({ message: 'Curso criado com sucesso!', courseId: result.insertId });
    } catch (error) {
        console.error('Erro ao criar curso:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
};

// GET /api/courses (Lista todos os cursos)
export const getAllCourses = async (req, res) => {
    try {
        const [courses] = await db.query('SELECT * FROM cursos ORDER BY nome_curso');
        res.json(courses);
    } catch (error) {
        console.error('Erro ao listar cursos:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
};

// --- GESTÃO DE CURSOS DE USUÁRIOS ---
// POST /api/users/:userId/courses (Associa um curso a um usuário)
export const assignCourseToUser = async (req, res) => {
    // Adicionar verificação de permissão de admin
    const { userId } = req.params;
    const { courseId } = req.body;

    if (!courseId) {
        return res.status(400).json({ message: 'O ID do curso é obrigatório.' });
    }

    try {
        const sql = 'INSERT INTO usuario_cursos (id_usuario, id_curso) VALUES (?, ?)';
        await db.query(sql, [userId, courseId]);
        res.status(201).json({ message: 'Curso associado ao usuário com sucesso!' });
    } catch (error) {
        // Tratar erro de chave duplicada (usuário já tem o curso)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Este usuário já possui este curso.' });
        }
        console.error('Erro ao associar curso:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
};

// GET /api/users/:userId/courses (Lista os cursos de um usuário)
export const getUserCourses = async (req, res) => {
    const { userId } = req.params;

    try {
        const sql = `
            SELECT c.id, c.nome_curso, c.descricao_curso, uc.data_aquisicao
            FROM usuario_cursos uc
            JOIN cursos c ON uc.id_curso = c.id
            WHERE uc.id_usuario = ?
            ORDER BY c.nome_curso;
        `;
        const [courses] = await db.query(sql, [userId]);
        res.json(courses);
    } catch (error) {
        console.error('Erro ao listar cursos do usuário:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
};