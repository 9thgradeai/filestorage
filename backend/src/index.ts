/// <reference path="./types/express.d.ts" />
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import fileRoutes from './routes/file.routes';
import folderRoutes from './routes/folder.routes';
import aiRoutes from './routes/ai.routes';
import { errorHandler } from './middleware/errorHandler';
import { pool } from './config/database';
import { validateEnv } from './config/env';
import { logger, httpLogger } from './config/logger';
import { purgeExpiredOtps } from './services/otp.service';

dotenv.config();
validateEnv();

const app = express();

// Behind a single reverse proxy (Railway/Vercel). Lets express-rate-limit see
// real client IPs from X-Forwarded-For instead of warning about spoofing.
app.set('trust proxy', 1);

// Structured request logging (access logs) — runs first, before routing.
app.use(httpLogger);

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:3000'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));

app.use(rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '') || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '') || 100,
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
}));

// Stricter limiter for auth endpoints to resist credential brute-forcing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '') || 20, // 20 attempts per IP per 15 minutes
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// OTP endpoints are already guarded per-email by expiry + attempt caps; the
// limiter adds a per-IP backstop against bulk abuse (spam, code spraying).
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.OTP_RATE_LIMIT_MAX || '') || 30,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/verify-email', otpLimiter);
app.use('/api/auth/resend-otp', otpLimiter);
app.use('/api/auth/forgot-password', otpLimiter);
app.use('/api/auth/reset-password', otpLimiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/folders', folderRoutes);

app.use('/api/ai', aiRoutes);
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      db: 'up',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch {
    res.status(503).json({
      status: 'error',
      db: 'down',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  }
});

// Global error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Only auto-start the server when run directly (not when imported by tests).
if (require.main === module) {
  const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/api/health`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Sweep expired OTP rows periodically (best-effort housekeeping).
  const otpSweep = setInterval(() => {
    purgeExpiredOtps().catch((err) =>
      logger.error({ err: err }, 'Expired OTP cleanup failed')
    );
  }, 6 * 60 * 60 * 1000);
  otpSweep.unref();

  // Graceful shutdown handling
  const gracefulShutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      logger.info('Server closed successfully');
      process.exit(0);
    });

    // Force shutdown after timeout
    setTimeout(() => {
      logger.error('Could not close connections in time, forcing shutdown');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

export default app;