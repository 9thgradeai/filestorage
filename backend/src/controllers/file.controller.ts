import { Request, Response } from 'express';
import fs from 'fs';
import { StatusCodes } from 'http-status-codes';
import { FileModel } from '../models/file.model';
import { FolderModel } from '../models/folder.model';
import { storageUpload, storageDelete, storageDownload } from '../services/storage.service';
import { validateUpload, MAX_FILE_SIZE } from '../services/fileValidation';
import {
  validateTogglePublic,
  validateUpdateFile,
  validateStarFile,
} from '../services/validation';
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

// Default free-tier quota (5 GB). Real plans hook in here later.
const STORAGE_QUOTA =
  parseInt(process.env.DEFAULT_STORAGE_QUOTA || '', 10) || 5 * 1024 * 1024 * 1024;

const parseId = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const id = parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const parseBool = (value: unknown): boolean | undefined =>
  value === 'true' ? true : value === 'false' ? false : undefined;

export const uploadFile = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  if (!req.file) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'No file provided' });

  const { originalname, mimetype, size, path: filePath } = req.file;
  const rawParent = (req.body?.parent_id as string | undefined) || undefined;
  let parentId: number | null = null;
  if (rawParent !== undefined && rawParent !== '') {
    const parsed = parseId(rawParent);
    if (!parsed) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid parent folder' });
    parentId = parsed;
  }

  try {
    // Validate file (size, filename, extension + magic bytes) BEFORE uploading.
    const validationResult = await validateUpload(originalname, size, filePath, mimetype);
    if (!validationResult.isValid) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: validationResult.error || 'File validation failed',
      });
    }

    // Folder ownership + quota checks happen before anything hits storage.
    if (parentId !== null) {
      const folder = await FolderModel.findById(parentId, userId);
      if (!folder) {
        return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Parent folder not found' });
      }
      if (folder.trashed_at) {
        return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Parent folder is in trash' });
      }
    }

    const stats = await FileModel.getStats(userId);
    const usedBytes = parseInt(stats.used, 10) || 0;
    if (usedBytes + size > STORAGE_QUOTA) {
      return res.status(StatusCodes.INSUFFICIENT_STORAGE).json({
        message: `Storage quota exceeded. You have ${((STORAGE_QUOTA - usedBytes) / 1024 / 1024).toFixed(1)} MB left.`,
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
        parent_id: parentId,
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

  let folderId: number | null | undefined;
  const rawFolder = req.query.folder_id as string | undefined;
  if (rawFolder !== undefined) {
    if (rawFolder === 'null' || rawFolder === 'root' || rawFolder === '') folderId = null;
    else folderId = parseId(rawFolder) ?? null;
  }

  try {
    const { files, total, page: currentPage, limit: currentLimit } =
      await FileModel.findFilesByUser(userId, {
        page,
        limit,
        folderId,
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        starred: parseBool(req.query.starred),
        trashed: parseBool(req.query.trashed),
        isPublic: parseBool(req.query.public),
        sort: typeof req.query.sort === 'string' ? req.query.sort : undefined,
        order: typeof req.query.order === 'string' ? req.query.order : undefined,
        type: typeof req.query.type === 'string' ? req.query.type : undefined,
      });

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

  const id = parseId(req.params.id);
  if (!id) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid file ID' });

  try {
    const file = await FileModel.findFileById(id, userId);
    if (!file) return res.status(StatusCodes.NOT_FOUND).json({ message: 'File not found' });
    res.status(StatusCodes.OK).json({ file });
  } catch (error) {
    logger.error({ err: error }, 'Get file error:');
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not retrieve file' });
  }
};

// Rename and/or move a file to another folder.
export const updateFile = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  const id = parseId(req.params.id);
  if (!id) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid file ID' });

  const { error, value } = validateUpdateFile(req.body);
  if (error) return res.status(StatusCodes.BAD_REQUEST).json({ message: error.details[0].message });

  try {
    const file = await FileModel.findFileById(id, userId);
    if (!file) return res.status(StatusCodes.NOT_FOUND).json({ message: 'File not found' });
    if (file.trashed_at) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'File is in trash' });
    }

    if (value.parent_id !== undefined && value.parent_id !== null) {
      const folder = await FolderModel.findById(value.parent_id, userId);
      if (!folder) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Parent folder not found' });
      if (folder.trashed_at) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Parent folder is in trash' });
    }

    const updated = await FileModel.updateFile(id, userId, value);
    return res.status(StatusCodes.OK).json({ file: updated });
  } catch (error) {
    logger.error({ err: error }, 'Update file error:');
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not update file' });
  }
};

export const starFile = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  const id = parseId(req.params.id);
  if (!id) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid file ID' });

  const { error, value } = validateStarFile(req.body);
  if (error) return res.status(StatusCodes.BAD_REQUEST).json({ message: error.details[0].message });

  try {
    const updated = await FileModel.setStarred(id, userId, value.starred);
    if (!updated) return res.status(StatusCodes.NOT_FOUND).json({ message: 'File not found' });
    return res.status(StatusCodes.OK).json({ file: updated });
  } catch (error) {
    logger.error({ err: error }, 'Star file error:');
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not update file' });
  }
};

export const trashFile = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  const id = parseId(req.params.id);
  if (!id) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid file ID' });

  try {
    const updated = await FileModel.trashFile(id, userId);
    if (!updated) return res.status(StatusCodes.NOT_FOUND).json({ message: 'File not found' });
    return res.status(StatusCodes.OK).json({ file: updated, message: 'File moved to trash' });
  } catch (error) {
    logger.error({ err: error }, 'Trash file error:');
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not move file to trash' });
  }
};

export const restoreFile = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  const id = parseId(req.params.id);
  if (!id) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid file ID' });

  try {
    const updated = await FileModel.restoreFile(id, userId);
    if (!updated) return res.status(StatusCodes.NOT_FOUND).json({ message: 'File not found' });
    return res.status(StatusCodes.OK).json({ file: updated, message: 'File restored' });
  } catch (error) {
    logger.error({ err: error }, 'Restore file error:');
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not restore file' });
  }
};

export const deleteFile = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  const id = parseId(req.params.id);
  if (!id) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid file ID' });

  try {
    const file = await FileModel.findFileById(id, userId);
    if (!file) return res.status(StatusCodes.NOT_FOUND).json({ message: 'File not found' });

    // Remove from storage first, then DB.
    await storageDelete(file.s3_key);
    const deleted = await FileModel.deleteFile(id, userId);
    if (!deleted) return res.status(StatusCodes.NOT_FOUND).json({ message: 'File not found' });

    res.status(StatusCodes.OK).json({ message: 'File deleted permanently' });
  } catch (error) {
    logger.error({ err: error }, 'Delete file error:');
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not delete file' });
  }
};

export const togglePublic = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  const id = parseId(req.params.id);
  if (!id) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid file ID' });

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

  const id = parseId(req.params.id);
  if (!id) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid file ID' });

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

  const id = parseId(req.params.id);
  if (!id) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid file ID' });

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

// Storage + counts for the quota meter and sidebar badges.
export const getStats = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  try {
    const stats = await FileModel.getStats(userId);
    return res.status(StatusCodes.OK).json({
      quota: STORAGE_QUOTA,
      ...stats,
      used: parseInt(stats.used, 10) || 0,
    });
  } catch (error) {
    logger.error({ err: error }, 'Stats error');
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not load stats' });
  }
};

// Recently added files across every folder (Home view).
export const getRecent = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  const limit = parseInt(req.query.limit as string, 10) || 10;
  try {
    const files = await FileModel.findRecentFiles(userId, limit);
    return res.status(StatusCodes.OK).json({ files });
  } catch (error) {
    logger.error({ err: error }, 'Recent files error');
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not load recent files' });
  }
};