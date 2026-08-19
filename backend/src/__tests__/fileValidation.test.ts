import { Readable } from 'stream';
import {
  validateUpload,
  validateFileContent,
  validateStream,
  isAllowedExtension,
  MAX_FILE_SIZE,
} from '../services/fileValidation';

const PNG_HEADER = Buffer.concat([
  Buffer.from('89504e470d0a1a0a', 'hex'),
  Buffer.alloc(32),
]);
const TEXT = Buffer.from('plain text content');

function fakeMp4Header(): Buffer {
  const buf = Buffer.alloc(1024);
  buf.writeUInt32BE(1024, 0);
  buf.write('ftyp', 4, 'latin1');
  buf.write('mp42', 8, 'latin1');
  buf.writeUInt32BE(0, 12);
  buf.write('isom', 16, 'latin1');
  buf.write('avc1', 20, 'latin1');
  return buf;
}

describe('fileValidation', () => {
  describe('validateFileContent', () => {
    it('detects known content types from magic bytes', async () => {
      expect(await validateFileContent(PNG_HEADER)).toBe('image/png');
    });

    it('returns null for content with no detectable magic bytes', async () => {
      expect(await validateFileContent(TEXT)).toBeNull();
    });
  });

  describe('validateUpload', () => {
    it('rejects files larger than the max size', async () => {
      const result = await validateUpload('big.pdf', MAX_FILE_SIZE + 1, TEXT, 'application/pdf');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('File size exceeds');
    });

    it('accepts a file exactly at the max size', async () => {
      const result = await validateUpload('big.pdf', MAX_FILE_SIZE, TEXT, 'application/pdf');
      expect(result.isValid).toBe(true);
    });

    it('rejects empty filenames', async () => {
      const result = await validateUpload('', 10, TEXT, 'text/plain');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid filename');
    });

    it('rejects filenames longer than 255 chars', async () => {
      const result = await validateUpload('a'.repeat(256), 10, TEXT, 'text/plain');
      expect(result.isValid).toBe(false);
    });

    it('rejects path traversal characters', async () => {
      for (const bad of ['../../x', 'a/b', 'a\\b', 'null\u0000byte']) {
        const result = await validateUpload(bad, 10, TEXT, 'text/plain');
        expect(result.isValid).toBe(false);
      }
    });

    it('rejects disallowed mime types', async () => {
      const result = await validateUpload('script.exe', 10, TEXT, 'application/x-msdownload');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid file type');
    });

    it('rejects content whose detected type is not allowed', async () => {
      const result = await validateUpload('note.txt', 1024, fakeMp4Header(), 'text/plain');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('video/mp4');
    });

    it('accepts a valid matching upload', async () => {
      const result = await validateUpload('photo.png', 1024, PNG_HEADER, 'image/png');
      expect(result.isValid).toBe(true);
    });
  });

  describe('isAllowedExtension', () => {
    it('allows whitelisted extensions', () => {
      expect(isAllowedExtension('report.pdf')).toBe(true);
      expect(isAllowedExtension('IMG_001.JPG')).toBe(true);
    });

    it('rejects unknown or missing extensions', () => {
      expect(isAllowedExtension('virus.exe')).toBe(false);
      expect(isAllowedExtension('noext')).toBe(false);
    });
  });

  describe('validateStream', () => {
    it('rejects disallowed extensions', async () => {
      const result = await validateStream(Readable.from([TEXT]), 'virus.exe');
      expect(result.isValid).toBe(false);
    });

    it('rejects streams with a detected disallowed type', async () => {
      const result = await validateStream(Readable.from([fakeMp4Header()]), 'note.txt');
      expect(result.isValid).toBe(false);
    });

    it('accepts allowed text streams with no detectable magic', async () => {
      const result = await validateStream(Readable.from([TEXT]), 'note.txt');
      expect(result.isValid).toBe(true);
    });
  });
});