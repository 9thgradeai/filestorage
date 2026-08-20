import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { csrfProtect } from '../middleware/csrf';
import {
  createFolder,
  listFolders,
  updateFolder,
  trashFolder,
  restoreFolder,
  deleteFolder,
} from '../controllers/folder.controller';

const router = Router();

router.get('/', authenticate, listFolders);
router.post('/', authenticate, csrfProtect, createFolder);
router.put('/:id', authenticate, csrfProtect, updateFolder);
router.post('/:id/trash', authenticate, csrfProtect, trashFolder);
router.post('/:id/restore', authenticate, csrfProtect, restoreFolder);
router.delete('/:id', authenticate, csrfProtect, deleteFolder);

export default router;