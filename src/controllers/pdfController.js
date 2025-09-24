// src/controllers/pdfController.js

// remova estes imports de topo:
// import PDFDocument from 'pdfkit';
// import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
// import { pathToFileURL } from 'url';

import fs from 'fs';
import path from 'path';

export const generateRecipePdf = async (req, res) => {
  try {
    const { default: PDFDocument } = await import('pdfkit');
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { pathToFileURL } = await import('url');

    pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
      path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')
    ).href;

    // ... SEU CÓDIGO ATUAL DA GERAÇÃO DO PDF (mantém igual) ...
  } catch (err) {
    console.error('Erro ao carregar libs de PDF:', err);
    if (!res.headersSent) return res.status(500).json({ message: 'PDF indisponível no momento.' });
  }
};
