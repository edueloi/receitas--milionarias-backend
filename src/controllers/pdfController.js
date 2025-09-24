// src/controllers/pdfController.js

import fs from 'fs';
import path from 'path';

// ---------- Helpers ----------
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function safeUnlink(filePath) {
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('Erro ao remover arquivo:', filePath, err);
    }
  });
}

// ===============================================================
// GERAÇÃO DE PDF (texto básico de receita)
// ===============================================================
export const generateRecipePdf = async (req, res) => {
  const recipe = req.body;

  if (!recipe || !recipe.title || !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.instructions)) {
    return res.status(400).json({ message: 'Dados da receita incompletos para gerar o PDF.' });
  }

  try {
    // Lazy imports (evitam derrubar a API no boot)
    const { default: PDFDocument } = await import('pdfkit');

    ensureUploadsDir();

    const filename = `receita-${recipe.title.replace(/\s+/g, '_').toLowerCase()}.pdf`;
    const filePath = path.join(UPLOADS_DIR, filename);

    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Título
    doc.fontSize(24).font('Helvetica-Bold').text(recipe.title, { align: 'center' });
    doc.moveDown(2);

    // Descrição (opcional)
    if (recipe.description) {
      doc.fontSize(12).font('Helvetica').text(recipe.description);
      doc.moveDown();
    }

    // Ingredientes
    doc.fontSize(16).font('Helvetica-Bold').text('Ingredientes', { underline: true });
    doc.moveDown(0.5);
    recipe.ingredients.forEach((ingredient) => {
      doc.fontSize(12).font('Helvetica').text(`• ${ingredient}`);
    });
    doc.moveDown();

    // Modo de Preparo
    doc.fontSize(16).font('Helvetica-Bold').text('Modo de Preparo', { underline: true });
    doc.moveDown(0.5);
    recipe.instructions.forEach((instruction, i) => {
      doc.fontSize(12).font('Helvetica').text(`${i + 1}. ${instruction}`, { paragraphGap: 5 });
    });

    doc.end();

    stream.on('finish', () => {
      // Faz o download e remove o arquivo temporário em seguida
      res.download(filePath, filename, (err) => {
        if (err) console.error('Erro ao enviar o PDF:', err);
        safeUnlink(filePath);
      });
    });

    stream.on('error', (err) => {
      console.error('Erro no stream ao gerar o PDF:', err);
      if (!res.headersSent) res.status(500).json({ message: 'Erro ao gerar o PDF.' });
      safeUnlink(filePath);
    });
  } catch (err) {
    console.error('Erro ao carregar libs/gerar PDF:', err);
    if (!res.headersSent) res.status(500).json({ message: 'PDF indisponível no momento.' });
  }
};

// ===============================================================
// PARSE DE PDF (texto + tentativa opcional de extrair 1ª imagem)
// ===============================================================
export const parseRecipePdf = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Nenhum arquivo PDF enviado.' });
  }

  const tempFilePath = req.file.path;

  try {
    // Lazy import do pdfjs + worker
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { pathToFileURL } = await import('url');

    pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
      path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')
    ).href;

    const dataBuffer = fs.readFileSync(tempFilePath);
    const uint8Array = new Uint8Array(dataBuffer);
    const pdfDocument = await pdfjsLib.getDocument({ data: uint8Array }).promise;

    // --------- (Opcional) Tentar extrair a 1ª imagem da 1ª página ----------
    let imageUrl = null;
    try {
      ensureUploadsDir();

      const page = await pdfDocument.getPage(1);
      const operatorList = await page.getOperatorList();
      const { OPS } = pdfjsLib;

      // Tentamos carregar dependências de imagem apenas se existirem
      let PNG, jpeg;
      try {
        PNG = (await import('pngjs')).PNG;
        jpeg = (await import('jpeg-js')).default || (await import('jpeg-js'));
      } catch {
        // Se não estiverem instaladas, seguimos sem extrair imagem
        PNG = null; jpeg = null;
      }

      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const op = operatorList.fnArray[i];
        if (op === OPS.paintImageXObject) {
          const imageKey = operatorList.argsArray[i][0];
          const img = await page.objs.get(imageKey);

          // Se não temos libs, paramos aqui
          if (!PNG || !jpeg) break;

          // Heurística simples: se vier buffer JPEG direto, salva .jpg
          if (img && img.data && img.data instanceof Uint8Array && img.kind === 1) {
            const imagePath = path.join(UPLOADS_DIR, `extracted-${Date.now()}.jpg`);
            fs.writeFileSync(imagePath, Buffer.from(img.data));
            imageUrl = imagePath.replace(/\\/g, '/');
            break;
          }

          // Caso contrário, tenta salvar como PNG assumindo dados RGB
          if (img && img.data && img.width && img.height) {
            const png = new PNG({ width: img.width, height: img.height });
            // Preenche RGBA a partir de RGB (alpha fixo 255)
            for (let y = 0; y < img.height; y++) {
              for (let x = 0; x < img.width; x++) {
                const idx = (img.width * y + x) << 2;
                const r_idx = (img.width * y + x) * 3;
                png.data[idx] = img.data[r_idx] || 0;
                png.data[idx + 1] = img.data[r_idx + 1] || 0;
                png.data[idx + 2] = img.data[r_idx + 2] || 0;
                png.data[idx + 3] = 255;
              }
            }
            const imagePath = path.join(UPLOADS_DIR, `extracted-${Date.now()}.png`);
            fs.writeFileSync(imagePath, PNG.sync.write(png));
            imageUrl = imagePath.replace(/\\/g, '/');
            break;
          }
        }
      }
    } catch (e) {
      // Se a extração falhar, apenas loga e segue
      console.warn('Falha ao tentar extrair imagem do PDF (seguindo sem imagem):', e?.message || e);
    }

    // --------- Extrair texto (todas as páginas) ----------
    let fullText = '';
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map((it) => it.str).join(' ') + '\n';
    }

    // --------- Heurística simples pra estruturar receita ----------
    const recipeJson = {
      titulo: '',
      resumo: '',
      grupos_ingredientes: [],
      passos_preparo: [],
      imagem_url: imageUrl,
    };

    const KEYWORD_INGREDIENTS = /ingredientes/i;
    const KEYWORD_INSTRUCTIONS = /modo de preparo/i;

    let ingredientsBlock = '';
    let instructionsBlock = '';
    let mainBlock = fullText;

    if (fullText.match(KEYWORD_INGREDIENTS)) {
      const parts = fullText.split(KEYWORD_INGREDIENTS);
      mainBlock = parts[0];
      const rest = parts.slice(1).join('Ingredientes');

      if (rest.match(KEYWORD_INSTRUCTIONS)) {
        const subParts = rest.split(KEYWORD_INSTRUCTIONS);
        ingredientsBlock = subParts[0];
        instructionsBlock = subParts.slice(1).join('Modo de Preparo');
      } else {
        ingredientsBlock = rest;
      }
    }

    const mainLines = mainBlock.split('\n').map((l) => l.trim()).filter(Boolean);
    if (mainLines.length > 0) {
      recipeJson.titulo = mainLines[0];
      recipeJson.resumo = mainLines.slice(1).join(' ').trim();
    }

    const ingredientLines = ingredientsBlock.split('\n').map((l) => l.trim()).filter(Boolean);
    let currentGroup = null;
    for (const line of ingredientLines) {
      const isLikelyIngredient = /^\d|^\/|xícara|colher|gramas|g de|dentes|lata|caixa|ml|pitada|a gosto|^-|•/i.test(line);
      if (!isLikelyIngredient && line.split(' ').length < 5 && line.length > 1) {
        currentGroup = { titulo: line, ordem: recipeJson.grupos_ingredientes.length + 1, ingredientes: [] };
        recipeJson.grupos_ingredientes.push(currentGroup);
      } else if (line.length > 1) {
        if (!currentGroup) {
          currentGroup = { titulo: 'Ingredientes', ordem: 1, ingredientes: [] };
          recipeJson.grupos_ingredientes.push(currentGroup);
        }
        currentGroup.ingredientes.push({
          descricao: line.replace(/^-|•\s*/, '').trim(),
          ordem: currentGroup.ingredientes.length + 1,
        });
      }
    }

    const instructionLines = instructionsBlock.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of instructionLines) {
      if (line.length > 1) {
        recipeJson.passos_preparo.push({
          descricao: line.replace(/^\d+[\.\-\)]\s*/, '').trim(),
          ordem: recipeJson.passos_preparo.length + 1,
        });
      }
    }

    res.json({ message: 'PDF processado e estruturado com sucesso!', recipe: recipeJson });
  } catch (error) {
    console.error('Erro ao processar PDF:', error);
    res.status(500).json({ message: 'Erro ao processar o PDF.', error: error.message });
  } finally {
    safeUnlink(tempFilePath);
  }
};
