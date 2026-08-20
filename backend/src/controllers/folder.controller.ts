import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { FolderModel } from '../models/folder.model';
import { storageDelete } from '../services/storage.service';
import { validateCreateFolder, validateUpdateFolder } from '../services/validation';
import { logger } from '../config/logger';

const getUserId = (req: Request): number | null => req.user?.id ?? null;

const parseId = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const id = parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export const createFolder = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  const { error, value } = validateCreateFolder(req.body);
  if (error) return res.status(StatusCodes.BAD_REQUEST).json({ message: error.details[0].message });

  try {
    if (value.parent_id !== null) {
      const parent = await FolderModel.findById(value.parent_id, userId);
      if (!parent) {
        return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Parent folder not found' });
      }
      if (parent.trashed_at) {
        return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Parent folder is in trash' });
      }
    }

    const folder = await FolderModel.create(userId, value.name, value.parent_id);
    return res.status(StatusCodes.CREATED).json({ folder });
  } catch (err) {
    logger.error({ err }, 'Create folder error');
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not create folder' });
  }
};

export const listFolders = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  try {
    const folders = await FolderModel.listForUser(userId);
    return res.status(StatusCodes.OK).json({ folders });
  } catch (err) {
    logger.error({ err }, 'List folders error');
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not list folders' });
  }
};

export const updateFolder = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  const id = parseId(req.params.id);
  if (!id) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid folder ID' });

  const { error, value } = validateUpdateFolder(req.body);
  if (error) return res.status(StatusCodes.BAD_REQUEST).json({ message: error.details[0].message });

  try {
    const folder = await FolderModel.findById(id, userId);
    if (!folder) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Folder not found' });

    // Moving a folder into itself (or a descendant) would create a cycle.
    if (value.parent_id !== undefined && value.parent_id !== null) {
      if (value.parent_id === id) {
        return res.status(StatusCodes.BAD_REQUEST).json({ message: 'A folder cannot be moved into itself' });
      }
      const descendants = await FolderModel.descendantIds(id, userId);
      if (descendants.includes(value.parent_id)) {
        return res.status(StatusCodes.BAD_REQUEST).json({ message: 'A folder cannot be moved into its own subfolder' });
      }
      const parent = await FolderModel.findById(value.parent_id, userId);
      if (!parent) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Parent folder not found' });
      if (parent.trashed_at) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Parent folder is in trash' });
    }

    const updated = await FolderModel.update(id, userId, value);
    return res.status(StatusCodes.OK).json({ folder: updated });
  } catch (err) {
    logger.error({ err }, 'Update folder error');
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not update folder' });
  }
};

export const trashFolder = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  const id = parseId(req.params.id);
  if (!id) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid folder ID' });

  try {
    const folder = await FolderModel.findById(id, userId);
    if (!folder) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Folder not found' });

    await FolderModel.trashRecursive(id, userId);
    return res.status(StatusCodes.OK).json({ message: 'Folder moved to trash' });
  } catch (err) {
    logger.error({ err }, 'Trash folder error');
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not move folder to trash' });
  }
};

export const restoreFolder = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  const id = parseId(req.params.id);
  if (!id) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid folder ID' });

  try {
    const folder = await FolderModel.findById(id, userId);
    if (!folder) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Folder not found' });
    if (!folder.trashed_at) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Folder is not in trash' });
    }

    await FolderModel.restoreRecursive(id, userId);
    return res.status(StatusCodes.OK).json({ message: 'Folder restored' });
  } catch (err) {
    logger.error({ err }, 'Restore folder error');
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not restore folder' });
  }
};

export const deleteFolder = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });

  const id = parseId(req.params.id);
  if (!id) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid folder ID' });

  try {
    const folder = await FolderModel.findById(id, userId);
    if (!folder) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Folder not found' });

    // Gather storage keys first, remove objects (best-effort), then drop rows.
    const keys = await FolderModel.subtreeFileKeys(id, userId);
    await Promise.all(keys.map((k) => storageDelete(k).catch(() => {})));
    await FolderModel.deleteRecursive(id, userId);

    return res.status(StatusCodes.OK).json({ message: 'Folder permanently deleted' });
  } catch (err) {
    logger.error({ err }, 'Delete folder error');
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Could not delete folder' });
  }
};