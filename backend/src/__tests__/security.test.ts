import request from 'supertest';
import app from '../index';
import { StatusCodes } from 'http-status-codes';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validateUpload } from '../services/fileValidation';

describe('Security Tests', () => {
  let dbPool: Pool;
  let authToken: string;
  let testUserId: number;

  beforeAll(async () => {
    dbPool = new Pool({
      user: process.env.DB_TEST_USER || 'postgres',
      host: process.env.DB_TEST_HOST || 'localhost',
      database: process.env.DB_TEST_NAME || 'filestorage_test',
      password: process.env.DB_TEST_PASSWORD || 'password',
      port: parseInt(process.env.DB_TEST_PORT || '5432', 10),
    });

    await dbPool.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
    await dbPool.query('TRUNCATE TABLE files RESTART IDENTITY CASCADE');

    const hashedPassword = await bcrypt.hash('SecurePass123!', 12);
    const userResult = await dbPool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      ['secure@example.com', hashedPassword]
    );
    testUserId = userResult.rows[0].id;

    authToken = jwt.sign({ id: testUserId }, process.env.JWT_SECRET || 'test-secret', {
      expiresIn: '15m'
    });
  });

  afterAll(async () => {
    await dbPool.end();
  });

  describe('JWT Security', () => {
    it('should reject expired token', async () => {
      // Create expired token
      const expiredToken = jwt.sign({ id: testUserId }, process.env.JWT_SECRET || 'test-secret', {
        expiresIn: '-1h'
      });

      await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(StatusCodes.UNAUTHORIZED);
    });

    it('should reject invalid token signature', async () => {
      await request(app)
        .get('/api/files')
        .set('Authorization', 'Bearer invalid-token-12345')
        .expect(StatusCodes.UNAUTHORIZED);
    });

    it('should reject token without Bearer prefix', async () => {
      await request(app)
        .get('/api/files')
        .set('Authorization', authToken)
        .expect(StatusCodes.UNAUTHORIZED);
    });
  });

  describe('CORS Security', () => {
    it('should reject requests from unauthorized origins', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://malicious-site.com');

      // Should either reject or not include CORS headers for the malicious origin
      expect(res.headers['access-control-allow-origin']).not.toBe('https://malicious-site.com');
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const res = await request(app).get('/api/health');

      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['x-xss-protection']).toBeDefined();
      expect(res.headers['x-content-type-options']).toBeDefined();
      expect(res.headers['content-security-policy']).toBeDefined();
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should prevent SQL injection in auth', async () => {
      const maliciousPayload = {
        email: "test@example.com'; DROP TABLE users;--",
        password: 'password123'
      };

      await request(app)
        .post('/api/auth/login')
        .send(maliciousPayload)
        .expect(StatusCodes.BAD_REQUEST);

      // Verify users table still exists
      const res = await dbPool.query('SELECT * FROM users LIMIT 1');
      expect(res).toBeDefined();
    });

    it('should sanitize file operations', async () => {
      const maliciousId = "1; DROP TABLE files;--";

      await request(app)
        .get(`/api/files/${maliciousId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(StatusCodes.NOT_FOUND);
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should reject traversal characters in a filename at validation time', async () => {
      const result = await validateUpload('../../etc/passwd', 10, Buffer.from('x'), 'text/plain');
      expect(result.isValid).toBe(false);
    });
  });

  describe('File Upload Security', () => {
    it('should reject double extension attacks', async () => {
      const fileBuffer = Buffer.from('fake image content', 'utf-8');

      await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fileBuffer, 'malware.jpg.exe')
        .expect(StatusCodes.BAD_REQUEST);
    });

    it('should validate MIME type against file extension', async () => {
      const fileBuffer = Buffer.from('<?php system($_GET["cmd"]); ?>', 'utf-8');

      await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fileBuffer, 'malicious.php')
        .expect(StatusCodes.BAD_REQUEST);
    });

    it('should reject filenames containing null bytes at validation time', async () => {
      const result = await validateUpload('evil\u0000name.txt', 10, Buffer.from('x'), 'text/plain');
      expect(result.isValid).toBe(false);
    });
  });

  describe('Authorization Checks', () => {
    it('should enforce ownership on the download endpoint', async () => {
      // Upload a file as the test user
      const fileBuffer = Buffer.from('Private download content', 'utf-8');
      const uploadRes = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fileBuffer, 'private_dl.txt')
        .field('public', 'false');

      const fileId = uploadRes.body.file.id;

      // Second user tries to download it
      const hashedPassword2 = await bcrypt.hash('User2Pass123!', 12);
      const user2Result = await dbPool.query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
        ['user2-download@example.com', hashedPassword2]
      );
      const user2Id = user2Result.rows[0].id;
      const user2Token = jwt.sign({ id: user2Id }, process.env.JWT_SECRET || 'test-secret', {
        expiresIn: '1h'
      });

      await request(app)
        .get(`/api/files/${fileId}/download`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(StatusCodes.NOT_FOUND);
    });

    it('should prevent accessing other user files', async () => {
      // Upload file as test user
      const fileBuffer = Buffer.from('Private file content', 'utf-8');
      const uploadRes = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fileBuffer, 'private.txt')
        .field('public', 'false');

      const fileId = uploadRes.body.file.id;

      // Create another user
      const hashedPassword2 = await bcrypt.hash('User2Pass123!', 12);
      const user2Result = await dbPool.query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
        ['user2@example.com', hashedPassword2]
      );
      const user2Id = user2Result.rows[0].id;
      const user2Token = jwt.sign({ id: user2Id }, process.env.JWT_SECRET || 'test-secret', {
        expiresIn: '1h'
      });

      // User 2 tries to access user 1's file
      await request(app)
        .get(`/api/files/${fileId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(StatusCodes.NOT_FOUND);
    });

    it('should allow user to access own files', async () => {
      const filesRes = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(StatusCodes.OK);

      expect(filesRes.body.files).toBeDefined();
    });
  });
});