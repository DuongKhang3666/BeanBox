import type { Role } from '../generated/prisma/client.js';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from '../lib/tokens.js';

async function authenticate(req: Request): Promise<void> {
  const header = req.headers.authorization;
  const match = header ? /^Bearer\s+(\S+)$/i.exec(header) : null;
  if (!match?.[1]) throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');

  let claims;
  try {
    claims = await verifyAccessToken(match[1]);
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn');
  }

  // Luôn đọc DB: khóa tài khoản / đổi quyền có hiệu lực ngay, không tin claim role.
  // Cùng truy vấn kiểm tra phiên (claim `sid` = familyId): phải còn ít nhất một refresh token
  // chưa thu hồi và chưa hết hạn, nên logout / đổi-đặt lại mật khẩu / phát hiện dùng lại refresh
  // token làm access token mất hiệu lực ngay (không chờ hết TTL).
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      role: true,
      status: true,
      refreshTokens: {
        where: { familyId: claims.sid, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn');
  // Thứ tự: tài khoản bị khóa (403) được báo trước khi xét phiên (401).
  if (user.status === 'DISABLED') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'Tài khoản đã bị khóa');
  }
  if (user.refreshTokens.length === 0) {
    throw new AppError(401, 'UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn');
  }
  req.auth = { userId: user.id, role: user.role, sessionId: claims.sid };
}

export const requireAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  await authenticate(req);
  next();
});

export const optionalAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  if (req.headers.authorization === undefined) {
    next();
    return;
  }
  await authenticate(req);
  next();
});

export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập'));
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(new AppError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này'));
      return;
    }
    next();
  };
}

export const requireStaff = requireRole('STAFF', 'ADMIN');
export const requireAdmin = requireRole('ADMIN');
