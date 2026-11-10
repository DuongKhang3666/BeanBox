import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest();

/** Request nội bộ (frontend server-side) mang đúng X-Internal-Secret. So sánh hằng thời gian. */
export function isTrustedInternalRequest(req: Request): boolean {
  const secret = env.INTERNAL_API_SECRET;
  if (!secret) return false;
  const header = req.headers['x-internal-secret'];
  if (typeof header !== 'string' || header === '') return false;
  return timingSafeEqual(sha256(header), sha256(secret));
}

export interface RateLimiterOptions {
  windowMs: number;
  limit: number;
  skip?: (req: Request) => boolean;
}

/** Mỗi lần gọi tạo một store riêng (MemoryStore). */
export function createRateLimiter({ windowMs, limit, skip }: RateLimiterOptions) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
    ...(skip ? { skip } : {}),
    handler: (_req, res, next) => {
      const retryAfter = Number(res.getHeader('Retry-After')) || 60;
      res.setHeader('Retry-After', String(retryAfter));
      next(
        new AppError(429, 'RATE_LIMITED', 'Bạn thao tác quá nhanh, vui lòng thử lại sau', {
          retryAfterSec: retryAfter,
        }),
      );
    },
  });
}
