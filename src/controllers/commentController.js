import db from '../config/db.js';

// POST /api/recipes/:recipeId/comments
export const addComment = async (req, res) => {
    const { recipeId } = req.params;
    const id_usuario = req.user.id;
    const { avaliacao, comentario, id_comentario_pai } = req.body;
    
    const foto = req.files && req.files.foto ? req.files.foto[0] : null;

    if (!comentario && !avaliacao) {
        return res.status(400).json({ message: 'É necessário fornecer um comentário ou uma avaliação.' });
    }

    if (avaliacao && (avaliacao < 1 || avaliacao > 5)) {
        return res.status(400).json({ message: 'A avaliação deve ser um número entre 1 e 5.' });
    }

    let id_midia_anexo = null;

    try {
        if (foto) {
            const [mediaResult] = await db.query(
                'INSERT INTO midia (nome_arquivo, url_arquivo, tipo_midia) VALUES (?, ?, ?)',
                [foto.originalname, `/uploads/${foto.filename}`, foto.mimetype]
            );
            id_midia_anexo = mediaResult.insertId;
        }

        const sql = `
            INSERT INTO comentarios_avaliacoes 
            (id_receita, id_usuario, avaliacao, comentario, id_midia_anexo, id_comentario_pai)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.query(sql, [recipeId, id_usuario, avaliacao, comentario, id_midia_anexo, id_comentario_pai]);

        res.status(201).json({ message: 'Comentário adicionado com sucesso!', id: result.insertId });
    } catch (error) {
        console.error('Erro ao adicionar comentário:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};


// GET /api/recipes/:recipeId/comments
export const getCommentsByRecipe = async (req, res) => {
    const { recipeId } = req.params;

    try {
        const sql = `
            SELECT 
                c.id, c.id_usuario, c.avaliacao, c.comentario, c.data_criacao, c.id_comentario_pai,
                u.nome, u.sobrenome, u.foto_perfil_url,
                m.url_arquivo as url_midia_anexo
            FROM comentarios_avaliacoes c
            JOIN usuarios u ON c.id_usuario = u.id
            LEFT JOIN midia m ON c.id_midia_anexo = m.id
            WHERE c.id_receita = ?
            ORDER BY c.data_criacao DESC
        `;
        const [comments] = await db.query(sql, [recipeId]);
        
        console.log("Comentários do DB:", comments);

        const commentMap = {};
        const rootComments = [];

        for (const comment of comments) {
            commentMap[comment.id] = comment;
            if (comment.id_comentario_pai) {
                if (!commentMap[comment.id_comentario_pai].respostas) {
                    commentMap[comment.id_comentario_pai].respostas = [];
                }
                commentMap[comment.id_comentario_pai].respostas.push(comment);
            } else {
                rootComments.push(comment);
            }
        }

        console.log("Comentários enviados:", rootComments);
        res.json(rootComments);
    } catch (error) {
        console.error('Erro ao buscar comentários:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};

// PUT /api/comments/:commentId
export const updateComment = async (req, res) => {
    const { commentId } = req.params;
    const { id: id_usuario, permissao } = req.user;
    const { comentario, avaliacao } = req.body;

    if (permissao === 'afiliado' || permissao === 'afiliado_pro') {
        return res.status(403).json({ message: 'Afiliados não podem editar comentários.' });
    }

    try {
        const [comments] = await db.query('SELECT id_usuario FROM comentarios_avaliacoes WHERE id = ?', [commentId]);
        if (comments.length === 0) {
            return res.status(404).json({ message: 'Comentário não encontrado.' });
        }

        if (comments[0].id_usuario !== id_usuario) {
            return res.status(403).json({ message: 'Você não tem permissão para editar este comentário.' });
        }

        await db.query('UPDATE comentarios_avaliacoes SET comentario = ?, avaliacao = ? WHERE id = ?', [comentario, avaliacao, commentId]);
        res.status(200).json({ message: 'Comentário atualizado com sucesso!' });

    } catch (error) {
        console.error('Erro ao editar comentário:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};

// DELETE /api/comments/:commentId
export const deleteComment = async (req, res) => {
    const { commentId } = req.params;
    const { id: id_usuario, permissao } = req.user;

    if (permissao === 'afiliado' || permissao === 'afiliado_pro') {
        return res.status(403).json({ message: 'Afiliados não podem deletar comentários.' });
    }

    try {
        const [comments] = await db.query('SELECT id_usuario FROM comentarios_avaliacoes WHERE id = ?', [commentId]);
        if (comments.length === 0) {
            return res.status(404).json({ message: 'Comentário não encontrado.' });
        }

        if (comments[0].id_usuario !== id_usuario) {
            return res.status(403).json({ message: 'Você não tem permissão para deletar este comentário.' });
        }

        await db.query('DELETE FROM comentarios_avaliacoes WHERE id = ?', [commentId]);
        res.status(204).send();

    } catch (error) {
        console.error('Erro ao deletar comentário:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};