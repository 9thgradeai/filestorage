import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/authenticate';
import { csrfProtect } from '../middleware/csrf';
import {
  uploadFile,
  listFiles,
  getFile,
  deleteFile,
  togglePublic,
  downloadFile,
  getPublicFile,
  getPublicFileInfo,
  generateShareLink,
} from '../controllers/file.controller';
import { MAX_FILE_SIZE } from '../services/fileValidation';
import { randomHex } from '../utils/crypto';

const router = Router();

// Files land in a private temp dir first so content validation (magic bytes)
// can run before anything is persisted to S3, without buffering 100MB in RAM.
const UPLOAD_DIR = path.join(os.tmpdir(), 'filestorage-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Never use the client-supplied filename for the on-disk path.
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, _file, cb) => cb(null, `${Date.now()}-${randomHex(8)}`),
  }),
  limits: { fileSize: MAX_FILE_SIZE },
});

// Mutations are cookie-session driven, so they are CSRF-protected AFTER the
// user is authenticated (unauthorized requests still surface as 401).
router.post('/upload', authenticate, csrfProtect, upload.single('file'), uploadFile);
router.get('/', authenticate, listFiles);
router.get('/:id', authenticate, getFile);
router.delete('/:id', authenticate, csrfProtect, deleteFile);
router.put('/:id/toggle-public', authenticate, csrfProtect, togglePublic);
router.get('/:id/download', authenticate, downloadFile);

// Public, unauthenticated access via share token.
router.get('/public/:shareToken/info', getPublicFileInfo);
router.get('/public/:shareToken', getPublicFile);

// Generate a shareable link/token for a public file (auth + ownership required).
router.post('/:id/share', authenticate, csrfProtect, generateShareLink);

export default router;