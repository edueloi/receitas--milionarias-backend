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

// ===============================================================
// CONTRATO AFILIADO PRO (PDF)
// ===============================================================
export const generateAffiliateProContractPdf = async (_req, res) => {
  try {
    const { default: PDFDocument } = await import('pdfkit');

    ensureUploadsDir();

    const filename = `contrato-afiliado-pro.pdf`;
    const filePath = path.join(UPLOADS_DIR, `contrato-afiliado-pro-${Date.now()}.pdf`);

    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(18).font('Helvetica-Bold').text('CONTRATO DE AFILIADO PRO', {
      align: 'center',
    });
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica').text('Receitas Milionarias', { align: 'center' });
    doc.moveDown(1.5);

    const paragraphs = [
      'CONTRATO DE ADESAO AO PROGRAMA AFILIADO PRO',
      'RECEITAS MILIONARIAS',
      'Este Contrato de Adesao regula a participacao do Afiliado Pro no programa de afiliados da plataforma Receitas Milionarias, mantida por seus administradores legais, doravante denominada PLATAFORMA.',
      'Ao realizar o aceite digital, o Afiliado declara que leu, compreendeu e concorda integralmente com todos os termos aqui descritos.',
      '1. OBJETO',
      '1.1. O presente contrato tem por objeto regular a participacao do Afiliado Pro no Programa de Afiliados da PLATAFORMA, permitindo a divulgacao de produtos, cursos, ebooks, receitas e demais conteudos autorizados, bem como o acesso a ferramentas, materiais de marketing e painel de controle.',
      '1.2. A adesao nao garante exclusividade, nem obrigacao de resultados financeiros.',
      '2. ADESAO, ACEITE DIGITAL E VIGENCIA',
      '2.1. A adesao ocorre mediante aceite eletronico, registrado por meio de data e hora, endereco IP, identificacao do usuario e logs de seguranca.',
      '2.2. Este contrato entra em vigor na data do aceite digital e permanece valido enquanto o Afiliado estiver ativo no programa ou ate sua rescisao.',
      '3. DIREITOS DO AFILIADO PRO',
      'O Afiliado Pro tera direito a: (a) divulgar a PLATAFORMA por meios proprios, respeitando este contrato; (b) cadastrar, criar e disponibilizar conteudos proprios (cursos, ebooks, receitas), desde que aprovados ou liberados no painel; (c) utilizar materiais oficiais disponibilizados pela PLATAFORMA; (d) receber comissoes por indicacoes validas; (e) acessar relatorios e informacoes financeiras no painel.',
      '4. COMISSOES, VALORES E PAGAMENTOS',
      '4.1. A comissao padrao e de R$ 20,00 por indicacao ativa e valida, podendo ser alterada a criterio da PLATAFORMA mediante aviso previo no painel.',
      '4.2. Considera-se indicacao valida aquela que seja concluida corretamente, nao envolva fraude, duplicidade ou ma-fe, e nao seja cancelada ou contestada (chargeback).',
      '4.3. Os pagamentos serao realizados em ciclos definidos pela PLATAFORMA, podendo exigir valor minimo para saque.',
      '4.4. A PLATAFORMA podera reter, suspender ou estornar comissoes em casos de fraude, chargeback ou cancelamento, violacao deste contrato, ou uso indevido da marca.',
      '5. OBRIGACOES E CONDUTA DO AFILIADO',
      'E expressamente proibido: (a) spam ou disparos em massa nao autorizados; (b) promessas enganosas de ganhos financeiros; (c) anuncios irregulares ou que infrinjam leis; (d) trafego fraudulento, bots ou manipulacao de cliques; (e) uso indevido de marcas, imagens ou direitos de terceiros.',
      '5.2. O Afiliado e responsavel por manter seus dados cadastrais atualizados.',
      '6. CONTEUDO, AUTORIA E RESPONSABILIDADE',
      '6.1. O Afiliado declara ser autor ou detentor de licenca valida de todo conteudo enviado.',
      '6.2. A PLATAFORMA nao se responsabiliza por conteudos ilegais, plagiados ou que violem direitos de terceiros.',
      '6.3. Conteudos que violem este contrato poderao ser removidos sem aviso previo, sem prejuizo de sancoes.',
      '7. USO DE MARCA E MATERIAIS',
      '7.1. A marca, identidade visual e materiais da PLATAFORMA so poderao ser utilizados conforme orientacao oficial, sem alteracoes e sem associacao a praticas proibidas.',
      '7.2. E vedado o uso da marca para fins ilicitos ou que causem dano a imagem da PLATAFORMA.',
      '8. PROTECAO DE DADOS E LGPD',
      '8.1. O Afiliado concorda com o tratamento de seus dados pessoais nos termos da Lei no. 13.709/2018 (LGPD).',
      '8.2. Os dados poderao ser utilizados para gestao do programa, registro de aceite, seguranca, auditoria e prevencao a fraudes.',
      '9. SUSPENSAO E RESCISAO',
      '9.1. A PLATAFORMA podera suspender ou encerrar o acesso do Afiliado a qualquer momento em caso de descumprimento deste contrato.',
      '9.2. Comissoes pendentes poderao ser retidas para analise, sem garantia de pagamento.',
      '9.3. O Afiliado pode solicitar desligamento a qualquer momento via painel ou suporte.',
      '10. ATUALIZACOES CONTRATUAIS',
      '10.1. A PLATAFORMA podera atualizar este contrato a qualquer tempo.',
      '10.2. As alteracoes serao comunicadas via painel, e o uso continuo implicara aceite automatico da nova versao.',
      '11. LIMITACAO DE RESPONSABILIDADE',
      '11.1. A PLATAFORMA nao garante faturamento, lucro ou resultados financeiros.',
      '11.2. O Afiliado atua de forma independente, sem vinculo empregaticio, societario ou trabalhista.',
      '12. DISPOSICOES FINAIS E FORO',
      '12.1. Este contrato constitui o acordo integral entre as partes.',
      '12.2. Fica eleito o foro da comarca do domicilio da PLATAFORMA, com renuncia a qualquer outro.',
      'ACEITE DIGITAL',
      'Ao clicar em "Li e Aceito", o Afiliado declara concordar integralmente com este contrato.',
    ];

    paragraphs.forEach((text) => {
      if (/^(CONTRATO|RECEITAS)/.test(text)) {
        doc.font('Helvetica-Bold').fontSize(13).text(text, { align: 'center' });
      } else if (/^\\d+\\./.test(text) || text === 'ACEITE DIGITAL') {
        doc.font('Helvetica-Bold').fontSize(12).text(text);
      } else {
        doc.font('Helvetica').fontSize(11).text(text, { align: 'justify' });
      }
      doc.moveDown(0.6);
    });

    doc.end();

    stream.on('finish', () => {
      res.download(filePath, filename, (err) => {
        if (err) console.error('Erro ao enviar PDF de contrato:', err);
        safeUnlink(filePath);
      });
    });

    stream.on('error', (err) => {
      console.error('Erro no stream do contrato PDF:', err);
      if (!res.headersSent) res.status(500).json({ message: 'Erro ao gerar o PDF.' });
      safeUnlink(filePath);
    });
  } catch (err) {
    console.error('Erro ao gerar contrato PDF:', err);
    if (!res.headersSent) res.status(500).json({ message: 'PDF indisponivel no momento.' });
  }
};
