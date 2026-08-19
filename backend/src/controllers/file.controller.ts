import { Request, Response } from 'express';
import fs from 'fs';
import { StatusCodes } from 'http-status-codes';
import { FileModel } from '../models/file.model';
import { storageUpload, storageDelete, storageDownload } from '../services/storage.service';
import { validateUpload, MAX_FILE_SIZE } from '../services/fileValidation';
import { validateTogglePublic } from '../services/validation';
import { contentDisposition } from '../utils/crypto';
import { randomHex } from '../utils/crypto';
import { logger } from '../config/logger';

// Content types safe to stream back to a browser. Everything else is forced to
// application/octet-stream so active content (HTML/SVG/XML) cannot render in the
// context of the app origin.
const SAFE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/gzip',
  'application/x-tar',
]);

const safeMime = (mime: string | null): string =>
  mime && SAFE_CONTENT_TYPES.has(mime) ? mime : 'application/octet-stream';

const getUserId = (req: Request): number | null => req.user?.id ?? null;

export const uploadFile = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  if (!req.file) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'No file provided' });

  const { originalname, mimetype, size, path: filePath } = req.file;

  try {
    // Validate file (size, filename, extension + magic bytes) BEFORE uploading.
    const validationResult = await validateUpload(originalname, size, filePath, mimetype);
    if (!validationResult.isValid) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: validationResult.error || 'File validation failed',
      });
    }

    // Unique storage key; never derive the path from the client filename alone.
    const safeBase = originalname.replace(/[^\w.\-]/g, '_').slice(0, 100);
    const storedFilename = `${Date.now()}-${randomHex(8)}-${safeBase}`;
    const s3Key = `${userId}/${storedFilename}`;

    // Stream from disk to storage (S3 or local) — no full-file buffering.
    const stream = fs.createReadStream(filePath);
    await storageUpload(s3Key, stream, mimetype);

    try {
      // Persist metadata after the object exists in storage.
      const result = await FileModel.createFile({
        user_id: userId,
        original_filename: originalname,
        stored_filename: storedFilename,
        s3_key: s3Key,
        file_size: size,
        mime_type: mimetype,
        is_public: false,
      });

      return res.status(StatusCodes.CREATED).json({ file: result });
    } catch (error) {
      // Metadata insert failed → remove the orphaned storage object.
      logger.error({ err: error }, 'File metadata insert error:');
      await storageDelete(s3Key).catch(() => {});
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'File upload failed' });
    }
  } catch (error) {
    logger.error({ err: error }, 'File upload error:');
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'File upload failed' });
  } finally {
    // Always remove the temp file, success or failure.
    await fs.promises.unlink(filePath).catch(() => {});
  }
};

export const listFiles = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 20;
  const isPublic =
    req.query.public === 'true' ? true : req.query.public === 'false' ? false : undefined;

  try {
    const { files, total, page: currentPage, limit: currentLimit } =
      await FileModel.findFilesByUser(userId, { page, limit, isPublic });

    return res.status(StatusCodes.OK).json({
      files,
      pagination: {
        page: currentPage,
        limit: currentLimit,
        total,
        totalPages: Math.ceil(total / currentLimit),
      },
    });
  } catch (error) {
    logger.error({ err: error, userId }, 'List files error');
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not list files' });
  }
};

export const getFile = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  const id = parseInt(req.params.id as string, 10);
  if (!Number.isInteger(id)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid file ID' });
  }

  try {
    const file = await FileModel.findFileById(id, userId);
    if (!file) return res.status(StatusCodes.NOT_FOUND).json({ message: 'File not found' });
    res.status(StatusCodes.OK).json({ file });
  } catch (error) {
    logger.error({ err: error }, 'Get file error:');
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not retrieve file' });
  }
};

export const deleteFile = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  const id = parseInt(req.params.id as string, 10);
  if (!Number.isInteger(id)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid file ID' });
  }

  try {
    const file = await FileModel.findFileById(id, userId);
    if (!file) return res.status(StatusCodes.NOT_FOUND).json({ message: 'File not found' });

    // Remove from storage first, then DB.
    await storageDelete(file.s3_key);
    const deleted = await FileModel.deleteFile(id, userId);
    if (!deleted) return res.status(StatusCodes.NOT_FOUND).json({ message: 'File not found' });

    res.status(StatusCodes.OK).json({ message: 'File deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Delete file error:');
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not delete file' });
  }
};

export const togglePublic = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  const id = parseInt(req.params.id as string, 10);
  if (!Number.isInteger(id)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid file ID' });
  }

  const { error } = validateTogglePublic(req.body);
  if (error) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: error.details[0].message });
  }
  const isPublic = Boolean(req.body.is_public);

  try {
    const updated = await FileModel.updateFilePublicStatus(id, userId, isPublic);
    if (!updated) return res.status(StatusCodes.NOT_FOUND).json({ message: 'File not found' });
    res.status(StatusCodes.OK).json({ file: updated });
  } catch (error) {
    logger.error({ err: error }, 'Toggle public error:');
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not update file' });
  }
};

const sendFile = (res: Response, stream: NodeJS.ReadableStream, file: { mime_type: string | null; original_filename: string }) => {
  res.setHeader('Content-Type', safeMime(file.mime_type));
  res.setHeader('Content-Disposition', contentDisposition(file.original_filename));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  stream.pipe(res);
};

export const downloadFile = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  const id = parseInt(req.params.id as string, 10);
  if (!Number.isInteger(id)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid file ID' });
  }

  try {
    const file = await FileModel.findFileById(id, userId);
    if (!file) return res.status(StatusCodes.NOT_FOUND).json({ message: 'File not found' });

    const stream = await storageDownload(file.s3_key);
    sendFile(res, stream, file);
  } catch (error) {
    logger.error({ err: error }, 'Download file error:');
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not download file' });
  }
};

// Public, unauthenticated access via share token.
export const getPublicFile = async (req: Request, res: Response) => {
  const token = req.params.shareToken as string;
  if (!token) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Missing share token' });

  try {
    const file = await FileModel.findPublicFileByShareToken(token);
    if (!file) return res.status(StatusCodes.NOT_FOUND).json({ message: 'File not found or link expired' });

    const stream = await storageDownload(file.s3_key);
    // Always force attachment so untrusted content cannot execute inline.
    sendFile(res, stream, file);
  } catch (error) {
    logger.error({ err: error, shareToken: token }, 'Public file error');
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not retrieve file' });
  }
};

// Public metadata for the shared page (used by the frontend preview).
export const getPublicFileInfo = async (req: Request, res: Response) => {
  const token = req.params.shareToken as string;
  if (!token) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Missing share token' });

  try {
    const info = await FileModel.findPublicFileInfoByShareToken(token);
    if (!info) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'File not found or link expired' });
    }
    res.status(StatusCodes.OK).json({ file: info });
  } catch (error) {
    logger.error({ err: error, shareToken: token }, 'Public file info error');
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not retrieve file info' });
  }
};

// Generate a shareable link/token for a public file (auth + ownership required).
export const generateShareLink = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  const id = parseInt(req.params.id as string, 10);
  if (!Number.isInteger(id)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid file ID' });
  }

  try {
    const file = await FileModel.findFileById(id, userId);
    if (!file) return res.status(StatusCodes.NOT_FOUND).json({ message: 'File not found' });
    if (!file.is_public) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'File must be public to share' });
    }

    const updated = await FileModel.generateShareToken(id, userId);
    if (!updated) return res.status(StatusCodes.NOT_FOUND).json({ message: 'File not found' });

    const baseUrl = process.env.PUBLIC_FILE_BASE_URL || process.env.FRONTEND_URL || '';
    res.status(StatusCodes.OK).json({
      share_token: updated.share_token,
      share_url: `${baseUrl}/shared/${updated.share_token}`,
    });
  } catch (error) {
    logger.error({ err: error }, 'Generate share link error:');
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not generate link' });
  }
};