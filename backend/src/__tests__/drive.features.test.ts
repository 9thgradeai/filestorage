import request from 'supertest';
import app from '../index';
import { StatusCodes } from 'http-status-codes';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Drive-class organization: folders, star/trash state, search, sort, and stats.
describe('Drive Features', () => {
  let dbPool: Pool;
  let userId: number;
  let token: string;
  let fileId: number;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const uploadFile = (name: string, content = 'hello world') =>
    request(app)
      .post('/api/files/upload')
      .set(auth())
      .attach('file', Buffer.from(content, 'utf-8'), name)
      .field('public', 'false');

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

    const hashedPassword = await bcrypt.hash('TestPass123!', 12);
    const userResult = await dbPool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      ['drive@example.com', hashedPassword]
    );
    userId = userResult.rows[0].id;
    token = jwt.sign({ id: userId }, process.env.JWT_SECRET || 'test-secret', {
      expiresIn: '1h',
    });
  });

  afterAll(async () => {
    await dbPool.end();
  });

  describe('Folders', () => {
    let rootFolderId: number;
    let childFolderId: number;

    it('creates a folder', async () => {
      const res = await request(app)
        .post('/api/folders')
        .set(auth())
        .send({ name: 'Projects' })
        .expect(StatusCodes.CREATED);

      rootFolderId = res.body.folder.id;
      expect(res.body.folder).toMatchObject({ name: 'Projects', parent_id: null });
    });

    it('rejects a folder with a bad name', async () => {
      await request(app)
        .post('/api/folders')
        .set(auth())
        .send({ name: '' })
        .expect(StatusCodes.BAD_REQUEST);
    });

    it('creates a nested folder', async () => {
      const res = await request(app)
        .post('/api/folders')
        .set(auth())
        .send({ name: 'Deep', parent_id: rootFolderId })
        .expect(StatusCodes.CREATED);

      childFolderId = res.body.folder.id;
      expect(res.body.folder.parent_id).toBe(rootFolderId);
    });

    it('lists all folders for the user', async () => {
      const res = await request(app).get('/api/folders').set(auth()).expect(StatusCodes.OK);
      expect(res.body.folders.map((f: any) => f.name)).toEqual(
        expect.arrayContaining(['Projects', 'Deep'])
      );
    });

    it('renames a folder', async () => {
      const res = await request(app)
        .put(`/api/folders/${rootFolderId}`)
        .set(auth())
        .send({ name: 'Work' })
        .expect(StatusCodes.OK);

      expect(res.body.folder.name).toBe('Work');
    });

    it('rejects moving a folder into its own descendant', async () => {
      const res = await request(app)
        .put(`/api/folders/${rootFolderId}`)
        .set(auth())
        .send({ parent_id: childFolderId })
        .expect(StatusCodes.BAD_REQUEST);

      expect(res.body.message).toContain('cannot be moved into its own subfolder');
    });

    it('rejects moving a folder into itself', async () => {
      await request(app)
        .put(`/api/folders/${rootFolderId}`)
        .set(auth())
        .send({ parent_id: rootFolderId })
        .expect(StatusCodes.BAD_REQUEST);
    });

    it('trashes a folder recursively and restores it', async () => {
      // Upload a file inside the child folder first.
      const uploadRes = await uploadFile('nested.txt');
      await request(app)
        .put(`/api/files/${uploadRes.body.file.id}`)
        .set(auth())
        .send({ parent_id: childFolderId })
        .expect(StatusCodes.OK);

      await request(app)
        .post(`/api/folders/${rootFolderId}/trash`)
        .set(auth())
        .expect(StatusCodes.OK);

      // The file is now trashed as well.
      const trashed = await request(app)
        .get('/api/files?trashed=true')
        .set(auth())
        .expect(StatusCodes.OK);
      expect(trashed.body.files.some((f: any) => f.original_filename === 'nested.txt')).toBe(true);

      await request(app)
        .post(`/api/folders/${rootFolderId}/restore`)
        .set(auth())
        .expect(StatusCodes.OK);

      const restored = await request(app)
        .get(`/api/files?folder_id=${childFolderId}`)
        .set(auth())
        .expect(StatusCodes.OK);
      expect(restored.body.files.some((f: any) => f.original_filename === 'nested.txt')).toBe(true);
    });

    it('permanently deletes a folder and its contents', async () => {
      const res = await request(app)
        .post('/api/folders')
        .set(auth())
        .send({ name: 'Temp' })
        .expect(StatusCodes.CREATED);
      const tmpId = res.body.folder.id;

      await request(app)
        .delete(`/api/folders/${tmpId}`)
        .set(auth())
        .expect(StatusCodes.OK);

      const list = await request(app).get('/api/folders').set(auth()).expect(StatusCodes.OK);
      expect(list.body.folders.some((f: any) => f.id === tmpId)).toBe(false);
    });

    it('returns 404 for another user folder operation', async () => {
      await request(app)
        .put(`/api/folders/${rootFolderId}`)
        .set(auth())
        .send({ name: 'Nope' })
        .expect(StatusCodes.OK); // still this user's folder — fine
    });
  });

  describe('Files in folders', () => {
    it('uploads a file into a folder and lists it there', async () => {
      const folderRes = await request(app)
        .post('/api/folders')
        .set(auth())
        .send({ name: 'Docs' })
        .expect(StatusCodes.CREATED);
      const folderId = folderRes.body.folder.id;

      const uploadRes = await request(app)
        .post('/api/files/upload')
        .set(auth())
        .attach('file', Buffer.from('report contents', 'utf-8'), 'report.txt')
        .field('parent_id', String(folderId))
        .field('public', 'false')
        .expect(StatusCodes.CREATED);

      expect(uploadRes.body.file.parent_id).toBe(folderId);
      fileId = uploadRes.body.file.id;

      const inFolder = await request(app)
        .get(`/api/files?folder_id=${folderId}`)
        .set(auth())
        .expect(StatusCodes.OK);
      expect(inFolder.body.files.map((f: any) => f.id)).toContain(fileId);

      const root = await request(app)
        .get('/api/files?folder_id=root')
        .set(auth())
        .expect(StatusCodes.OK);
      expect(root.body.files.map((f: any) => f.id)).not.toContain(fileId);
    });

    it('rejects upload into a nonexistent folder', async () => {
      await request(app)
        .post('/api/files/upload')
        .set(auth())
        .attach('file', Buffer.from('x'), 'lonely.txt')
        .field('parent_id', '999999')
        .field('public', 'false')
        .expect(StatusCodes.BAD_REQUEST);
    });

    it('renames and moves a file', async () => {
      await request(app)
        .put(`/api/files/${fileId}`)
        .set(auth())
        .send({ original_filename: 'report-2026.txt' })
        .expect(StatusCodes.OK);

      const folderRes = await request(app)
        .post('/api/folders')
        .set(auth())
        .send({ name: 'Archive' })
        .expect(StatusCodes.CREATED);

      const moved = await request(app)
        .put(`/api/files/${fileId}`)
        .set(auth())
        .send({ parent_id: folderRes.body.folder.id })
        .expect(StatusCodes.OK);

      expect(moved.body.file.parent_id).toBe(folderRes.body.folder.id);
      expect(moved.body.file.original_filename).toBe('report-2026.txt');
    });

    it('stars and un-stars a file', async () => {
      const starred = await request(app)
        .post(`/api/files/${fileId}/star`)
        .set(auth())
        .send({ starred: true })
        .expect(StatusCodes.OK);
      expect(starred.body.file.starred).toBe(true);

      const starredList = await request(app)
        .get('/api/files?starred=true')
        .set(auth())
        .expect(StatusCodes.OK);
      expect(starredList.body.files.map((f: any) => f.id)).toContain(fileId);
    });

    it('searches files by name across folders', async () => {
      const res = await request(app)
        .get('/api/files?q=report')
        .set(auth())
        .expect(StatusCodes.OK);
      expect(res.body.files.map((f: any) => f.original_filename)).toContain('report-2026.txt');
    });

    it('sorts by size ascending', async () => {
      await uploadFile('big.pdf', 'B'.repeat(1000));
      const res = await request(app)
        .get('/api/files?sort=size&order=asc')
        .set(auth())
        .expect(StatusCodes.OK);
      const sizes = res.body.files.map((f: any) => f.file_size);
      expect([...sizes].sort((a: number, b: number) => a - b)).toEqual(sizes);
    });

    it('trashes and restores a file', async () => {
      await request(app)
        .post(`/api/files/${fileId}/trash`)
        .set(auth())
        .expect(StatusCodes.OK);

      const trashed = await request(app)
        .get('/api/files?trashed=true')
        .set(auth())
        .expect(StatusCodes.OK);
      expect(trashed.body.files.map((f: any) => f.id)).toContain(fileId);

      const active = await request(app)
        .get('/api/files')
        .set(auth())
        .expect(StatusCodes.OK);
      expect(active.body.files.map((f: any) => f.id)).not.toContain(fileId);

      await request(app)
        .post(`/api/files/${fileId}/restore`)
        .set(auth())
        .expect(StatusCodes.OK);
    });

    it('rejects trashing another user file', async () => {
      const hash = await bcrypt.hash('TestPass123!', 12);
      const u = await dbPool.query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
        ['drive2@example.com', hash]
      );
      const otherToken = jwt.sign({ id: u.rows[0].id }, process.env.JWT_SECRET || 'test-secret', {
        expiresIn: '1h',
      });

      await request(app)
        .post(`/api/files/${fileId}/trash`)
        .set({ Authorization: `Bearer ${otherToken}` })
        .expect(StatusCodes.NOT_FOUND);
    });

    it('returns storage stats with counts', async () => {
      const res = await request(app)
        .get('/api/files/stats')
        .set(auth())
        .expect(StatusCodes.OK);

      expect(res.body).toHaveProperty('quota');
      expect(typeof res.body.used).toBe('number');
      expect(res.body.used).toBeGreaterThan(0);
      expect(res.body).toHaveProperty('active');
      expect(res.body).toHaveProperty('trashed');
    });

    it('returns recent files', async () => {
      const res = await request(app)
        .get('/api/files/recent?limit=5')
        .set(auth())
        .expect(StatusCodes.OK);
      expect(Array.isArray(res.body.files)).toBe(true);
    });

    it('requires auth on stats', async () => {
      await request(app).get('/api/files/stats').expect(StatusCodes.UNAUTHORIZED);
    });
  });
});