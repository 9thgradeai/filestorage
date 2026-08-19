import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { StatusCodes } from 'http-status-codes';

describe('Rate Limiting', () => {
  const buildApp = (max: number) => {
    const app = express();
    app.use(
      rateLimit({
        windowMs: 60_000,
        max,
        message: 'Too many requests',
        standardHeaders: true,
        legacyHeaders: false,
      })
    );
    app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
    return app;
  };

  it('rejects requests past the configured max', async () => {
    const app = buildApp(5);
    const results = await Promise.all(
      Array.from({ length: 30 }, () => request(app).get('/api/health'))
    );
    const rateLimited = results.some(r => r.status === StatusCodes.TOO_MANY_REQUESTS);
    expect(rateLimited).toBe(true);
  });

  it('allows requests under the limit', async () => {
    const app = buildApp(100);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).get('/api/health'))
    );
    for (const res of results) {
      expect(res.status).toBe(StatusCodes.OK);
    }
  });
});