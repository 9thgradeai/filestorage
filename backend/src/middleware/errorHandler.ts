import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { MAX_FILE_SIZE, formatSizeLabel } from '../services/fileValidation';
import { logger } from '../config/logger';

// A small typed helper for controllers/routes to signal expected failures.
export class AppError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  let message = err.message || 'Server Error';
  let statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;

  // JWT errors from jsonwebtoken surface via the auth middleware.
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = StatusCodes.UNAUTHORIZED;
    message = 'Invalid token, please login again';
  }

  // Multer upload errors (e.g. LIMIT_FILE_SIZE) carry a structured code.
  if (err.name === 'MulterError') {
    const isTooLarge = (err as any).code === 'LIMIT_FILE_SIZE';
    statusCode = StatusCodes.BAD_REQUEST;
    message = isTooLarge
      ? `File size exceeds maximum allowed size of ${formatSizeLabel(MAX_FILE_SIZE)}`
      : err.message || 'File upload error';
  }

  if (statusCode >= 500) {
    // Unexpected server errors: log the full stack, keep the client response generic.
    logger.error({ err, req: { method: req.method, url: req.url } }, 'Unhandled error');
  } else {
    logger.warn({ err, method: req.method, url: req.url }, 'Request error');
  }

  const errorResponse: any = {
    success: false,
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  };

  res.status(statusCode).json(errorResponse);
};