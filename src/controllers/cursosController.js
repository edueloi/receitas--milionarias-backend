import pool from '../config/db.js';

// ==================== CURSOS ====================

// Listar todos os cursos (com filtros) - Público
export const listarCursos = async (req, res) => {
  try {
    const { categoria, nivel, busca } = req.query;
    
    let query = 'SELECT * FROM cursos_vw WHERE status = "publicado"';
    const params = [];

    if (categoria) {
      query += ' AND id_categoria = ?';
      params.push(categoria);
    }

    if (nivel) {
      query += ' AND nivel = ?';
      params.push(nivel);
    }

    if (busca) {
      query += ' AND (titulo LIKE ? OR descricao_curta LIKE ?)';
      params.push(`%${busca}%`, `%${busca}%`);
    }

    query += ' ORDER BY publicado_em DESC, criado_em DESC';

    const [cursos] = await pool.query(query, params);
    res.json(cursos);
  } catch (error) {
    console.error('Erro ao listar cursos:', error);
    res.status(500).json({ error: 'Erro ao buscar cursos' });
  }
};

// Listar MEUS cursos (apenas do instrutor logado)
export const listarMeusCursos = async (req, res) => {
  try {
    const userId = req.user.id;
    const userPermissao = req.user.permissao;

    let query = 'SELECT * FROM cursos_vw WHERE 1=1';
    const params = [];

    // Se não for admin, só mostra cursos do próprio usuário
    if (userPermissao !== 'admin') {
      query += ' AND id_instrutor = ?';
      params.push(userId);
    }
    // Admin vê todos os cursos

    query += ' ORDER BY criado_em DESC';

    const [cursos] = await pool.query(query, params);
    res.json(cursos);
  } catch (error) {
    console.error('Erro ao listar meus cursos:', error);
    res.status(500).json({ error: 'Erro ao buscar meus cursos' });
  }
};

// Buscar curso por ID ou slug (com módulos e aulas)
export const buscarCurso = async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    
    // Busca por ID ou slug
    const query = `
      SELECT * FROM cursos_vw 
      WHERE id = ? OR slug = ?
    `;
    
    const [cursos] = await pool.query(query, [idOrSlug, idOrSlug]);
    
    if (cursos.length === 0) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    const curso = cursos[0];

    // Buscar módulos com aulas
    const [modulos] = await pool.query(`
      SELECT * FROM modulos_curso 
      WHERE id_curso = ? 
      ORDER BY ordem ASC
    `, [curso.id]);

    // Para cada módulo, buscar as aulas
    for (let modulo of modulos) {
      const [aulas] = await pool.query(`
        SELECT * FROM aulas 
        WHERE id_modulo = ? 
        ORDER BY ordem ASC
      `, [modulo.id]);
      
      modulo.aulas = aulas;
    }

    curso.modulos = modulos;

    // Incrementar views
    await pool.query('UPDATE cursos SET views = views + 1 WHERE id = ?', [curso.id]);

    res.json(curso);
  } catch (error) {
    console.error('Erro ao buscar curso:', error);
    res.status(500).json({ error: 'Erro ao buscar curso' });
  }
};

// Criar novo curso (apenas instrutores/admin)
export const criarCurso = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      titulo,
      descricao_curta,
      descricao,
      id_categoria,
      nivel,
      preco_centavos,
      capa_url,
      video_preview_url,
      status
    } = req.body;

    const id_instrutor = req.user.id;

    // Validar se usuário não é afiliado
    if (req.user.permissao === 'afiliado' || req.user.permissao === 'afiliado_pro') {
      return res.status(403).json({ error: 'Afiliados não podem criar cursos' });
    }

    // Gerar slug
    const slug = titulo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const [result] = await connection.query(
      `INSERT INTO cursos (
        id_instrutor, titulo, slug, descricao_curta, descricao, 
        id_categoria, nivel, preco_centavos, capa_url, video_preview_url, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_instrutor, titulo, slug, descricao_curta, descricao,
        id_categoria, nivel, preco_centavos, capa_url, video_preview_url,
        status || 'rascunho'
      ]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Curso criado com sucesso',
      id: result.insertId,
      slug
    });
  } catch (error) {
    await connection.rollback();
    console.error('Erro ao criar curso:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Já existe um curso com este título' });
    }
    
    res.status(500).json({ error: 'Erro ao criar curso' });
  } finally {
    connection.release();
  }
};

// Atualizar curso
export const atualizarCurso = async (req, res) => {
  try {
    const { id } = req.params;
    const campos = req.body;
    const id_instrutor = req.user.id;

    // Verificar se o curso pertence ao instrutor (ou se é admin)
    const [cursos] = await pool.query('SELECT id_instrutor FROM cursos WHERE id = ?', [id]);
    
    if (cursos.length === 0) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    if (cursos[0].id_instrutor !== id_instrutor && req.user.permissao !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão para editar este curso' });
    }

    // Atualizar campos permitidos
    const camposPermitidos = [
      'titulo', 'descricao_curta', 'descricao', 'id_categoria', 'nivel',
      'preco_centavos', 'capa_url', 'video_preview_url', 'status'
    ];

    const updates = [];
    const valores = [];

    for (const campo of camposPermitidos) {
      if (campos[campo] !== undefined) {
        updates.push(`${campo} = ?`);
        valores.push(campos[campo]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    valores.push(id);

    await pool.query(
      `UPDATE cursos SET ${updates.join(', ')} WHERE id = ?`,
      valores
    );

    res.json({ message: 'Curso atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar curso:', error);
    res.status(500).json({ error: 'Erro ao atualizar curso' });
  }
};

// Deletar curso
export const deletarCurso = async (req, res) => {
  try {
    const { id } = req.params;
    const id_instrutor = req.user.id;

    // Verificar permissão
    const [cursos] = await pool.query('SELECT id_instrutor FROM cursos WHERE id = ?', [id]);
    
    if (cursos.length === 0) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    if (cursos[0].id_instrutor !== id_instrutor && req.user.permissao !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão para deletar este curso' });
    }

    await pool.query('DELETE FROM cursos WHERE id = ?', [id]);

    res.json({ message: 'Curso deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar curso:', error);
    res.status(500).json({ error: 'Erro ao deletar curso' });
  }
};

// ==================== MÓDULOS ====================

// Criar módulo
export const criarModulo = async (req, res) => {
  try {
    const { id_curso, titulo, descricao, ordem } = req.body;

    // Verificar se o curso pertence ao instrutor
    const [cursos] = await pool.query('SELECT id_instrutor FROM cursos WHERE id = ?', [id_curso]);
    
    if (cursos.length === 0) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    if (cursos[0].id_instrutor !== req.user.id && req.user.permissao !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const [result] = await pool.query(
      'INSERT INTO modulos_curso (id_curso, titulo, descricao, ordem) VALUES (?, ?, ?, ?)',
      [id_curso, titulo, descricao, ordem || 0]
    );

    res.status(201).json({
      message: 'Módulo criado com sucesso',
      id: result.insertId
    });
  } catch (error) {
    console.error('Erro ao criar módulo:', error);
    res.status(500).json({ error: 'Erro ao criar módulo' });
  }
};

// Atualizar módulo
export const atualizarModulo = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descricao, ordem } = req.body;

    // Verificar permissão via curso
    const [modulos] = await pool.query(`
      SELECT mc.*, c.id_instrutor 
      FROM modulos_curso mc
      JOIN cursos c ON c.id = mc.id_curso
      WHERE mc.id = ?
    `, [id]);

    if (modulos.length === 0) {
      return res.status(404).json({ error: 'Módulo não encontrado' });
    }

    if (modulos[0].id_instrutor !== req.user.id && req.user.permissao !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    await pool.query(
      'UPDATE modulos_curso SET titulo = ?, descricao = ?, ordem = ? WHERE id = ?',
      [titulo, descricao, ordem, id]
    );

    res.json({ message: 'Módulo atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar módulo:', error);
    res.status(500).json({ error: 'Erro ao atualizar módulo' });
  }
};

// Deletar módulo
export const deletarModulo = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar permissão
    const [modulos] = await pool.query(`
      SELECT mc.*, c.id_instrutor 
      FROM modulos_curso mc
      JOIN cursos c ON c.id = mc.id_curso
      WHERE mc.id = ?
    `, [id]);

    if (modulos.length === 0) {
      return res.status(404).json({ error: 'Módulo não encontrado' });
    }

    if (modulos[0].id_instrutor !== req.user.id && req.user.permissao !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    await pool.query('DELETE FROM modulos_curso WHERE id = ?', [id]);

    res.json({ message: 'Módulo deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar módulo:', error);
    res.status(500).json({ error: 'Erro ao deletar módulo' });
  }
};

// ==================== AULAS ====================

// Criar aula
export const criarAula = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      id_modulo,
      titulo,
      descricao,
      tipo_conteudo,
      video_url,
      conteudo_texto,
      arquivo_url,
      duracao_min,
      ordem,
      gratuita
    } = req.body;

    // Verificar permissão
    const [modulos] = await connection.query(`
      SELECT mc.id_curso, c.id_instrutor 
      FROM modulos_curso mc
      JOIN cursos c ON c.id = mc.id_curso
      WHERE mc.id = ?
    `, [id_modulo]);

    if (modulos.length === 0) {
      return res.status(404).json({ error: 'Módulo não encontrado' });
    }

    if (modulos[0].id_instrutor !== req.user.id && req.user.permissao !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const [result] = await connection.query(
      `INSERT INTO aulas (
        id_modulo, titulo, descricao, tipo_conteudo, video_url,
        conteudo_texto, arquivo_url, duracao_min, ordem, gratuita
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_modulo, titulo, descricao, tipo_conteudo || 'video', video_url,
        conteudo_texto, arquivo_url, duracao_min || 0, ordem || 0, gratuita || 0
      ]
    );

    // Atualizar duração total do curso
    await connection.query(`
      UPDATE cursos c
      SET c.duracao_total_min = (
        SELECT SUM(a.duracao_min)
        FROM aulas a
        JOIN modulos_curso mc ON a.id_modulo = mc.id
        WHERE mc.id_curso = ?
      )
      WHERE c.id = ?
    `, [modulos[0].id_curso, modulos[0].id_curso]);

    await connection.commit();

    res.status(201).json({
      message: 'Aula criada com sucesso',
      id: result.insertId
    });
  } catch (error) {
    await connection.rollback();
    console.error('Erro ao criar aula:', error);
    res.status(500).json({ error: 'Erro ao criar aula' });
  } finally {
    connection.release();
  }
};

// Atualizar aula
export const atualizarAula = async (req, res) => {
  try {
    const { id } = req.params;
    const campos = req.body;

    // Verificar permissão
    const [aulas] = await pool.query(`
      SELECT a.*, c.id_instrutor, mc.id_curso
      FROM aulas a
      JOIN modulos_curso mc ON a.id_modulo = mc.id
      JOIN cursos c ON mc.id_curso = c.id
      WHERE a.id = ?
    `, [id]);

    if (aulas.length === 0) {
      return res.status(404).json({ error: 'Aula não encontrada' });
    }

    if (aulas[0].id_instrutor !== req.user.id && req.user.permissao !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const camposPermitidos = [
      'titulo', 'descricao', 'tipo_conteudo', 'video_url',
      'conteudo_texto', 'arquivo_url', 'duracao_min', 'ordem', 'gratuita'
    ];

    const updates = [];
    const valores = [];

    for (const campo of camposPermitidos) {
      if (campos[campo] !== undefined) {
        updates.push(`${campo} = ?`);
        valores.push(campos[campo]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    valores.push(id);

    await pool.query(
      `UPDATE aulas SET ${updates.join(', ')} WHERE id = ?`,
      valores
    );

    // Atualizar duração total do curso se mudou duracao_min
    if (campos.duracao_min !== undefined) {
      await pool.query(`
        UPDATE cursos c
        SET c.duracao_total_min = (
          SELECT SUM(a.duracao_min)
          FROM aulas a
          JOIN modulos_curso mc ON a.id_modulo = mc.id
          WHERE mc.id_curso = ?
        )
        WHERE c.id = ?
      `, [aulas[0].id_curso, aulas[0].id_curso]);
    }

    res.json({ message: 'Aula atualizada com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar aula:', error);
    res.status(500).json({ error: 'Erro ao atualizar aula' });
  }
};

// Deletar aula
export const deletarAula = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar permissão
    const [aulas] = await pool.query(`
      SELECT a.*, c.id_instrutor, mc.id_curso
      FROM aulas a
      JOIN modulos_curso mc ON a.id_modulo = mc.id
      JOIN cursos c ON mc.id_curso = c.id
      WHERE a.id = ?
    `, [id]);

    if (aulas.length === 0) {
      return res.status(404).json({ error: 'Aula não encontrada' });
    }

    if (aulas[0].id_instrutor !== req.user.id && req.user.permissao !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    await pool.query('DELETE FROM aulas WHERE id = ?', [id]);

    // Atualizar duração total
    await pool.query(`
      UPDATE cursos c
      SET c.duracao_total_min = (
        SELECT COALESCE(SUM(a.duracao_min), 0)
        FROM aulas a
        JOIN modulos_curso mc ON a.id_modulo = mc.id
        WHERE mc.id_curso = ?
      )
      WHERE c.id = ?
    `, [aulas[0].id_curso, aulas[0].id_curso]);

    res.json({ message: 'Aula deletada com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar aula:', error);
    res.status(500).json({ error: 'Erro ao deletar aula' });
  }
};

// ==================== UPLOAD DE ARQUIVOS ====================

// Upload de vídeo para aula
export const uploadVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    // URL pública do vídeo
    const videoUrl = `/uploads/videos/${req.file.filename}`;
    
    res.json({
      success: true,
      message: 'Vídeo enviado com sucesso',
      url: videoUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (error) {
    console.error('Erro no upload de vídeo:', error);
    res.status(500).json({ error: 'Erro ao fazer upload do vídeo' });
  }
};

// Upload de imagem para capa do curso
export const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    }

    // URL pública da imagem
    const imageUrl = `/uploads/images/${req.file.filename}`;
    
    res.json({
      success: true,
      message: 'Imagem enviada com sucesso',
      url: imageUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (error) {
    console.error('Erro no upload de imagem:', error);
    res.status(500).json({ error: 'Erro ao fazer upload da imagem' });
  }
};

// Upload de PDF para aula
export const uploadPDF = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    // URL pública do PDF
    const pdfUrl = `/uploads/pdfs/${req.file.filename}`;
    
    res.json({
      success: true,
      message: 'PDF enviado com sucesso',
      url: pdfUrl,
      filename: req.file.filename,
      size: req.file.size
    });
  } catch (error) {
    console.error('Erro no upload de PDF:', error);
    res.status(500).json({ error: 'Erro ao fazer upload do PDF' });
  }
};

// ==================== CATEGORIAS ====================

export const listarCategorias = async (req, res) => {
  try {
    const [categorias] = await pool.query(`
      SELECT * FROM categorias_cursos 
      WHERE ativa = 1 
      ORDER BY nome ASC
    `);
    
    res.json(categorias);
  } catch (error) {
    console.error('Erro ao listar categorias:', error);
    res.status(500).json({ error: 'Erro ao buscar categorias' });
  }
};
