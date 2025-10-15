// src/controllers/commentController.js
import db from '../config/db.js';

// 🔸 Atualiza a média e quantidade de avaliações de uma receita específica
const updateRecipeRatings = async (recipeId) => {
  try {
    await db.query(`
      UPDATE receitas r
      LEFT JOIN (
          SELECT 
              id_receita, 
              ROUND(AVG(avaliacao), 2) AS media, 
              COUNT(avaliacao) AS total
          FROM comentarios_avaliacoes
          WHERE id_receita = ?
          GROUP BY id_receita
      ) stats ON stats.id_receita = r.id
      SET 
          r.media_avaliacoes = IFNULL(stats.media, 0),
          r.quantidade_avaliacoes = IFNULL(stats.total, 0)
      WHERE r.id = ?;
    `, [recipeId, recipeId]);

    console.log(`✅ Média e contagem atualizadas para receita ${recipeId}`);
  } catch (error) {
    console.error('❌ Erro ao atualizar médias da receita:', error);
  }
};

// 🔹 Atualiza a média e quantidade de TODAS as receitas do sistema
export const recalculateAllRecipeRatings = async () => {
  try {
    await db.query(`
      UPDATE receitas r
      LEFT JOIN (
          SELECT 
              id_receita, 
              ROUND(AVG(avaliacao), 2) AS media, 
              COUNT(avaliacao) AS total
          FROM comentarios_avaliacoes
          GROUP BY id_receita
      ) stats ON stats.id_receita = r.id
      SET 
          r.media_avaliacoes = IFNULL(stats.media, 0),
          r.quantidade_avaliacoes = IFNULL(stats.total, 0);
    `);

    console.log("✅ Todas as médias e quantidades foram recalculadas com sucesso!");
  } catch (error) {
    console.error("❌ Erro ao recalcular todas as médias:", error);
  }
};

// 🔹 POST /recipes/:recipeId/comments
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

    const [result] = await db.query(`
      INSERT INTO comentarios_avaliacoes 
      (id_receita, id_usuario, avaliacao, comentario, id_midia_anexo, id_comentario_pai)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [recipeId, id_usuario, avaliacao, comentario, id_midia_anexo, id_comentario_pai]);

    await updateRecipeRatings(recipeId);

    res.status(201).json({ message: 'Comentário adicionado com sucesso!', id: result.insertId });
  } catch (error) {
    console.error('Erro ao adicionar comentário:', error);
    res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
  }
};

// 🔹 GET /recipes/:recipeId/comments
export const getCommentsByRecipe = async (req, res) => {
  const { recipeId } = req.params;

  try {
    const [comments] = await db.query(`
      SELECT 
        c.id, c.id_usuario, c.avaliacao, c.comentario, c.data_criacao, c.id_comentario_pai,
        u.nome, u.sobrenome, u.foto_perfil_url,
        m.url_arquivo as url_midia_anexo
      FROM comentarios_avaliacoes c
      JOIN usuarios u ON c.id_usuario = u.id
      LEFT JOIN midia m ON c.id_midia_anexo = m.id
      WHERE c.id_receita = ?
      ORDER BY c.data_criacao DESC
    `, [recipeId]);

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

    res.json(rootComments);
  } catch (error) {
    console.error('Erro ao buscar comentários:', error);
    res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
  }
};

// 🔹 PUT /comments/:commentId
export const updateComment = async (req, res) => {
  const { commentId } = req.params;
  const { id: id_usuario, permissao } = req.user;
  const { comentario, avaliacao } = req.body;

  if (permissao === 'afiliado' || permissao === 'afiliado_pro') {
    return res.status(403).json({ message: 'Afiliados não podem editar comentários.' });
  }

  try {
    const [comments] = await db.query(
      'SELECT id_usuario, id_receita FROM comentarios_avaliacoes WHERE id = ?',
      [commentId]
    );

    if (comments.length === 0) {
      return res.status(404).json({ message: 'Comentário não encontrado.' });
    }

    const { id_usuario: autor, id_receita } = comments[0];

    if (autor !== id_usuario) {
      return res.status(403).json({ message: 'Você não tem permissão para editar este comentário.' });
    }

    await db.query(
      'UPDATE comentarios_avaliacoes SET comentario = ?, avaliacao = ? WHERE id = ?',
      [comentario, avaliacao, commentId]
    );

    await updateRecipeRatings(id_receita);

    res.status(200).json({ message: 'Comentário atualizado com sucesso!' });
  } catch (error) {
    console.error('Erro ao editar comentário:', error);
    res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
  }
};

// 🔹 DELETE /comments/:commentId
export const deleteComment = async (req, res) => {
  const { commentId } = req.params;
  const { id: id_usuario, permissao } = req.user;

  if (permissao === 'afiliado' || permissao === 'afiliado_pro') {
    return res.status(403).json({ message: 'Afiliados não podem deletar comentários.' });
  }

  try {
    const [comments] = await db.query(
      'SELECT id_usuario, id_receita FROM comentarios_avaliacoes WHERE id = ?',
      [commentId]
    );

    if (comments.length === 0) {
      return res.status(404).json({ message: 'Comentário não encontrado.' });
    }

    const { id_usuario: autor, id_receita } = comments[0];

    if (autor !== id_usuario) {
      return res.status(403).json({ message: 'Você não tem permissão para deletar este comentário.' });
    }

    await db.query('DELETE FROM comentarios_avaliacoes WHERE id = ?', [commentId]);

    await updateRecipeRatings(id_receita);

    res.status(204).send();
  } catch (error) {
    console.error('Erro ao deletar comentário:', error);
    res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
  }
};
