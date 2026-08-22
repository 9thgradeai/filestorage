import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import {
  s3Upload as s3UploadImpl,
  s3Delete as s3DeleteImpl,
  s3Download as s3DownloadImpl,
} from './s3.service';
import { logger } from '../config/logger';

// Storage driver selection:
//   STORAGE_DRIVER=local  → filesystem on STORAGE_DIR (Railway volume, dev disk)
//   anything else          → AWS S3 (default, keeps existing behavior)
export type StorageDriver = 's3' | 'local';
export const storageDriver: StorageDriver =
  process.env.STORAGE_DRIVER === 'local' ? 'local' : 's3';

const storageDir = process.env.STORAGE_DIR || path.join(process.cwd(), '.data');

// Resolve a storage key to a safe path inside STORAGE_DIR. Keys are generated
// server-side (`<userId>/<timestamp>-<random>-<sanitized>`), but a belt-and-
// braces traversal guard keeps malicious keys from escaping the data dir.
const localPath = (key: string): string => {
  const base = path.resolve(storageDir);
  const resolved = path.resolve(base, key);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return resolved;
};

const writeStreamToFile = (target: string, body: Readable): Promise<void> =>
  new Promise((resolve, reject) => {
    const out = fs.createWriteStream(target, { flags: 'wx' });
    body.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
  });

export const storageUpload = async (
  key: string,
  body: Buffer | Readable,
  _contentType: string
) => {
  if (storageDriver === 'local') {
    const target = localPath(key);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    if (Buffer.isBuffer(body)) {
      await fs.promises.writeFile(target, body);
    } else {
      await writeStreamToFile(target, body);
    }
    return { key };
  }
  return s3UploadImpl(key, body, _contentType);
};

export const storageDelete = async (key: string): Promise<void> => {
  if (storageDriver === 'local') {
    await fs.promises.unlink(localPath(key)).catch(() => {});
    return;
  }
  return s3DeleteImpl(key);
};

// Best-effort delete with retries and structured logging. Storage removal is
// allowed to fail transiently, but failures must be observable so orphaned
// objects can be reconciled — never silently swallowed.
const STORAGE_DELETE_RETRIES = 3;
const STORAGE_DELETE_RETRY_DELAY_MS = 250;

export const safeStorageDelete = async (
  key: string,
  context: string
): Promise<boolean> => {
  for (let attempt = 1; attempt <= STORAGE_DELETE_RETRIES; attempt++) {
    try {
      await storageDelete(key);
      return true;
    } catch (err) {
      logger.warn(
        { err, key: `${context}:${key.slice(0, 12)}…`, attempt },
        'Storage delete failed'
      );
      if (attempt < STORAGE_DELETE_RETRIES) {
        await new Promise((r) => setTimeout(r, STORAGE_DELETE_RETRY_DELAY_MS * attempt));
      }
    }
  }
  logger.error({ key: `${context}:${key.slice(0, 12)}…` }, `Storage delete failed after ${STORAGE_DELETE_RETRIES} attempts — object may be orphaned`);
  return false;
};

export const storageDownload = async (key: string): Promise<Readable> => {
  if (storageDriver === 'local') {
    const target = localPath(key);
    await fs.promises.access(target, fs.constants.R_OK).catch(() => {
      throw new Error(`File not found in storage: ${key}`);
    });
    return fs.createReadStream(target);
  }
  return s3DownloadImpl(key);
};