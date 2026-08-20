/**
 * Upload de mídia de curso (capas, posters, logos, bg de login, thumbs, PDFs),
 * compartilhado entre o admin e o coprodutor. Imagens raster viram webp ≤1920;
 * PDF passa direto. Disco local em uploads/courses, servido pelo host do backend.
 */
import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { isAllowedUpload } from './uploadGuards';
import { optimizeImage } from './image';

const coursesMediaDir = path.join(__dirname, '..', '..', 'uploads', 'courses');
fs.mkdirSync(coursesMediaDir, { recursive: true });

export const coursesUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, coursesMediaDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedUpload(file.mimetype, { pdf: true })) cb(null, true);
    else cb(new Error('Apenas imagens ou PDF são permitidos'));
  },
});

/** Handler do POST de upload (multipart form-data, campo "file"). */
export function handleCourseMediaUpload(req: Request, res: Response) {
  coursesUpload.single('file')(req, res, async (err: any) => {
    if (err) return res.status(400).json({ error: err.message || 'Falha no upload' });
    if (!req.file) return res.status(400).json({ error: 'Arquivo ausente' });

    const isPdf = req.file.mimetype === 'application/pdf';
    let filename = req.file.filename;
    if (!isPdf) {
      const optimized = await optimizeImage(req.file.path, { maxDim: 1920, format: 'webp' });
      if (optimized) filename = optimized.filename;
    }
    // URL absoluta: members.czero.sbs é outra origem; /uploads é servido pelo
    // host do backend (app.czero.sbs).
    const base = `${req.protocol}://${req.get('host')}`;
    return res.json({
      url: `${base}/uploads/courses/${filename}`,
      name: req.file.originalname,
      type: isPdf ? 'file' : 'image',
    });
  });
}
