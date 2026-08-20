import request from 'supertest';
import app from '../index';
import { StatusCodes } from 'http-status-codes';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

describe('File Controller', () => {
  let dbPool: Pool;
  let testUserId: number;
  let authToken: string;

  beforeAll(async () => {
    // Use test database or mock
    dbPool = new Pool({
      user: process.env.DB_TEST_USER || 'postgres',
      host: process.env.DB_TEST_HOST || 'localhost',
      database: process.env.DB_TEST_NAME || 'filestorage_test',
      password: process.env.DB_TEST_PASSWORD || 'password',
      port: parseInt(process.env.DB_TEST_PORT || '5432', 10),
    });

    // Clear test tables
    await dbPool.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
    await dbPool.query('TRUNCATE TABLE files RESTART IDENTITY CASCADE');

    // Create test user
    const hashedPassword = await bcrypt.hash('TestPass123!', 12);
    const userResult = await dbPool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      ['testuser@example.com', hashedPassword]
    );
    testUserId = userResult.rows[0].id;

    // Generate JWT token for authenticated requests
    authToken = jwt.sign({ id: testUserId }, process.env.JWT_SECRET || 'test-secret', {
      expiresIn: '1h'
    });
  });

  afterAll(async () => {
    await dbPool.end();
  });

  describe('POST /api/files/upload', () => {
    it('should upload a valid file', async () => {
      // Create a mock file buffer
      const fileBuffer = Buffer.from('Test file content for upload validation', 'utf-8');

      const res = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fileBuffer, 'test.txt')
        .field('public', 'false')
        .expect(StatusCodes.CREATED);

      expect(res.body).toHaveProperty('file');
      expect(res.body.file).toHaveProperty('original_filename', 'test.txt');
      expect(res.body.file).toHaveProperty('is_public', false);
    });

    it('should reject file over max size', async () => {
      // Under test, MAX_FILE_SIZE is 1KB; upload something comfortably over it.
      const largeBuffer = Buffer.alloc(2 * 1024 * 1024); // 2MB

      const res = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', largeBuffer, 'large.pdf')
        .field('public', 'false')
        .expect(StatusCodes.BAD_REQUEST);

      expect(res.body.message).toContain('File size exceeds');
    });

    it('should reject invalid file type', async () => {
      const fileBuffer = Buffer.from('Executable content', 'utf-8');

      const res = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fileBuffer, 'malicious.exe')
        .field('public', 'false')
        .expect(StatusCodes.BAD_REQUEST);

      expect(res.body.message).toContain('Invalid file type');
    });

    it('should reject unauthenticated request', async () => {
      const fileBuffer = Buffer.from('Test content', 'utf-8');

      await request(app)
        .post('/api/files/upload')
        .attach('file', fileBuffer, 'test.txt')
        .field('public', 'false')
        .expect(StatusCodes.UNAUTHORIZED);
    });
  });

  describe('GET /api/files', () => {
    it('should list files for authenticated user', async () => {
      const res = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(StatusCodes.OK);

      expect(Array.isArray(res.body.files)).toBe(true);
      expect(res.body.files.length).toBeGreaterThanOrEqual(0);
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/files?page=1&limit=5')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(StatusCodes.OK);

      expect(Array.isArray(res.body.files)).toBe(true);
      expect(res.body.pagination).toMatchObject({
        page: 1,
        limit: 5,
        total: expect.any(Number),
        totalPages: expect.any(Number),
      });
    });

    it('should reject unauthenticated request', async () => {
      await request(app)
        .get('/api/files')
        .expect(StatusCodes.UNAUTHORIZED);
    });
  });

  describe('PUT /api/files/:id/toggle-public', () => {
    let fileId: number;

    beforeEach(async () => {
      // Upload a test file
      const fileBuffer = Buffer.from('Test file for sharing', 'utf-8');
      const uploadRes = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fileBuffer, 'share_test.txt')
        .field('public', 'false');

      fileId = uploadRes.body.file.id;
    });

    it('should toggle file to public', async () => {
      const res = await request(app)
        .put(`/api/files/${fileId}/toggle-public`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ is_public: true })
        .expect(StatusCodes.OK);

      expect(res.body.file).toHaveProperty('is_public', true);
    });

    it('should not allow toggling another user\'s file', async () => {
      // Create second user
      const hashedPassword2 = await bcrypt.hash('User2Pass123!', 12);
      const user2Result = await dbPool.query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
        ['user2-toggle@example.com', hashedPassword2]
      );
      const user2Id = user2Result.rows[0].id;
      const user2Token = jwt.sign({ id: user2Id }, process.env.JWT_SECRET || 'test-secret', {
        expiresIn: '1h'
      });

      const res = await request(app)
        .put(`/api/files/${fileId}/toggle-public`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ is_public: true })
        .expect(StatusCodes.NOT_FOUND); // File not found for this user
    });

    it('should reject invalid file ID', async () => {
      await request(app)
        .put(`/api/files/99999/toggle-public`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ is_public: true })
        .expect(StatusCodes.NOT_FOUND);
    });
  });

  describe('DELETE /api/files/:id', () => {
    it('should delete file', async () => {
      // Upload a test file
      const fileBuffer = Buffer.from('Test file to delete', 'utf-8');
      const uploadRes = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fileBuffer, 'delete_test.txt')
        .field('public', 'false');

      const fileId = uploadRes.body.file.id;

      const res = await request(app)
        .delete(`/api/files/${fileId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(StatusCodes.OK);

      expect(res.body.message).toContain('deleted permanently');
    });

    it('should not delete another user\'s file', async () => {
      // Upload file as first user
      const fileBuffer = Buffer.from('Another user file', 'utf-8');
      const uploadRes = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fileBuffer, 'other_user.txt')
        .field('public', 'false');

      const fileId = uploadRes.body.file.id;

      // Create second user
      const hashedPassword2 = await bcrypt.hash('User2Pass123!', 12);
      const user2Result = await dbPool.query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
        ['user2-delete@example.com', hashedPassword2]
      );
      const user2Id = user2Result.rows[0].id;
      const user2Token = jwt.sign({ id: user2Id }, process.env.JWT_SECRET || 'test-secret', {
        expiresIn: '1h'
      });

      const res = await request(app)
        .delete(`/api/files/${fileId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(StatusCodes.NOT_FOUND);
    });
  });

  describe('GET /api/files/public/:token', () => {
    it('should serve public file via share token', async () => {
      // Upload and make public
      const fileBuffer = Buffer.from('Public file content', 'utf-8');
      const uploadRes = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fileBuffer, 'public_share.txt')
        .field('public', 'false');

      const fileId = uploadRes.body.file.id;

      // Make file public
      await request(app)
        .put(`/api/files/${fileId}/toggle-public`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ is_public: true });

      // Generate a share token (auth + ownership required)
      const shareRes = await request(app)
        .post(`/api/files/${fileId}/share`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(StatusCodes.OK);

      const shareToken = shareRes.body.share_token;

      // Access public file without auth
      const res = await request(app)
        .get(`/api/files/public/${shareToken}`)
        .expect(StatusCodes.OK);

      // Should return file content streamed from (mocked) S3
      expect(res.text).toBe('Public file content');
    });

    it('should reject expired share token', async () => {
      // This would require mocking time or setting short expiration
      // For now we'll test invalid token
      await request(app)
        .get('/api/files/public/invalid-token-12345')
        .expect(StatusCodes.NOT_FOUND);
    });

    it('should return public file metadata without auth', async () => {
      // Upload, make public and share (reuse the flow above for a fresh file).
      const fileBuffer = Buffer.from('Public info content', 'utf-8');
      const uploadRes = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fileBuffer, 'info_share.txt')
        .field('public', 'false');

      const fileId = uploadRes.body.file.id;
      await request(app)
        .put(`/api/files/${fileId}/toggle-public`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ is_public: true });

      const shareRes = await request(app)
        .post(`/api/files/${fileId}/share`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(StatusCodes.OK);

      const res = await request(app)
        .get(`/api/files/public/${shareRes.body.share_token}/info`)
        .expect(StatusCodes.OK);

      expect(res.body.file).toMatchObject({
        original_filename: 'info_share.txt',
      });
      expect(res.body.file).not.toHaveProperty('s3_key');
      expect(res.body.file).not.toHaveProperty('user_id');
    });

    it('should return 404 for info of an invalid share token', async () => {
      await request(app)
        .get('/api/files/public/nope-123/info')
        .expect(StatusCodes.NOT_FOUND);
    });
  });
});