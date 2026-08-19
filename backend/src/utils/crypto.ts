import crypto from 'crypto';

// Sanitize a filename for safe use inside HTTP headers (prevents header
// injection via CR/LF and control characters).
export const sanitizeContentDisposition = (filename: string): string => {
  return filename
    .replace(/[\r\n]/g, '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .slice(0, 255);
};

// RFC 5987 encoded value for non-ASCII filenames (falls back to ascii).
export const contentDisposition = (filename: string, inline = false): string => {
  const name = sanitizeContentDisposition(filename);
  const disposition = inline ? 'inline' : 'attachment';
  return `${disposition}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

// Cryptographically-secure token generation (share tokens, storage keys).
export const randomToken = (bytes = 32): string =>
  crypto.randomBytes(bytes).toString('base64url');

export const randomHex = (bytes = 8): string =>
  crypto.randomBytes(bytes).toString('hex');