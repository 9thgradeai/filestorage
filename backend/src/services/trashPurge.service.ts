import { FileModel } from '../models/file.model';
import { safeStorageDelete } from './storage.service';
import { logger } from '../config/logger';

// Trashed files are auto-deleted after this many days (Drive-style retention).
export const TRASH_RETENTION_DAYS =
  parseInt(process.env.TRASH_RETENTION_DAYS || '', 10) || 30;

// Permanently remove trashed files past the retention window. Row deletion is
// atomic and returns exactly the keys whose rows died, so storage cleanup can
// never race with a concurrent restore. Object removal is best-effort with
// retries; failures are logged for reconciliation.
export const purgeExpiredTrash = async (): Promise<number> => {
  const keys = await FileModel.deleteExpiredTrash(TRASH_RETENTION_DAYS);
  if (keys.length === 0) return 0;

  const results = await Promise.all(
    keys.map((key) => safeStorageDelete(key, 'trash-purge'))
  );
  const failed = results.filter((ok) => !ok).length;

  logger.info(
    { purged: keys.length - failed, failed, retentionDays: TRASH_RETENTION_DAYS },
    'Trash purge completed'
  );
  if (failed > 0) {
    logger.error({ failed }, 'Trash purge left orphaned storage objects');
  }
  return keys.length;
};
