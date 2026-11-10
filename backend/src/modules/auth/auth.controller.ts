import type { Request } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from './auth.cookies.js';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from './auth.schema.js';
import * as service from './auth.service.js';

const clientContext = (req: Request): service.ClientContext => ({
  ip: req.ip,
  userAgent: req.get('user-agent')?.slice(0, 255),
});

const refreshCookieOf = (req: Request): string | undefined => {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const v = cookies?.[REFRESH_COOKIE];
  return typeof v === 'string' && v !== '' ? v : undefined;
};

export const register = asyncHandler(async (req, res) => {
  const { refreshToken, ...body } = await service.register(
    req.body as RegisterInput,
    clientContext(req),
  );
  setRefreshCookie(res, refreshToken);
  res.status(201).json({ data: body });
});

export const login = asyncHandler(async (req, res) => {
  const { refreshToken, ...body } = await service.login(req.body as LoginInput, clientContext(req));
  setRefreshCookie(res, refreshToken);
  res.json({ data: body });
});

export const refresh = asyncHandler(async (req, res) => {
  try {
    const { refreshToken, ...body } = await service.refresh(
      refreshCookieOf(req),
      clientContext(req),
    );
    setRefreshCookie(res, refreshToken);
    res.json({ data: body });
  } catch (err) {
    if (err instanceof AppError && err.code === 'INVALID_REFRESH_TOKEN') clearRefreshCookie(res);
    throw err;
  }
});

export const logout = asyncHandler(async (req, res) => {
  await service.logout(refreshCookieOf(req));
  clearRefreshCookie(res);
  res.status(204).end();
});

export const forgotPassword = asyncHandler((req, res) => {
  const { email } = req.body as ForgotPasswordInput;
  // Không await: thời gian phản hồi không phụ thuộc email có tồn tại hay không.
  service.requestPasswordReset(email).catch((err: unknown) => {
    logger.error({ err }, 'Xử lý quên mật khẩu thất bại');
  });
  res.json({
    data: { message: 'Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.' },
  });
  return Promise.resolve();
});

export const resetPassword = asyncHandler(async (req, res) => {
  await service.resetPassword(req.body as ResetPasswordInput);
  res.json({ data: { message: 'Đã đặt lại mật khẩu.' } });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  res.json({ data: await service.verifyEmail((req.body as VerifyEmailInput).token) });
});

export const resendVerification = asyncHandler(async (req, res) => {
  try {
    await service.resendVerification(req.auth!.userId);
  } catch (err) {
    if (err instanceof AppError && err.code === 'RATE_LIMITED') {
      const sec = (err.details as { retryAfterSec?: number } | undefined)?.retryAfterSec;
      if (sec) res.setHeader('Retry-After', String(sec));
    }
    throw err;
  }
  res.status(204).end();
});

export const changePassword = asyncHandler(async (req, res) => {
  const auth = req.auth!;
  await service.changePassword(auth.userId, auth.sessionId, req.body as ChangePasswordInput);
  res.status(204).end();
});
