import fs from 'fs';
import { filetypeinfo } from 'magic-bytes.js';

// Maximum file size: 100MB by default (configurable via MAX_FILE_SIZE env).
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '104857600', 10);

// Only native executables and server-side scripts are blocked — every other
// file type (video, audio, design, data, code, archives, …) uploads freely.
// Serving is safe regardless: downloads are forced to Content-Disposition:
// attachment with X-Content-Type-Options: nosniff and unknown types are
// rewritten to application/octet-stream, so nothing can execute in-browser.
const BLOCKED_EXTENSIONS = new Set([
  // Windows executables / installers / scripts
  '.exe', '.dll', '.bat', '.cmd', '.com', '.scr', '.msi', '.vbs', '.ps1',
  // Server-side scripts (dangerous if storage were ever served directly)
  '.php', '.jsp', '.asp', '.aspx', '.cgi',
]);

export const formatSizeLabel = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${Math.round(bytes / (1024 * 1024))}MB`
    : `${Math.round(bytes / 1024)}KB`;

interface ValidationResult {
  isValid: boolean;
  error?: string;
  // MIME type refined via magic-byte detection; falls back to the declared
  // browser type, then application/octet-stream. Store this value.
  resolvedMime?: string;
}

// Detect the real MIME type from raw bytes using magic-byte signatures. Returns
// null when the content has no detectable signature (plain text, json, csv…).
const detectMime = (buffer: Buffer): string | null => {
  try {
    const matches = filetypeinfo(buffer);
    const match = matches.find((m) => m?.mime);
    return match?.mime ?? null;
  } catch {
    return null;
  }
};

export const validateFileContent = async (buffer: Buffer): Promise<string | null> =>
  detectMime(buffer);

// Detect content type from a source that is either an in-memory buffer or the
// path to a temp file on disk. Only the header is read, so large-file
// validation never loads the whole file into memory.
const detectContentType = async (source: Buffer | string): Promise<string | null> => {
  try {
    if (typeof source === 'string') {
      const handle = await fs.promises.open(source, 'r');
      try {
        const header = Buffer.alloc(4100);
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        return detectMime(header.subarray(0, bytesRead));
      } finally {
        await handle.close();
      }
    }
    return detectMime(source);
  } catch {
    return null;
  }
};

const getExtension = (filename: string): string => {
  const idx = filename.lastIndexOf('.');
  return idx === -1 ? '' : filename.slice(idx).toLowerCase();
};

export const validateUpload = async (
  filename: string,
  size: number,
  source: Buffer | string,
  mimeType: string
): Promise<ValidationResult> => {
  // Check file size
  if (size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `File size exceeds maximum allowed size of ${formatSizeLabel(MAX_FILE_SIZE)}`,
    };
  }

  // Validate filename
  if (!filename || filename.length > 255) {
    return {
      isValid: false,
      error: 'Invalid filename',
    };
  }

  // Check for path traversal attempts
  const invalidChars = ['/', '\\', '..', '\0'];
  if (invalidChars.some((char) => filename.includes(char))) {
    return {
      isValid: false,
      error: 'Filename contains invalid characters',
    };
  }

  // Block executables / server scripts by extension (final extension wins).
  const ext = getExtension(filename);
  if (ext && BLOCKED_EXTENSIONS.has(ext)) {
    return {
      isValid: false,
      error: `File type "${ext}" is not allowed for security reasons`,
    };
  }

  // Magic bytes are used to refine the stored MIME, never to reject: many
  // formats have overlapping signatures (docx ≡ zip) or none at all (text).
  let resolvedMime =
    mimeType && mimeType !== 'application/octet-stream' ? mimeType : '';
  if (!resolvedMime) {
    const detectedType = await detectContentType(source);
    if (detectedType) resolvedMime = detectedType;
  }

  return { isValid: true, resolvedMime: resolvedMime || 'application/octet-stream' };
};

// Kept for API compatibility: an extension is allowed unless explicitly blocked.
export const isAllowedExtension = (filename: string): boolean => {
  const ext = getExtension(filename);
  return !ext || !BLOCKED_EXTENSIONS.has(ext);
};

// Stream-based validation for large files (header-only read).
export const validateStream = async (
  stream: NodeJS.ReadableStream,
  _filename: string
): Promise<ValidationResult> => {
  void _filename;
  // Nothing to reject at stream level anymore — size and filename checks run
  // before streaming, and content detection cannot fail an upload.
  void stream;
  return { isValid: true };
};

export { MAX_FILE_SIZE };
