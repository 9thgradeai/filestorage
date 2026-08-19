import request from 'supertest';
import app from '../index';
import { StatusCodes } from 'http-status-codes';
import { Pool } from 'pg';

type Cookies = Record<string, string>;

function cookiesFrom(res: request.Response): Cookies {
  const out: Cookies = {};
  const raw = (res.headers['set-cookie'] || []) as string[];
  for (const c of raw) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    if (idx > -1) out[pair.slice(0, idx).trim()] = pair.slice(idx + 1);
  }
  return out;
}

function cookieHeader(cookies: Cookies): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

describe('Auth Controller', () => {
  let dbPool: Pool;

  beforeAll(async () => {
    dbPool = new Pool({
      user: process.env.DB_TEST_USER || 'postgres',
      host: process.env.DB_TEST_HOST || 'localhost',
      database: process.env.DB_TEST_NAME || 'filestorage_test',
      password: process.env.DB_TEST_PASSWORD || 'password',
      port: parseInt(process.env.DB_TEST_PORT || '5432', 10),
    });

    await dbPool.query('TRUNCATE TABLE refresh_tokens, users RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await dbPool.end();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user and issue HttpOnly cookies', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'SecurePass123!' })
        .expect(StatusCodes.CREATED);

      expect(res.body.user).toHaveProperty('email', 'test@example.com');
      expect(res.body).toHaveProperty('csrf_token');

      const cookies = cookiesFrom(res);
      expect(cookies.token).toBeDefined();
      expect(cookies.refreshToken).toBeDefined();
      const tokenCookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith('token=')
      );
      expect(tokenCookie).toContain('HttpOnly');
    });

    it('should not register duplicate email', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'SecurePass123!' })
        .expect(StatusCodes.CONFLICT);
    });

    it('should reject invalid email', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'invalid-email', password: 'SecurePass123!' })
        .expect(StatusCodes.BAD_REQUEST);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials and issue cookies', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'SecurePass123!' })
        .expect(StatusCodes.OK);

      expect(res.body.user).toHaveProperty('email', 'test@example.com');
      expect(res.body).toHaveProperty('csrf_token');
      expect(cookiesFrom(res).token).toBeDefined();
    });

    it('should reject invalid credentials', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'WrongPassword' })
        .expect(StatusCodes.BAD_REQUEST);
    });

    it('should reject non-existent user', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'SecurePass123!' })
        .expect(StatusCodes.BAD_REQUEST);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should rotate the refresh token and reissue cookies', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'SecurePass123!' });
      const firstCookies = cookiesFrom(loginRes);

      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookieHeader({ refreshToken: firstCookies.refreshToken }))
        .expect(StatusCodes.OK);

      const secondCookies = cookiesFrom(refreshRes);
      expect(secondCookies.token).toBeDefined();
      expect(secondCookies.refreshToken).toBeDefined();
      expect(secondCookies.refreshToken).not.toBe(firstCookies.refreshToken);

      // The old token must now be dead (rotation prevents replay).
      await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookieHeader({ refreshToken: firstCookies.refreshToken }))
        .expect(StatusCodes.UNAUTHORIZED);
    });

    it('should reject a missing refresh token', async () => {
      await request(app).post('/api/auth/refresh').expect(StatusCodes.UNAUTHORIZED);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should log out and revoke the refresh token', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'SecurePass123!' });
      const cookies = cookiesFrom(loginRes);

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookieHeader(cookies))
        .set('X-CSRF-Token', cookies.csrf_token)
        .expect(StatusCodes.OK);

      expect(logoutRes.body.message).toContain('Logged out');

      // Refresh token was revoked server-side.
      await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookieHeader({ refreshToken: cookies.refreshToken }))
        .expect(StatusCodes.UNAUTHORIZED);
    });

    it('should reject logout without a valid CSRF token', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'SecurePass123!' });
      const cookies = cookiesFrom(loginRes);

      await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookieHeader(cookies))
        .expect(StatusCodes.FORBIDDEN);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return the current user from the access token cookie', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'SecurePass123!' });
      const cookies = cookiesFrom(loginRes);

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookieHeader({ token: cookies.token }))
        .expect(StatusCodes.OK);

      expect(meRes.body.user.email).toBe('test@example.com');
    });

    it('should reject unauthenticated requests', async () => {
      await request(app).get('/api/auth/me').expect(StatusCodes.UNAUTHORIZED);
    });
  });
});