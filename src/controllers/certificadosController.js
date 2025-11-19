import pool from '../config/db.js';
import PDFDocument from 'pdfkit';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Buscar certificado do aluno
export const buscarCertificado = async (req, res) => {
  try {
    const { id_curso } = req.params;
    const id_usuario = req.user.id;

    const [certificados] = await pool.query(
      `SELECT 
        cert.*,
        c.titulo as curso_titulo,
        c.duracao_total_min,
        u.nome as aluno_nome,
        u.cpf as aluno_cpf,
        inst.nome as instrutor_nome
      FROM certificados cert
      JOIN cursos c ON c.id = cert.id_curso
      JOIN usuarios u ON u.id = cert.id_usuario
      LEFT JOIN usuarios inst ON inst.id = c.id_instrutor
      WHERE cert.id_usuario = ? AND cert.id_curso = ?`,
      [id_usuario, id_curso]
    );

    if (certificados.length === 0) {
      return res.status(404).json({ error: 'Certificado não encontrado. Complete 100% do curso primeiro.' });
    }

    res.json(certificados[0]);
  } catch (error) {
    console.error('Erro ao buscar certificado:', error);
    res.status(500).json({ error: 'Erro ao buscar certificado' });
  }
};

// Listar todos os certificados do aluno
export const listarMeusCertificados = async (req, res) => {
  try {
    const id_usuario = req.user.id;

    const [certificados] = await pool.query(
      `SELECT 
        cert.*,
        c.titulo as curso_titulo,
        c.capa_url,
        c.duracao_total_min,
        inst.nome as instrutor_nome,
        cat.nome as categoria_nome
      FROM certificados cert
      JOIN cursos c ON c.id = cert.id_curso
      LEFT JOIN usuarios inst ON inst.id = c.id_instrutor
      LEFT JOIN categorias_cursos cat ON cat.id = c.id_categoria
      WHERE cert.id_usuario = ?
      ORDER BY cert.data_emissao DESC`,
      [id_usuario]
    );

    res.json(certificados);
  } catch (error) {
    console.error('Erro ao listar certificados:', error);
    res.status(500).json({ error: 'Erro ao buscar certificados' });
  }
};

// Gerar PDF do certificado
export const gerarCertificadoPDF = async (req, res) => {
  try {
    const { id_curso } = req.params;
    const id_usuario = req.user.id;

    // Buscar dados do certificado
    const [certificados] = await pool.query(
      `SELECT 
        cert.*,
        c.titulo as curso_titulo,
        c.duracao_total_min,
        u.nome as aluno_nome,
        u.cpf as aluno_cpf,
        inst.nome as instrutor_nome,
        cat.nome as categoria_nome
      FROM certificados cert
      JOIN cursos c ON c.id = cert.id_curso
      JOIN usuarios u ON u.id = cert.id_usuario
      LEFT JOIN usuarios inst ON inst.id = c.id_instrutor
      LEFT JOIN categorias_cursos cat ON cat.id = c.id_categoria
      WHERE cert.id_usuario = ? AND cert.id_curso = ?`,
      [id_usuario, id_curso]
    );

    if (certificados.length === 0) {
      return res.status(404).json({ error: 'Certificado não encontrado' });
    }

    const cert = certificados[0];

    // Criar PDF
    const doc = new PDFDocument({
      layout: 'landscape',
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });

    // Headers para download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=certificado-${cert.codigo_verificacao}.pdf`);

    // Pipe para resposta
    doc.pipe(res);

    // ========== DESIGN DO CERTIFICADO ==========

    // Borda decorativa
    doc.lineWidth(3)
       .strokeColor('#C9A635')
       .rect(30, 30, doc.page.width - 60, doc.page.height - 60)
       .stroke();

    doc.lineWidth(1)
       .strokeColor('#1C3B32')
       .rect(40, 40, doc.page.width - 80, doc.page.height - 80)
       .stroke();

    // Título
    doc.fontSize(48)
       .fillColor('#1C3B32')
       .font('Helvetica-Bold')
       .text('CERTIFICADO', 0, 100, { align: 'center' });

    doc.fontSize(18)
       .fillColor('#666666')
       .font('Helvetica')
       .text('DE CONCLUSÃO', 0, 160, { align: 'center' });

    // Texto principal
    doc.fontSize(14)
       .fillColor('#333333')
       .font('Helvetica')
       .text('Certificamos que', 0, 220, { align: 'center' });

    // Nome do aluno
    doc.fontSize(32)
       .fillColor('#C9A635')
       .font('Helvetica-Bold')
       .text(cert.aluno_nome.toUpperCase(), 0, 260, { align: 'center' });

    // Linha decorativa sob o nome
    doc.moveTo(250, 310)
       .lineTo(doc.page.width - 250, 310)
       .strokeColor('#C9A635')
       .lineWidth(2)
       .stroke();

    // Texto do curso
    doc.fontSize(14)
       .fillColor('#333333')
       .font('Helvetica')
       .text('concluiu com êxito o curso', 0, 340, { align: 'center' });

    doc.fontSize(22)
       .fillColor('#1C3B32')
       .font('Helvetica-Bold')
       .text(cert.curso_titulo, 100, 380, { 
         align: 'center',
         width: doc.page.width - 200
       });

    // Informações adicionais
    const horas = Math.floor(cert.duracao_total_min / 60);
    const minutos = cert.duracao_total_min % 60;
    const duracaoTexto = `${horas}h${minutos > 0 ? ` ${minutos}min` : ''}`;

    doc.fontSize(12)
       .fillColor('#666666')
       .font('Helvetica')
       .text(`Carga horária: ${duracaoTexto} | Categoria: ${cert.categoria_nome || 'Geral'}`, 0, 450, { 
         align: 'center' 
       });

    // Data de emissão
    const dataEmissao = new Date(cert.data_emissao);
    const dataFormatada = dataEmissao.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    doc.fontSize(11)
       .fillColor('#333333')
       .text(`Emitido em ${dataFormatada}`, 0, 490, { align: 'center' });

    // Instrutor (assinatura)
    if (cert.instrutor_nome) {
      doc.fontSize(12)
         .fillColor('#1C3B32')
         .font('Helvetica-Bold')
         .text(cert.instrutor_nome, 0, 530, { align: 'center' });

      doc.fontSize(10)
         .fillColor('#666666')
         .font('Helvetica')
         .text('Instrutor', 0, 548, { align: 'center' });

      // Linha de assinatura
      doc.moveTo(350, 528)
         .lineTo(doc.page.width - 350, 528)
         .strokeColor('#999999')
         .lineWidth(1)
         .stroke();
    }

    // Código de verificação
    doc.fontSize(9)
       .fillColor('#999999')
       .font('Helvetica')
       .text(`Código de verificação: ${cert.codigo_verificacao}`, 0, doc.page.height - 60, { 
         align: 'center' 
       });

    doc.fontSize(8)
       .text('Este certificado pode ser validado em receitasmilionarias.com.br/verificar-certificado', 0, doc.page.height - 45, { 
         align: 'center' 
       });

    // Finalizar PDF
    doc.end();

    // Salvar URL do PDF no banco (opcional - para cache)
    // Você pode implementar salvamento em disco ou cloud storage aqui

  } catch (error) {
    console.error('Erro ao gerar certificado PDF:', error);
    
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao gerar certificado' });
    }
  }
};

// Verificar autenticidade de certificado (público)
export const verificarCertificado = async (req, res) => {
  try {
    const { codigo } = req.params;

    const [certificados] = await pool.query(
      `SELECT 
        cert.id,
        cert.codigo_verificacao,
        cert.data_emissao,
        c.titulo as curso_titulo,
        c.duracao_total_min,
        u.nome as aluno_nome,
        inst.nome as instrutor_nome,
        cat.nome as categoria_nome
      FROM certificados cert
      JOIN cursos c ON c.id = cert.id_curso
      JOIN usuarios u ON u.id = cert.id_usuario
      LEFT JOIN usuarios inst ON inst.id = c.id_instrutor
      LEFT JOIN categorias_cursos cat ON cat.id = c.id_categoria
      WHERE cert.codigo_verificacao = ?`,
      [codigo]
    );

    if (certificados.length === 0) {
      return res.status(404).json({ 
        valido: false,
        error: 'Certificado não encontrado ou código inválido' 
      });
    }

    res.json({
      valido: true,
      certificado: certificados[0]
    });
  } catch (error) {
    console.error('Erro ao verificar certificado:', error);
    res.status(500).json({ error: 'Erro ao verificar certificado' });
  }
};
