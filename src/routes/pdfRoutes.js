import express from 'express';
import multer from 'multer';
import path from 'path';

const router = express.Router();

// Configuração do Multer para upload de PDF
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Salva os PDFs na pasta 'uploads'
    },
    filename: (req, file, cb) => {
        const extname = path.extname(file.originalname);
        cb(null, `pdf-${Date.now()}${extname}`);
    }
});

const uploadPdf = multer({ storage: storage });

/**
 * @swagger
 * tags:
 *   name: PDFs
 *   description: Geração e Leitura de PDFs de Receitas
 */

/**
 * @swagger
 * /pdf/generate-recipe:
 *   post:
 *     summary: Gera um PDF de receita a partir de dados JSON
 *     tags: [PDFs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - ingredients
 *               - instructions
 *             properties:
 *               title: { type: string, example: 'Bolo de Cenoura' }
 *               description: { type: string, example: 'Um bolo delicioso e fácil de fazer.' }
 *               ingredients: { type: array, items: { type: string }, example: ['2 cenouras', '3 ovos', '1 xícara de açúcar'] }
 *               instructions: { type: array, items: { type: string }, example: ['Bata as cenouras...', 'Misture os ingredientes...', 'Asse por 40 minutos...'] }
 *     responses:
 *       200:
 *         description: PDF da receita gerado e enviado para download
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Dados da receita incompletos
 *       500:
 *         description: Erro ao gerar o PDF
 */
router.post('/pdf/generate-recipe', async (req, res, next) => {
  const { generateRecipePdf } = await import('../controllers/pdfController.js');
  return generateRecipePdf(req, res, next);
});

/**
 * @swagger
 * /pdf/parse-recipe:
 *   post:
 *     summary: Lê um PDF e tenta extrair dados de receita
 *     tags: [PDFs]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               pdfFile: { type: string, format: binary, description: 'Arquivo PDF da receita para ser parseado.' }
 *     responses:
 *       200:
 *         description: Dados da receita extraídos com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 recipe: { type: object }
 *       400:
 *         description: Nenhum arquivo PDF enviado
 *       500:
 *         description: Erro ao processar o PDF
 */
router.post('/pdf/parse-recipe', uploadPdf.single('pdfFile'), async (req, res, next) => {
  const { parseRecipePdf } = await import('../controllers/pdfController.js');
  return parseRecipePdf(req, res, next);
}); // Descomentado

export default router;