import { Readable } from 'stream';
import fs from 'fs';
import { filetypeinfo } from 'magic-bytes.js';

// Allowed MIME types for uploads (OWASP secure file upload practices)
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/gzip',
  'application/x-tar',
];

// Maximum file size: 100MB by default (configurable via MAX_FILE_SIZE env).
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '104857600', 10);

export const formatSizeLabel = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${Math.round(bytes / (1024 * 1024))}MB`
    : `${Math.round(bytes / 1024)}KB`;

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

// Detect the real MIME type from raw bytes using magic-byte signatures. Returns
// null when the content has no detectable signature.
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

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      isValid: false,
      error: `Invalid file type "${mimeType}" is not allowed`,
    };
  }

  // Validate content type using magic-byte detection
  const detectedType = await detectContentType(source);
  if (detectedType && !ALLOWED_MIME_TYPES.includes(detectedType)) {
    return {
      isValid: false,
      error: `File content type "${detectedType}" does not match declared type`,
    };
  }

  return { isValid: true };
};

// Helper to check if a MIME type is valid for a given extension (OWASP recommendation)
export const isAllowedExtension = (filename: string): boolean => {
  const validExtensions = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.txt', '.csv', '.zip', '.gz', '.tar',
  ];

  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  return validExtensions.includes(ext);
};

// Read the first chunk of a stream without consuming the rest.
const readFirstChunk = (stream: Readable): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      stream.removeListener('data', onData);
      stream.unshift(chunk);
      resolve(chunk);
    };
    stream.once('data', onData);
    stream.once('error', reject);
  });

// Stream-based validation for large files
export const validateStream = async (stream: Readable, filename: string): Promise<ValidationResult> => {
  if (!isAllowedExtension(filename)) {
    return {
      isValid: false,
      error: 'File extension not allowed',
    };
  }

  // Basic check on first chunk
  const firstChunk = await readFirstChunk(stream);
  const detectedType = detectMime(firstChunk);
  if (detectedType && !ALLOWED_MIME_TYPES.includes(detectedType)) {
    return {
      isValid: false,
      error: `File content type "${detectedType}" is not allowed`,
    };
  }

  return { isValid: true };
};

export { MAX_FILE_SIZE };