import type { CookieOptions, Response } from 'express';
import { env } from '../../config/env.js';

export const REFRESH_COOKIE = 'bb_rt';

/** Clear phải dùng đúng cùng thuộc tính (path/sameSite/secure/httpOnly) thì trình duyệt mới xóa. */
const baseOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'strict',
  path: '/api/v1/auth',
});

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseOptions(),
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions());
}
