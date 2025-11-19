import pool from '../config/db.js';

// Matricular aluno em um curso
export const matricularAluno = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id_curso } = req.body;
    const id_usuario = req.user.id;

    // Verificar se curso existe e está publicado
    const [cursos] = await connection.query(
      'SELECT id, status FROM cursos WHERE id = ?',
      [id_curso]
    );

    if (cursos.length === 0) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    if (cursos[0].status !== 'publicado') {
      return res.status(400).json({ error: 'Curso não disponível para matrícula' });
    }

    // Verificar se já está matriculado
    const [matriculasExistentes] = await connection.query(
      'SELECT id FROM matriculas_curso WHERE id_usuario = ? AND id_curso = ?',
      [id_usuario, id_curso]
    );

    if (matriculasExistentes.length > 0) {
      return res.status(400).json({ error: 'Você já está matriculado neste curso' });
    }

    // Criar matrícula
    const [result] = await connection.query(
      'INSERT INTO matriculas_curso (id_usuario, id_curso, progresso_percentual) VALUES (?, ?, 0)',
      [id_usuario, id_curso]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Matrícula realizada com sucesso',
      id_matricula: result.insertId
    });
  } catch (error) {
    await connection.rollback();
    console.error('Erro ao matricular aluno:', error);
    res.status(500).json({ error: 'Erro ao realizar matrícula' });
  } finally {
    connection.release();
  }
};

// Buscar progresso do aluno em um curso
export const buscarProgresso = async (req, res) => {
  try {
    const { id_curso } = req.params;
    const id_usuario = req.user.id;

    // Buscar matrícula
    const [matriculas] = await pool.query(
      `SELECT 
        m.*,
        c.titulo as curso_titulo,
        c.duracao_total_min,
        (SELECT COUNT(*) FROM aulas a 
         JOIN modulos_curso mc ON a.id_modulo = mc.id 
         WHERE mc.id_curso = m.id_curso) as total_aulas,
        (SELECT COUNT(*) FROM progresso_aulas pa 
         WHERE pa.id_matricula = m.id AND pa.concluida = 1) as aulas_concluidas
      FROM matriculas_curso m
      JOIN cursos c ON c.id = m.id_curso
      WHERE m.id_usuario = ? AND m.id_curso = ?`,
      [id_usuario, id_curso]
    );

    if (matriculas.length === 0) {
      return res.status(404).json({ error: 'Você não está matriculado neste curso' });
    }

    const matricula = matriculas[0];

    // Buscar progresso detalhado por aula
    const [progressoAulas] = await pool.query(
      `SELECT 
        pa.*,
        a.titulo as aula_titulo,
        a.duracao_min,
        mc.titulo as modulo_titulo
      FROM progresso_aulas pa
      JOIN aulas a ON a.id = pa.id_aula
      JOIN modulos_curso mc ON mc.id = a.id_modulo
      WHERE pa.id_matricula = ?
      ORDER BY mc.ordem, a.ordem`,
      [matricula.id]
    );

    res.json({
      matricula,
      progresso_aulas: progressoAulas
    });
  } catch (error) {
    console.error('Erro ao buscar progresso:', error);
    res.status(500).json({ error: 'Erro ao buscar progresso' });
  }
};

// Marcar aula como concluída
export const marcarAulaConcluida = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id_aula } = req.params;
    const { tempo_assistido_seg } = req.body;
    const id_usuario = req.user.id;

    // Buscar matrícula
    const [aulas] = await connection.query(
      `SELECT a.id, mc.id_curso, m.id as id_matricula
      FROM aulas a
      JOIN modulos_curso mc ON a.id_modulo = mc.id
      JOIN matriculas_curso m ON m.id_curso = mc.id_curso
      WHERE a.id = ? AND m.id_usuario = ?`,
      [id_aula, id_usuario]
    );

    if (aulas.length === 0) {
      return res.status(404).json({ error: 'Aula ou matrícula não encontrada' });
    }

    const { id_matricula, id_curso } = aulas[0];

    // Inserir ou atualizar progresso da aula
    await connection.query(
      `INSERT INTO progresso_aulas 
        (id_matricula, id_aula, concluida, tempo_assistido_seg, data_conclusao)
      VALUES (?, ?, 1, ?, NOW())
      ON DUPLICATE KEY UPDATE 
        concluida = 1, 
        tempo_assistido_seg = ?,
        data_conclusao = NOW()`,
      [id_matricula, id_aula, tempo_assistido_seg || 0, tempo_assistido_seg || 0]
    );

    // Atualizar última aula assistida
    await connection.query(
      'UPDATE matriculas_curso SET ultima_aula_id = ? WHERE id = ?',
      [id_aula, id_matricula]
    );

    // Calcular progresso percentual
    const [stats] = await connection.query(
      `SELECT 
        COUNT(*) as total_aulas,
        SUM(CASE WHEN pa.concluida = 1 THEN 1 ELSE 0 END) as aulas_concluidas
      FROM aulas a
      JOIN modulos_curso mc ON a.id_modulo = mc.id
      LEFT JOIN progresso_aulas pa ON pa.id_aula = a.id AND pa.id_matricula = ?
      WHERE mc.id_curso = ?`,
      [id_matricula, id_curso]
    );

    const progresso = stats[0].total_aulas > 0 
      ? (stats[0].aulas_concluidas / stats[0].total_aulas) * 100 
      : 0;

    // Atualizar progresso na matrícula
    await connection.query(
      'UPDATE matriculas_curso SET progresso_percentual = ? WHERE id = ?',
      [progresso, id_matricula]
    );

    // Se chegou a 100%, marcar data de conclusão e gerar certificado
    if (progresso >= 100) {
      await connection.query(
        'UPDATE matriculas_curso SET data_conclusao = NOW() WHERE id = ? AND data_conclusao IS NULL',
        [id_matricula]
      );

      // Verificar se já existe certificado
      const [certExistentes] = await connection.query(
        'SELECT id FROM certificados WHERE id_usuario = ? AND id_curso = ?',
        [id_usuario, id_curso]
      );

      if (certExistentes.length === 0) {
        // Gerar código único de verificação
        const codigoVerificacao = `CERT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        await connection.query(
          `INSERT INTO certificados (id_usuario, id_curso, codigo_verificacao, data_emissao)
          VALUES (?, ?, ?, NOW())`,
          [id_usuario, id_curso, codigoVerificacao]
        );
      }
    }

    await connection.commit();

    res.json({
      message: 'Aula marcada como concluída',
      progresso_percentual: progresso,
      curso_completo: progresso >= 100
    });
  } catch (error) {
    await connection.rollback();
    console.error('Erro ao marcar aula como concluída:', error);
    res.status(500).json({ error: 'Erro ao atualizar progresso' });
  } finally {
    connection.release();
  }
};

// Listar cursos matriculados do aluno
export const listarMeusCursos = async (req, res) => {
  try {
    const id_usuario = req.user.id;

    const [cursos] = await pool.query(
      `SELECT 
        c.*,
        m.progresso_percentual,
        m.data_matricula,
        m.data_conclusao,
        u.nome as instrutor_nome,
        cat.nome as categoria_nome,
        (SELECT COUNT(*) FROM aulas a 
         JOIN modulos_curso mc ON a.id_modulo = mc.id 
         WHERE mc.id_curso = c.id) as total_aulas,
        (SELECT COUNT(*) FROM progresso_aulas pa 
         WHERE pa.id_matricula = m.id AND pa.concluida = 1) as aulas_concluidas
      FROM matriculas_curso m
      JOIN cursos c ON c.id = m.id_curso
      LEFT JOIN usuarios u ON u.id = c.id_instrutor
      LEFT JOIN categorias_cursos cat ON cat.id = c.id_categoria
      WHERE m.id_usuario = ?
      ORDER BY m.data_matricula DESC`,
      [id_usuario]
    );

    res.json(cursos);
  } catch (error) {
    console.error('Erro ao listar meus cursos:', error);
    res.status(500).json({ error: 'Erro ao buscar cursos' });
  }
};

// Atualizar tempo de vídeo assistido (para permitir retomar de onde parou)
export const atualizarTempoAssistido = async (req, res) => {
  try {
    const { id_aula } = req.params;
    const { tempo_assistido_seg } = req.body;
    const id_usuario = req.user.id;

    // Buscar matrícula
    const [aulas] = await pool.query(
      `SELECT a.id, m.id as id_matricula
      FROM aulas a
      JOIN modulos_curso mc ON a.id_modulo = mc.id
      JOIN matriculas_curso m ON m.id_curso = mc.id_curso
      WHERE a.id = ? AND m.id_usuario = ?`,
      [id_aula, id_usuario]
    );

    if (aulas.length === 0) {
      return res.status(404).json({ error: 'Aula ou matrícula não encontrada' });
    }

    const { id_matricula } = aulas[0];

    // Atualizar tempo assistido sem marcar como concluída
    await pool.query(
      `INSERT INTO progresso_aulas 
        (id_matricula, id_aula, concluida, tempo_assistido_seg)
      VALUES (?, ?, 0, ?)
      ON DUPLICATE KEY UPDATE 
        tempo_assistido_seg = ?`,
      [id_matricula, id_aula, tempo_assistido_seg, tempo_assistido_seg]
    );

    res.json({ message: 'Tempo atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar tempo:', error);
    res.status(500).json({ error: 'Erro ao atualizar tempo' });
  }
};
