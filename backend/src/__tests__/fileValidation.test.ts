import { Readable } from 'stream';
import {
  validateUpload,
  validateFileContent,
  validateStream,
  isAllowedExtension,
  MAX_FILE_SIZE,
} from '../services/fileValidation';

const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const MP4_HEADER = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]), // ftyp box
  Buffer.from('mp42', 'utf-8'),
  Buffer.alloc(200),
]);
const TEXT = Buffer.from('hello world', 'utf-8');

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

    it('accepts every media type: video, audio, design, data, code', async () => {
      const cases: [string, string][] = [
        ['movie.mp4', 'video/mp4'],
        ['song.flac', 'audio/flac'],
        ['clip.mov', 'video/quicktime'],
        ['design.sketch', 'application/octet-stream'],
        ['photo.heic', 'image/heic'],
        ['notes.md', 'text/markdown'],
        ['data.json', 'application/json'],
        ['app.py', 'text/x-python'],
        ['archive.7z', 'application/x-7z-compressed'],
        ['disk.iso', 'application/octet-stream'],
        ['font.ttf', 'font/ttf'],
        ['vector.svg', 'image/svg+xml'],
        ['noext', 'application/octet-stream'],
      ];
      for (const [name, mime] of cases) {
        const result = await validateUpload(name, 1024, TEXT, mime);
        expect(result.isValid).toBe(true);
      }
    });

    it('still rejects executables and server scripts by extension', async () => {
      for (const bad of ['virus.exe', 'trojan.bat', 'shell.php', 'backdoor.jsp', 'macro.msi']) {
        const result = await validateUpload(bad, 10, TEXT, 'application/octet-stream');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('not allowed');
      }
    });

    it('accepts mp4 magic bytes even when named .txt (detection refines, never rejects)', async () => {
      const result = await validateUpload('note.txt', 1024, MP4_HEADER, 'text/plain');
      expect(result.isValid).toBe(true);
      // Declared type kept when specific.
      expect(result.resolvedMime).toBe('text/plain');
    });

    it('refines generic octet-stream declarations using detected type', async () => {
      const result = await validateUpload('photo.bin', 1024, PNG_HEADER, 'application/octet-stream');
      expect(result.isValid).toBe(true);
      expect(result.resolvedMime).toBe('image/png');
    });

    it('keeps declared type over detection when declared is specific (docx ≡ zip)', async () => {
      const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
      const result = await validateUpload('report.docx', 1024, zipMagic, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(result.isValid).toBe(true);
      expect(result.resolvedMime).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    it('falls back to application/octet-stream when nothing is detectable', async () => {
      const result = await validateUpload('mystery', 10, TEXT, '');
      expect(result.isValid).toBe(true);
      expect(result.resolvedMime).toBe('application/octet-stream');
    });

    it('accepts a valid matching upload', async () => {
      const result = await validateUpload('photo.png', 1024, PNG_HEADER, 'image/png');
      expect(result.isValid).toBe(true);
      expect(result.resolvedMime).toBe('image/png');
    });
  });

  describe('isAllowedExtension', () => {
    it('allows common and unknown extensions', () => {
      expect(isAllowedExtension('report.pdf')).toBe(true);
      expect(isAllowedExtension('IMG_001.JPG')).toBe(true);
      expect(isAllowedExtension('movie.mp4')).toBe(true);
      expect(isAllowedExtension('noext')).toBe(true);
    });

    it('blocks executables and server scripts', () => {
      expect(isAllowedExtension('virus.exe')).toBe(false);
      expect(isAllowedExtension('shell.php')).toBe(false);
    });
  });

  describe('validateStream', () => {
    it('accepts any stream (size/filename checks run before streaming)', async () => {
      const result = await validateStream(Readable.from([TEXT]), 'note.txt');
      expect(result.isValid).toBe(true);
    });
  });
});
