import PDFDocument from 'pdfkit';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

// Lembre-se de instalar as dependências se ainda não o fez:
// npm install pngjs jpeg-js

// Configurar o worker para pdfjs-dist no Node.js
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;

/**
 * Função para gerar um PDF a partir dos dados de uma receita.
 * ESTA FUNÇÃO ESTAVA FALTANDO.
 */
export const generateRecipePdf = async (req, res) => {
    const recipe = req.body;

    if (!recipe || !recipe.title || !recipe.ingredients || !recipe.instructions) {
        return res.status(400).json({ message: 'Dados da receita incompletos para gerar o PDF.' });
    }

    try {
        const doc = new PDFDocument({ margin: 50 });
        const filename = `receita-${recipe.title.replace(/\s+/g, '_').toLowerCase()}.pdf`;
        const uploadsDir = 'uploads';
        const filePath = path.join(uploadsDir, filename);

        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir);
        }

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
        recipe.ingredients.forEach(ingredient => {
            doc.fontSize(12).font('Helvetica').list([ingredient], { bulletRadius: 2 });
        });
        doc.moveDown();

        doc.fontSize(16).font('Helvetica-Bold').text('Modo de Preparo', { underline: true });
        doc.moveDown(0.5);
        recipe.instructions.forEach((instruction, index) => {
            doc.fontSize(12).font('Helvetica').text(`${index + 1}. ${instruction}`, { continued: false, paragraphGap: 5 });
        });

        doc.end();

        stream.on('finish', () => {
            res.download(filePath, filename, (err) => {
                if (err) console.error('Erro ao enviar o PDF:', err);
                fs.unlink(filePath, (unlinkErr) => {
                    if (unlinkErr) console.error('Erro ao remover arquivo PDF temporário:', unlinkErr);
                });
            });
        });

        stream.on('error', (err) => {
            console.error('Erro no stream ao gerar o PDF:', err);
            if (!res.headersSent) res.status(500).json({ message: 'Erro ao gerar o PDF.' });
        });
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        if (!res.headersSent) res.status(500).json({ message: 'Ocorreu um erro inesperado ao gerar o PDF.' });
    }
};

/**
 * Função para ler um PDF, extrair dados da receita E a imagem principal.
 */
export const parseRecipePdf = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Nenhum arquivo PDF enviado.' });
    }

    const tempFilePath = req.file.path;

    try {
        const dataBuffer = fs.readFileSync(tempFilePath);
        const uint8Array = new Uint8Array(dataBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
        const pdfDocument = await loadingTask.promise;
        
        // --- EXTRAÇÃO DE IMAGEM ---
        let imageUrl = null;
        const page = await pdfDocument.getPage(1); // Pega a primeira página
        const operatorList = await page.getOperatorList();
        const { OPS } = pdfjsLib;

        for (let i = 0; i < operatorList.fnArray.length; i++) {
            const op = operatorList.fnArray[i];
            if (op === OPS.paintImageXObject) {
                const imageKey = operatorList.argsArray[i][0];
                const image = await page.objs.get(imageKey);
                
                const uploadsDir = 'uploads';
                if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

                let imagePath;
                if (image.kind === 1) { // JPEG
                    imagePath = path.join(uploadsDir, `extracted-${Date.now()}.jpg`);
                    fs.writeFileSync(imagePath, image.data);
                } else { // Para outros formatos como PNG
                    imagePath = path.join(uploadsDir, `extracted-${Date.now()}.png`);
                    const png = new PNG({ width: image.width, height: image.height });
                    // Converte os dados da imagem para o formato RGBA que a lib pngjs espera
                    for (let y = 0; y < image.height; y++) {
                        for (let x = 0; x < image.width; x++) {
                            const idx = (image.width * y + x) << 2;
                            const r_idx = (image.width * y + x) * 3;
                            png.data[idx] = image.data[r_idx];
                            png.data[idx+1] = image.data[r_idx+1];
                            png.data[idx+2] = image.data[r_idx+2];
                            png.data[idx+3] = 255; // Alpha (opacidade total)
                        }
                    }
                    fs.writeFileSync(imagePath, PNG.sync.write(png));
                }
                
                imageUrl = imagePath.replace(/\\/g, '/'); // Normaliza para formato de URL
                break; // Pega apenas a primeira imagem e para
            }
        }
        
        // --- EXTRAÇÃO DE TEXTO (MÉTODO ROBUSTO) ---
        let fullText = '';
        for (let i = 1; i <= pdfDocument.numPages; i++) {
            const page = await pdfDocument.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map(item => item.str).join(' ') + '\n';
        }

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

        const mainLines = mainBlock.split('\n').map(l => l.trim()).filter(Boolean);
        if (mainLines.length > 0) {
            recipeJson.titulo = mainLines[0];
            recipeJson.resumo = mainLines.slice(1).join(' ').trim();
        }

        const ingredientLines = ingredientsBlock.split('\n').map(l => l.trim()).filter(Boolean);
        let currentGroup = null;
        for(const line of ingredientLines) {
            const isLikelyIngredient = /^\d|^\/|xícara|colher|gramas|g de|dentes|lata|caixa|ml|pitada|a gosto|^-|•/.test(line.toLowerCase());
            
            if (!isLikelyIngredient && line.split(' ').length < 5 && line.length > 1) { // É um título de grupo
                currentGroup = { titulo: line, ordem: recipeJson.grupos_ingredientes.length + 1, ingredientes: [] };
                recipeJson.grupos_ingredientes.push(currentGroup);
            } else if(line.length > 1) { // É um ingrediente
                if (!currentGroup) {
                    currentGroup = { titulo: 'Ingredientes', ordem: 1, ingredientes: [] };
                    recipeJson.grupos_ingredientes.push(currentGroup);
                }
                currentGroup.ingredientes.push({ descricao: line.replace(/^-|•\s*/, '').trim(), ordem: currentGroup.ingredientes.length + 1 });
            }
        }
        
        const instructionLines = instructionsBlock.split('\n').map(l => l.trim()).filter(Boolean);
        for(const line of instructionLines) {
            if(line.length > 1)
            recipeJson.passos_preparo.push({ descricao: line.replace(/^\d+[\.\-\)]\s*/, '').trim(), ordem: recipeJson.passos_preparo.length + 1 });
        }

        res.json({ message: 'PDF processado e estruturado com sucesso!', recipe: recipeJson });

    } catch (error) {
        console.error('Erro ao parsear PDF:', error);
        res.status(500).json({ message: 'Erro ao processar o PDF.', error: error.message });
    } finally {
        fs.unlink(tempFilePath, (unlinkErr) => {
            if (unlinkErr) console.error('Erro ao remover arquivo PDF temporário:', unlinkErr);
        });
    }
};