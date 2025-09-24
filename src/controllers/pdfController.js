// src/controllers/pdfController.js
import fs from 'fs';
import path from 'path';

// ------------------- GERAR PDF -------------------
export const generateRecipePdf = async (req, res) => {
  const recipe = req.body;
  if (!recipe || !recipe.title || !recipe.ingredients || !recipe.instructions) {
    return res.status(400).json({ message: 'Dados da receita incompletos para gerar o PDF.' });
  }

  try {
    const { default: PDFDocument } = await import('pdfkit');
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { pathToFileURL } = await import('url');

    // worker do pdfjs
    pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
      path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')
    ).href;

    const filename = `receita-${recipe.title.replace(/\s+/g, '_').toLowerCase()}.pdf`;
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const filePath = path.join(uploadsDir, filename);

    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(24).font('Helvetica-Bold').text(recipe.title, { align: 'center' });
    doc.moveDown(2);

    if (recipe.description) {
      doc.fontSize(12).font('Helvetica').text(recipe.description);
      doc.moveDown();
    }

    doc.fontSize(16).font('Helvetica-Bold').text('Ingredientes', { underline: true });
    doc.moveDown(0.5);
    recipe.ingredients.forEach((ingredient) => doc.fontSize(12).font('Helvetica').list([ingredient], { bulletRadius: 2 }));
    doc.moveDown();

    doc.fontSize(16).font('Helvetica-Bold').text('Modo de Preparo', { underline: true });
    doc.moveDown(0.5);
    recipe.instructions.forEach((instruction, i) =>
      doc.fontSize(12).font('Helvetica').text(`${i + 1}. ${instruction}`, { paragraphGap: 5 })
    );

    doc.end();

    stream.on('finish', () => {
      res.download(filePath, filename, (err) => {
        if (err) console.error('Erro ao enviar o PDF:', err);
        fs.unlink(filePath, (e) => e && console.error('Erro ao remover PDF temp:', e));
      });
    });

    stream.on('error', (err) => {
      console.error('Erro no stream do PDF:', err);
      if (!res.headersSent) res.status(500).json({ message: 'Erro ao gerar o PDF.' });
    });
  } catch (err) {
    console.error('Erro ao carregar libs de PDF:', err);
    if (!res.headersSent) res.status(500).json({ message: 'PDF indisponível no momento.' });
  }
};

// ------------------- PARSEAR PDF -------------------
export const parseRecipePdf = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Nenhum arquivo PDF enviado.' });

  const tempFilePath = req.file.path;
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const dataBuffer = fs.readFileSync(tempFilePath);
    const uint8Array = new Uint8Array(dataBuffer);
    const pdfDocument = await pdfjsLib.getDocument({ data: uint8Array }).promise;

    // (restante do seu código de extração, igual ao que você já tem)
    // ...
    res.json({ message: 'PDF processado e estruturado com sucesso!', /* recipe */ });
  } catch (error) {
    console.error('Erro ao parsear PDF:', error);
    res.status(500).json({ message: 'Erro ao processar o PDF.', error: error.message });
  } finally {
    fs.unlink(tempFilePath, (e) => e && console.error('Erro ao remover arquivo temp:', e));
  }
};
