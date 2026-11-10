import path from 'node:path';
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
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { healthRouter } from './modules/health/health.routes.js';

const API_PREFIX = '/api/v1';
/** backend/uploads: src/ và dist/ đều nằm ngay dưới thư mục backend. */
const UPLOADS_DIR = path.resolve(import.meta.dirname, '..', 'uploads');

export interface AppOptions {
  /** Số request/phút/IP của rate limit chung (mặc định 100). Chỉ đổi trong test. */
  generalRateLimit?: number;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      autoLogging: {
        ignore: (req) =>
          (req.url?.startsWith(`${API_PREFIX}/health`) || req.url?.startsWith('/uploads/')) ??
          false,
      },
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
  // Ảnh tĩnh đặt TRƯỚC rate limit: một trang danh sách tải hàng chục ảnh, nếu tính vào hạn mức
  // 100 req/phút của API thì người dùng bình thường cũng bị 429. File tĩnh rẻ và công khai.
  // Không tìm thấy / dotfile / đường dẫn lạ -> fallthrough xuống notFound (404 JSON chuẩn).
  app.use(
    '/uploads',
    express.static(UPLOADS_DIR, {
      index: false,
      redirect: false, // thư mục -> 404 thay vì 301
      dotfiles: 'deny',
      fallthrough: true,
      maxAge: '1h',
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: options.generalRateLimit ?? 100,
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
  app.use(API_PREFIX, catalogRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
