import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  // D-075: lỗi không bao giờ được cache công khai (route có thể đã đặt Cache-Control trước khi lỗi).
  res.setHeader('Cache-Control', 'no-store');

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu không hợp lệ',
        details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    const d = err.details as { retryAfterSec?: unknown } | undefined;
    if (err.status === 429 && typeof d?.retryAfterSec === 'number') {
      res.setHeader('Retry-After', String(d.retryAfterSec));
    }
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Lỗi từ body-parser (JSON sai, quá lớn)
  const e = err as { type?: string };
  if (e.type === 'entity.parse.failed') {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Nội dung JSON không hợp lệ' },
    });
    return;
  }
  if (e.type === 'entity.too.large') {
    res.status(413).json({
      error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu gửi lên quá lớn' },
    });
    return;
  }

  logger.error({ err, requestId: req.id }, 'Lỗi không xử lý được');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' },
  });
};
