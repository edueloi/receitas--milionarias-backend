import PDFDocument from 'pdfkit';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'; // Usar o build legacy para Node.js
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url'; // Importar pathToFileURL

// Configurar o worker para pdfjs-dist no Node.js
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;

// Função para gerar PDF de uma receita
export const generateRecipePdf = async (req, res) => {
    const recipe = req.body; // Espera-se um JSON de receita no corpo da requisição

    if (!recipe || !recipe.title || !recipe.ingredients || !recipe.instructions) {
        return res.status(400).json({ message: 'Dados da receita incompletos para gerar o PDF.' });
    }

    const doc = new PDFDocument();
    const filename = `receita-${recipe.title.replace(/\s/g, '_')}.pdf`;
    const filePath = path.join('uploads', filename); // Salva na pasta uploads

    // Garante que a pasta 'uploads' existe
    if (!fs.existsSync('uploads')) {
        fs.mkdirSync('uploads');
    }

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(25).text(recipe.title, { align: 'center' });
    doc.moveDown();

    if (recipe.description) {
        doc.fontSize(14).text(recipe.description);
        doc.moveDown();
    }

    doc.fontSize(16).text('Ingredientes:', { underline: true });
    recipe.ingredients.forEach(ingredient => {
        doc.fontSize(12).text(`- ${ingredient}`);
    });
    doc.moveDown();

    doc.fontSize(16).text('Instruções:', { underline: true });
    recipe.instructions.forEach((instruction, index) => {
        doc.fontSize(12).text(`${index + 1}. ${instruction}`);
    });
    doc.moveDown();

    doc.end();

    stream.on('finish', () => {
        res.download(filePath, filename, (err) => {
            if (err) {
                console.error('Erro ao enviar o PDF:', err);
                res.status(500).json({ message: 'Erro ao baixar o PDF.' });
            }
            else {
                // Opcional: remover o arquivo após o download
                fs.unlink(filePath, (unlinkErr) => {
                    if (unlinkErr) console.error('Erro ao remover arquivo PDF temporário:', unlinkErr);
                });
            }
        });
    });

    stream.on('error', (err) => {
        console.error('Erro ao gerar o PDF:', err);
        res.status(500).json({ message: 'Erro ao gerar o PDF.' });
    });
};

// Função para ler e parsear PDF de uma receita
export const parseRecipePdf = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Nenhum arquivo PDF enviado.' });
    }

    try {
        const dataBuffer = fs.readFileSync(req.file.path);
        // Converter Buffer para Uint8Array
        const uint8Array = new Uint8Array(dataBuffer);
        
        console.log('uint8Array.length:', uint8Array.length);
        console.log('typeof pdfjsLib:', typeof pdfjsLib);
        console.log('typeof pdfjsLib.getDocument:', typeof pdfjsLib.getDocument);

        // Carregar o PDF com pdfjs-dist
        const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
        const pdfDocument = await loadingTask.promise;
        
        let fullText = '';
        for (let i = 1; i <= pdfDocument.numPages; i++) {
            const page = await pdfDocument.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map(item => item.str).join(' ') + '\n';
        }

        // Lógica de parsing para extrair informações da receita do texto
        const extractedText = fullText;
        console.log('Texto extraído do PDF:\n', extractedText);

        // Exemplo BEM BÁSICO de extração (precisa ser aprimorado)
        const recipe = {
            title: 'Receita Extraída do PDF',
            description: extractedText.substring(0, Math.min(extractedText.length, 200)) + (extractedText.length > 200 ? '...' : ''),
            ingredients: [],
            instructions: []
        };

        // Heurísticas simples para ingredientes e instruções
        const lines = extractedText.split(/\r?\n/);
        let inIngredients = false;
        let inInstructions = false;

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.toLowerCase().includes('ingredientes:')) {
                inIngredients = true;
                inInstructions = false;
                continue;
            }
            if (trimmedLine.toLowerCase().includes('instruções:') || trimmedLine.toLowerCase().includes('modo de preparo:')) {
                inInstructions = true;
                inIngredients = false;
                continue;
            }

            if (inIngredients && trimmedLine && !trimmedLine.toLowerCase().includes('instruções:')) {
                recipe.ingredients.push(trimmedLine);
            }
            if (inInstructions && trimmedLine && !trimmedLine.toLowerCase().includes('ingredientes:')) {
                recipe.instructions.push(trimmedLine);
            }
        }

        // Limpeza básica para remover linhas vazias ou irrelevantes
        recipe.ingredients = recipe.ingredients.filter(item => item.length > 3);
        recipe.instructions = recipe.instructions.filter(item => item.length > 3);

        // Opcional: remover o arquivo PDF temporário após o processamento
        fs.unlink(req.file.path, (unlinkErr) => {
            if (unlinkErr) console.error('Erro ao remover arquivo PDF temporário:', unlinkErr);
        });

        res.json({ message: 'PDF processado com sucesso!', recipe });

    } catch (error) {
        console.error('Erro ao parsear PDF:', error);
        // Opcional: remover o arquivo PDF temporário em caso de erro
        if (req.file) {
            fs.unlink(req.file.path, (unlinkErr) => {
                if (unlinkErr) console.error('Erro ao remover arquivo PDF temporário após erro:', unlinkErr);
            });
        }
        res.status(500).json({ message: 'Erro ao processar o PDF.', error: error.message }); // Retorna a mensagem de erro detalhada
    }
};