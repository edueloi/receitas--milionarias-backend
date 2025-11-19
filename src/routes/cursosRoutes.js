import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';
import * as cursosController from '../controllers/cursosController.js';
import * as progressoController from '../controllers/progressoController.js';
import * as certificadosController from '../controllers/certificadosController.js';

const router = express.Router();

// ==================== ROTAS DE CURSOS ====================

// Listar cursos (público - apenas publicados)
router.get('/cursos', cursosController.listarCursos);

// Listar MEUS cursos (apenas do instrutor logado)
router.get('/cursos/meus-cursos/lista', authMiddleware, cursosController.listarMeusCursos);

// Buscar curso específico (público)
router.get('/cursos/:idOrSlug', cursosController.buscarCurso);

// Listar categorias (público)
router.get('/cursos-categorias', cursosController.listarCategorias);

// Criar curso (apenas instrutores/admin - não afiliados)
router.post('/cursos', authMiddleware, cursosController.criarCurso);

// Atualizar curso
router.put('/cursos/:id', authMiddleware, cursosController.atualizarCurso);

// Deletar curso
router.delete('/cursos/:id', authMiddleware, cursosController.deletarCurso);

// ==================== ROTAS DE MÓDULOS ====================

// Criar módulo
router.post('/cursos/modulos', authMiddleware, cursosController.criarModulo);

// Atualizar módulo
router.put('/cursos/modulos/:id', authMiddleware, cursosController.atualizarModulo);

// Deletar módulo
router.delete('/cursos/modulos/:id', authMiddleware, cursosController.deletarModulo);

// ==================== ROTAS DE AULAS ====================

// Criar aula
router.post('/cursos/aulas', authMiddleware, cursosController.criarAula);

// Atualizar aula
router.put('/cursos/aulas/:id', authMiddleware, cursosController.atualizarAula);

// Deletar aula
router.delete('/cursos/aulas/:id', authMiddleware, cursosController.deletarAula);

// ==================== ROTAS DE UPLOAD ====================

// Upload de vídeo para aula (max 500MB)
router.post('/cursos/upload/video', authMiddleware, upload.single('video'), cursosController.uploadVideo);

// Upload de imagem para capa (max 10MB)
router.post('/cursos/upload/image', authMiddleware, upload.single('image'), cursosController.uploadImage);

// Upload de PDF para aula
router.post('/cursos/upload/pdf', authMiddleware, upload.single('pdf'), cursosController.uploadPDF);

// ==================== ROTAS DE PROGRESSO ====================

// Matricular-se em um curso
router.post('/cursos/matricular', authMiddleware, progressoController.matricularAluno);

// Listar meus cursos matriculados
router.get('/meus-cursos', authMiddleware, progressoController.listarMeusCursos);

// Buscar progresso em um curso específico
router.get('/cursos/:id_curso/progresso', authMiddleware, progressoController.buscarProgresso);

// Marcar aula como concluída
router.post('/cursos/aulas/:id_aula/concluir', authMiddleware, progressoController.marcarAulaConcluida);

// Atualizar tempo assistido de uma aula (para retomar de onde parou)
router.put('/cursos/aulas/:id_aula/tempo', authMiddleware, progressoController.atualizarTempoAssistido);

// ==================== ROTAS DE CERTIFICADOS ====================

// Buscar certificado de um curso
router.get('/cursos/:id_curso/certificado', authMiddleware, certificadosController.buscarCertificado);

// Listar todos os meus certificados
router.get('/meus-certificados', authMiddleware, certificadosController.listarMeusCertificados);

// Gerar/baixar PDF do certificado
router.get('/cursos/:id_curso/certificado/pdf', authMiddleware, certificadosController.gerarCertificadoPDF);

// Verificar autenticidade de certificado (público - sem auth)
router.get('/verificar-certificado/:codigo', certificadosController.verificarCertificado);

export default router;
