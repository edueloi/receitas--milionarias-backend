// routes/ebookRoutes.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import * as ebookController from "../controllers/ebookController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

const ensureDir = (dir) => fs.existsSync(dir) || fs.mkdirSync(dir, { recursive: true });

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = "uploads/ebooks/files";
    if (file.fieldname === "capa") folder = "uploads/ebooks/covers";
    ensureDir(folder);
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === "capa") {
    return file.mimetype.startsWith("image/")
      ? cb(null, true)
      : cb(new Error("Apenas imagens são permitidas para a capa!"), false);
  }

  if (file.fieldname === "arquivo") {
    const ext = path.extname(file.originalname).toLowerCase();
    const extOk = [".pdf", ".doc", ".docx", ".ppt", ".pptx"].includes(ext);
    const mimeOk =
      file.mimetype === "application/pdf" ||
      file.mimetype === "application/msword" ||
      file.mimetype === "application/vnd.ms-powerpoint" ||
      file.mimetype.startsWith("application/vnd.openxmlformats-officedocument");
    return extOk || mimeOk
      ? cb(null, true)
      : cb(
          new Error("Tipo de arquivo não suportado! Use PDF, DOC, DOCX, PPT ou PPTX."),
          false
        );
  }

  return cb(new Error("Campo de arquivo inválido."), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 100 }, // 100MB
});

// routes
router
  .route("/")
  .get(ebookController.getAllEbooks)
  .post(
    authMiddleware,
    upload.fields([
      { name: "capa", maxCount: 1 },
      { name: "arquivo", maxCount: 1 },
    ]),
    ebookController.createEbook
  );

router
  .route("/:id")
  .get(ebookController.getEbookById)
  .put(
    authMiddleware,
    upload.fields([
      { name: "capa", maxCount: 1 },
      { name: "arquivo", maxCount: 1 },
    ]),
    ebookController.updateEbook
  )
  .delete(authMiddleware, ebookController.deleteEbook);

router.route("/:id/download").get(ebookController.downloadEbook);

// handler opcional para erros de upload (retorna JSON bonitinho)
router.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError || err?.message?.toLowerCase().includes("arquivo")) {
    return res.status(400).json({ message: err.message });
  }
  next(err);
});

export default router;
