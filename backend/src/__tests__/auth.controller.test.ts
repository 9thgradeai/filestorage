import request from 'supertest';
import app from '../index';
import { StatusCodes } from 'http-status-codes';
import { Pool } from 'pg';
import { getLastSentCode } from '../services/email.service';

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

const validUser = () => ({
  name: 'Test User',
  email: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
  password: 'SecurePass123!',
});

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

    await dbPool.query(
      'TRUNCATE TABLE email_otps, refresh_tokens, users RESTART IDENTITY CASCADE'
    );
  });

  afterAll(async () => {
    await dbPool.end();
  });

  describe('POST /api/auth/register', () => {
    it('should create an unverified account and email an OTP (no auto-login)', async () => {
      const u = validUser();
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...u, confirmPassword: u.password })
        .expect(StatusCodes.CREATED);

      expect(res.body.message).toContain('verification code');
      expect(res.body.email).toBe(u.email);
      expect(res.headers['set-cookie']).toBeUndefined();

      const code = getLastSentCode(u.email, 'email_verification');
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should not register a duplicate email', async () => {
      const u = validUser();
      await request(app)
        .post('/api/auth/register')
        .send({ ...u, confirmPassword: u.password })
        .expect(StatusCodes.CREATED);

      await request(app)
        .post('/api/auth/register')
        .send({ ...u, confirmPassword: u.password })
        .expect(StatusCodes.CONFLICT);
    });

    it('should reject an invalid email', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test User', email: 'invalid-email', password: 'SecurePass123!', confirmPassword: 'SecurePass123!' })
        .expect(StatusCodes.BAD_REQUEST);
    });

    it('should reject a missing name', async () => {
      const u = validUser();
      await request(app)
        .post('/api/auth/register')
        .send({ email: u.email, password: u.password, confirmPassword: u.password })
        .expect(StatusCodes.BAD_REQUEST);
    });

    it('should reject a mismatched confirmPassword', async () => {
      const u = validUser();
      await request(app)
        .post('/api/auth/register')
        .send({ ...u, confirmPassword: 'DifferentPass123!' })
        .expect(StatusCodes.BAD_REQUEST);
    });
  });

  describe('POST /api/auth/verify-email', () => {
    it('should verify the email with the emailed OTP and sign the user in', async () => {
      const u = validUser();
      await request(app)
        .post('/api/auth/register')
        .send({ ...u, confirmPassword: u.password })
        .expect(StatusCodes.CREATED);

      const code = getLastSentCode(u.email, 'email_verification')!;
      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({ email: u.email, otp: code })
        .expect(StatusCodes.OK);

      expect(res.body.user.email).toBe(u.email);
      expect(res.body.user.name).toBe(u.name);
      expect(res.body.user.email_verified).toBe(true);
      expect(res.body).toHaveProperty('csrf_token');

      const cookies = cookiesFrom(res);
      expect(cookies.token).toBeDefined();
      expect(cookies.refreshToken).toBeDefined();

      // The access token cookie must actually authenticate now.
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookieHeader({ token: cookies.token }))
        .expect(StatusCodes.OK);
      expect(meRes.body.user.email).toBe(u.email);
    });

    it('should reject a wrong OTP', async () => {
      const u = validUser();
      await request(app)
        .post('/api/auth/register')
        .send({ ...u, confirmPassword: u.password })
        .expect(StatusCodes.CREATED);

      await request(app)
        .post('/api/auth/verify-email')
        .send({ email: u.email, otp: '000000' })
        .expect(StatusCodes.BAD_REQUEST);
    });

    it('should reject a malformed OTP', async () => {
      const u = validUser();
      await request(app)
        .post('/api/auth/verify-email')
        .send({ email: u.email, otp: 'abc' })
        .expect(StatusCodes.BAD_REQUEST);
    });

    it('should burn the code after too many failed attempts', async () => {
      const u = validUser();
      await request(app)
        .post('/api/auth/register')
        .send({ ...u, confirmPassword: u.password })
        .expect(StatusCodes.CREATED);
      const code = getLastSentCode(u.email, 'email_verification')!;

      // Exceed OTP_MAX_ATTEMPTS (default 5) with wrong guesses.
      for (let i = 0; i < 6; i++) {
        await request(app)
          .post('/api/auth/verify-email')
          .send({ email: u.email, otp: '000000' })
          .expect(StatusCodes.BAD_REQUEST);
      }

      // The real code must no longer work.
      await request(app)
        .post('/api/auth/verify-email')
        .send({ email: u.email, otp: code })
        .expect(StatusCodes.BAD_REQUEST);
    });
  });

  describe('POST /api/auth/resend-otp', () => {
    it('should resend a fresh code and invalidate the previous one', async () => {
      const u = validUser();
      await request(app)
        .post('/api/auth/register')
        .send({ ...u, confirmPassword: u.password })
        .expect(StatusCodes.CREATED);

      const first = getLastSentCode(u.email, 'email_verification')!;
      await request(app)
        .post('/api/auth/resend-otp')
        .send({ email: u.email, purpose: 'email_verification' })
        .expect(StatusCodes.OK);

      const second = getLastSentCode(u.email, 'email_verification')!;
      expect(second).toMatch(/^\d{6}$/);

      await request(app)
        .post('/api/auth/verify-email')
        .send({ email: u.email, otp: first })
        .expect(StatusCodes.BAD_REQUEST);

      await request(app)
        .post('/api/auth/verify-email')
        .send({ email: u.email, otp: second })
        .expect(StatusCodes.OK);
    });

    it('should enforce a resend cooldown', async () => {
      const previous = process.env.OTP_RESEND_COOLDOWN_SECONDS;
      process.env.OTP_RESEND_COOLDOWN_SECONDS = '60';
      try {
        const u = validUser();
        await request(app)
          .post('/api/auth/register')
          .send({ ...u, confirmPassword: u.password })
          .expect(StatusCodes.CREATED);

        // Within the 60s window of the registration email → blocked.
        await request(app)
          .post('/api/auth/resend-otp')
          .send({ email: u.email, purpose: 'email_verification' })
          .expect(StatusCodes.TOO_MANY_REQUESTS);
      } finally {
        process.env.OTP_RESEND_COOLDOWN_SECONDS = previous;
      }
    });
  });

  describe('POST /api/auth/login', () => {
    it('should reject login for an unverified account', async () => {
      const u = validUser();
      await request(app)
        .post('/api/auth/register')
        .send({ ...u, confirmPassword: u.password })
        .expect(StatusCodes.CREATED);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: u.email, password: u.password })
        .expect(StatusCodes.FORBIDDEN);

      expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('should login a verified account and issue cookies', async () => {
      const u = validUser();
      await request(app)
        .post('/api/auth/register')
        .send({ ...u, confirmPassword: u.password })
        .expect(StatusCodes.CREATED);
      const code = getLastSentCode(u.email, 'email_verification')!;
      await request(app)
        .post('/api/auth/verify-email')
        .send({ email: u.email, otp: code })
        .expect(StatusCodes.OK);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: u.email, password: u.password })
        .expect(StatusCodes.OK);

      expect(res.body.user).toHaveProperty('email', u.email);
      expect(res.body.user).toHaveProperty('name', u.name);
      expect(res.body).toHaveProperty('csrf_token');
      expect(cookiesFrom(res).token).toBeDefined();
    });

    it('should reject invalid credentials', async () => {
      const u = validUser();
      await request(app)
        .post('/api/auth/register')
        .send({ ...u, confirmPassword: u.password })
        .expect(StatusCodes.CREATED);
      const code = getLastSentCode(u.email, 'email_verification')!;
      await request(app)
        .post('/api/auth/verify-email')
        .send({ email: u.email, otp: code })
        .expect(StatusCodes.OK);

      await request(app)
        .post('/api/auth/login')
        .send({ email: u.email, password: 'WrongPassword123!' })
        .expect(StatusCodes.BAD_REQUEST);
    });

    it('should reject a non-existent user', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'SecurePass123!' })
        .expect(StatusCodes.BAD_REQUEST);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should send a reset code for a verified account', async () => {
      const u = validUser();
      await request(app)
        .post('/api/auth/register')
        .send({ ...u, confirmPassword: u.password })
        .expect(StatusCodes.CREATED);
      const vcode = getLastSentCode(u.email, 'email_verification')!;
      await request(app)
        .post('/api/auth/verify-email')
        .send({ email: u.email, otp: vcode })
        .expect(StatusCodes.OK);

      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: u.email })
        .expect(StatusCodes.OK);

      const resetCode = getLastSentCode(u.email, 'password_reset');
      expect(resetCode).toMatch(/^\d{6}$/);
    });

    it('should not reveal whether an email is registered', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@example.com' })
        .expect(StatusCodes.OK);
      expect(res.body.message).toContain('If an account exists');
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('should reset the password after OTP verification and revoke sessions', async () => {
      const u = validUser();
      await request(app)
        .post('/api/auth/register')
        .send({ ...u, confirmPassword: u.password })
        .expect(StatusCodes.CREATED);
      const vcode = getLastSentCode(u.email, 'email_verification')!;
      const verifyRes = await request(app)
        .post('/api/auth/verify-email')
        .send({ email: u.email, otp: vcode })
        .expect(StatusCodes.OK);
      const oldCookies = cookiesFrom(verifyRes);

      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: u.email })
        .expect(StatusCodes.OK);
      const resetCode = getLastSentCode(u.email, 'password_reset')!;

      const newPassword = 'NewSecurePass456!';
      await request(app)
        .post('/api/auth/reset-password')
        .send({ email: u.email, otp: resetCode, password: newPassword, confirmPassword: newPassword })
        .expect(StatusCodes.OK);

      // Old session is dead after the reset.
      await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookieHeader({ refreshToken: oldCookies.refreshToken }))
        .expect(StatusCodes.UNAUTHORIZED);

      // Old password no longer works; the new one does.
      await request(app)
        .post('/api/auth/login')
        .send({ email: u.email, password: u.password })
        .expect(StatusCodes.BAD_REQUEST);

      await request(app)
        .post('/api/auth/login')
        .send({ email: u.email, password: newPassword })
        .expect(StatusCodes.OK);
    });

    it('should reject a wrong reset code', async () => {
      const u = validUser();
      await request(app)
        .post('/api/auth/register')
        .send({ ...u, confirmPassword: u.password })
        .expect(StatusCodes.CREATED);
      const vcode = getLastSentCode(u.email, 'email_verification')!;
      await request(app)
        .post('/api/auth/verify-email')
        .send({ email: u.email, otp: vcode })
        .expect(StatusCodes.OK);
      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: u.email })
        .expect(StatusCodes.OK);

      await request(app)
        .post('/api/auth/reset-password')
        .send({ email: u.email, otp: '000000', password: 'NewSecurePass456!', confirmPassword: 'NewSecurePass456!' })
        .expect(StatusCodes.BAD_REQUEST);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should rotate the refresh token and reissue cookies', async () => {
      const u = validUser();
      await request(app)
        .post('/api/auth/register')
        .send({ ...u, confirmPassword: u.password })
        .expect(StatusCodes.CREATED);
      const code = getLastSentCode(u.email, 'email_verification')!;
      await request(app)
        .post('/api/auth/verify-email')
        .send({ email: u.email, otp: code })
        .expect(StatusCodes.OK);

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: u.email, password: u.password });
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
      const u = validUser();
      await request(app)
        .post('/api/auth/register')
        .send({ ...u, confirmPassword: u.password })
        .expect(StatusCodes.CREATED);
      const code = getLastSentCode(u.email, 'email_verification')!;
      await request(app)
        .post('/api/auth/verify-email')
        .send({ email: u.email, otp: code })
        .expect(StatusCodes.OK);

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: u.email, password: u.password });
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
      const u = validUser();
      await request(app)
        .post('/api/auth/register')
        .send({ ...u, confirmPassword: u.password })
        .expect(StatusCodes.CREATED);
      const code = getLastSentCode(u.email, 'email_verification')!;
      const verifyRes = await request(app)
        .post('/api/auth/verify-email')
        .send({ email: u.email, otp: code });
      const cookies = cookiesFrom(verifyRes);

      await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookieHeader(cookies))
        .expect(StatusCodes.FORBIDDEN);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return the current user from the access token cookie', async () => {
      const u = validUser();
      await request(app)
        .post('/api/auth/register')
        .send({ ...u, confirmPassword: u.password })
        .expect(StatusCodes.CREATED);
      const code = getLastSentCode(u.email, 'email_verification')!;
      const verifyRes = await request(app)
        .post('/api/auth/verify-email')
        .send({ email: u.email, otp: code });
      const cookies = cookiesFrom(verifyRes);

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookieHeader({ token: cookies.token }))
        .expect(StatusCodes.OK);

      expect(meRes.body.user.email).toBe(u.email);
      expect(meRes.body.user.name).toBe(u.name);
    });

    it('should reject unauthenticated requests', async () => {
      await request(app).get('/api/auth/me').expect(StatusCodes.UNAUTHORIZED);
    });
  });
});