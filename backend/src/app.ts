import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { AppError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFound } from './middlewares/notFound.js';
import { requestId } from './middlewares/requestId.js';
import { healthRouter } from './modules/health/health.routes.js';

const API_PREFIX = '/api/v1';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      autoLogging: { ignore: (req) => req.url?.startsWith(`${API_PREFIX}/health`) ?? false },
      serializers: {
        // Không log header (Authorization/Cookie) – chỉ giữ thông tin cần thiết
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_ORIGINS,
      credentials: true,
      exposedHeaders: ['X-Request-Id', 'Retry-After'],
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 100,
      standardHeaders: 'draft-6',
      legacyHeaders: false,
      skip: (req) => req.path === `${API_PREFIX}/health`,
      handler: (_req, res, next) => {
        const retryAfter = Number(res.getHeader('Retry-After')) || 60;
        res.setHeader('Retry-After', String(retryAfter));
        next(
          new AppError(429, 'RATE_LIMITED', 'Bạn thao tác quá nhanh, vui lòng thử lại sau', {
            retryAfterSec: retryAfter,
          }),
        );
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use(API_PREFIX, healthRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
