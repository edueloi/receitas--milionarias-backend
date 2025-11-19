// src/middleware/uploadMiddleware.js
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Criar diretórios de uploads se não existirem
const uploadsDir = path.join(__dirname, '../../uploads');
const videosDir = path.join(uploadsDir, 'videos');
const imagesDir = path.join(uploadsDir, 'images');
const pdfsDir = path.join(uploadsDir, 'pdfs');

[uploadsDir, videosDir, imagesDir, pdfsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configuração de armazenamento do Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Define o diretório baseado no tipo de arquivo
    if (file.mimetype.startsWith('video/')) {
      cb(null, videosDir);
    } else if (file.mimetype === 'application/pdf') {
      cb(null, pdfsDir);
    } else if (file.mimetype.startsWith('image/')) {
      cb(null, imagesDir);
    } else {
      cb(null, uploadsDir);
    }
  },
  filename: (req, file, cb) => {
    // Nome único: timestamp + nome original sanitizado
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const nameWithoutExt = path.basename(file.originalname, ext)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '-')
      .substring(0, 50); // Limitar tamanho do nome
    cb(null, `${nameWithoutExt}-${uniqueSuffix}${ext}`);
  }
});

// Filtro de arquivos - aceita imagens, vídeos e PDFs
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    // Vídeos
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/webm',
    // Imagens
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    // Documentos
    'application/pdf'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não permitido. Use: MP4, AVI, MOV, MKV, WebM, JPEG, PNG, GIF, WebP ou PDF'), false);
  }
};

// Inicializa o middleware do Multer com as configurações
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024 // Limite de 500MB por arquivo (para vídeos)
  }
});

export default upload;
