import pino from 'pino';
import pinoHttp from 'pino-http';

const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
  level: isTest ? 'silent' : process.env.LOG_LEVEL || 'info',
  base: undefined, // drop pid/hostname noise in structured logs
  timestamp: pino.stdTimeFunctions.isoTime,
});

// HTTP request logging middleware (access logs).
export const httpLogger = pinoHttp({
  logger,
  autoLogging: isTest ? false : true,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req: any) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      ip: req.ip,
    }),
  },
});