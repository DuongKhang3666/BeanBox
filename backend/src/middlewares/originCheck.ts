import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

/** Chống CSRF cho endpoint dùng cookie: Origin phải khớp chính xác FRONTEND_ORIGINS. */
export const requireAllowedOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !env.FRONTEND_ORIGINS.includes(origin)) {
    next(new AppError(403, 'INVALID_ORIGIN', 'Yêu cầu không hợp lệ'));
    return;
  }
  next();
};
