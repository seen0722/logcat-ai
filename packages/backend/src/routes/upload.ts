import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getConfig } from '../config.js';

const router = Router();

function getUpload() {
  const config = getConfig();
  fs.mkdirSync(config.uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, file, cb) => {
      const id = crypto.randomUUID();
      const ext = path.extname(file.originalname) || '.zip';
      cb(null, `${id}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: config.maxFileSize },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === 'application/zip' ||
          file.mimetype === 'application/x-zip-compressed' ||
          file.originalname.endsWith('.zip')) {
        cb(null, true);
      } else {
        cb(new Error('Only .zip files are accepted'));
      }
    },
  });
}

/**
 * POST /api/upload
 * Upload a bugreport.zip file.
 * Returns { id, filename, size }.
 */
router.post('/', (req: Request, res: Response) => {
  const upload = getUpload();
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const id = path.basename(req.file.filename, path.extname(req.file.filename));

    res.json({
      id,
      filename: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
    });
  });
});

export default router;
