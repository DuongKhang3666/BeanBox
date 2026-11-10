import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { sendMailInBackground } from '../../lib/mailer.js';
import { hashPassword, verifyDummyPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { generateOpaqueToken, sha256Hex, signAccessToken } from '../../lib/tokens.js';
import { toUserDto, type UserDto } from '../../lib/userDto.js';
import { buildResetEmail, buildVerifyEmail } from './auth.emails.js';
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from './auth.schema.js';

const MINUTE_MS = 60_000;
const VERIFY_TTL_MS = 24 * 60 * MINUTE_MS;
const RESET_TTL_MS = 30 * MINUTE_MS;
const LOCK_MS = 15 * MINUTE_MS;
const FAIL_WINDOW_MS = 15 * MINUTE_MS;
const MAX_FAILED_LOGINS = 5;
const RESEND_COOLDOWN_SEC = 60;

export interface ClientContext {
  ip: string | undefined;
  userAgent: string | undefined;
}

export interface SessionResult {
  user: UserDto;
  accessToken: string;
  expiresIn: number;
  /** Token rõ của cookie; controller đặt vào Set-Cookie, KHÔNG đưa vào body. */
  refreshToken: string;
}

type Db = PrismaClient | Prisma.TransactionClient;

const invalidRefresh = () =>
  new AppError(
    401,
    'INVALID_REFRESH_TOKEN',
    'Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại',
  );
const tokenInvalid = (message: string) => new AppError(400, 'TOKEN_INVALID', message);
const RESET_INVALID_MSG = 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn';
const VERIFY_INVALID_MSG = 'Liên kết xác thực email không hợp lệ hoặc đã hết hạn';

// ───────────── Phiên ─────────────

async function createRefreshToken(
  db: Db,
  userId: string,
  familyId: string,
  ctx: ClientContext,
): Promise<{ id: string; raw: string }> {
  const raw = generateOpaqueToken();
  const row = await db.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: sha256Hex(raw),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * MINUTE_MS),
      userAgent: ctx.userAgent ? ctx.userAgent.slice(0, 255) : null,
      ip: ctx.ip ?? null,
    },
    select: { id: true },
  });
  return { id: row.id, raw };
}

async function buildSession(
  user: User,
  familyId: string,
  refreshToken: string,
): Promise<SessionResult> {
  const accessToken = await signAccessToken({ sub: user.id, role: user.role, sid: familyId });
  return { user: toUserDto(user), accessToken, expiresIn: env.accessTokenTtlSec, refreshToken };
}

/** Dùng chung cho register/login: cấp phiên (family mới nếu không truyền familyId). */
export async function issueSession(
  user: User,
  opts: { familyId?: string } & ClientContext,
): Promise<SessionResult> {
  const familyId = opts.familyId ?? randomUUID();
  const { raw } = await createRefreshToken(prisma, user.id, familyId, opts);
  return buildSession(user, familyId, raw);
}

const revokeFamily = (familyId: string) =>
  prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

// ───────────── Register ─────────────

export async function register(input: RegisterInput, ctx: ClientContext): Promise<SessionResult> {
  const emailTaken = () => new AppError(409, 'EMAIL_TAKEN', 'Email đã được sử dụng');

  if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    throw emailTaken();
  }
  const passwordHash = await hashPassword(input.password);
  const verifyToken = generateOpaqueToken();

  let user: User;
  try {
    // Nested create: user và token xác thực nằm trong cùng một transaction.
    user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        phone: input.phone ?? null,
        emailVerificationTokens: {
          create: {
            tokenHash: sha256Hex(verifyToken),
            expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
          },
        },
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw emailTaken();
    }
    throw err;
  }

  sendMailInBackground(buildVerifyEmail(user, verifyToken));
  return issueSession(user, ctx);
}

// ───────────── Login ─────────────

/** Ghi nhận lần sai nguyên tử bằng một câu SQL (an toàn khi nhiều request đồng thời). */
async function recordFailedLogin(userId: string): Promise<void> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - FAIL_WINDOW_MS);
  const lockUntil = new Date(now.getTime() + LOCK_MS);
  await prisma.$executeRaw`
    UPDATE "User" SET
      "failedLoginCount" = CASE
        WHEN (CASE WHEN "lastFailedLoginAt" IS NULL OR "lastFailedLoginAt" < ${windowStart}
                   THEN 1 ELSE "failedLoginCount" + 1 END) >= ${MAX_FAILED_LOGINS}
        THEN 0
        ELSE (CASE WHEN "lastFailedLoginAt" IS NULL OR "lastFailedLoginAt" < ${windowStart}
                   THEN 1 ELSE "failedLoginCount" + 1 END)
      END,
      "lockedUntil" = CASE
        WHEN (CASE WHEN "lastFailedLoginAt" IS NULL OR "lastFailedLoginAt" < ${windowStart}
                   THEN 1 ELSE "failedLoginCount" + 1 END) >= ${MAX_FAILED_LOGINS}
        THEN ${lockUntil}
        ELSE "lockedUntil"
      END,
      "lastFailedLoginAt" = ${now}
    WHERE "id" = ${userId}`;
}

export async function login(input: LoginInput, ctx: ClientContext): Promise<SessionResult> {
  const invalidCredentials = () =>
    new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    await verifyDummyPassword(input.password);
    throw invalidCredentials();
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new AppError(
      403,
      'ACCOUNT_LOCKED',
      'Tài khoản tạm thời bị khóa do nhập sai mật khẩu nhiều lần',
      { lockedUntil: user.lockedUntil.toISOString() },
    );
  }

  if (!(await verifyPassword(user.passwordHash, input.password))) {
    await recordFailedLogin(user.id);
    throw invalidCredentials();
  }
  if (user.status === 'DISABLED') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'Tài khoản đã bị khóa');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lastFailedLoginAt: null,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });
  return issueSession(updated, ctx);
}

// ───────────── Refresh / Logout ─────────────

export async function refresh(
  rawToken: string | undefined,
  ctx: ClientContext,
): Promise<SessionResult> {
  if (!rawToken) throw invalidRefresh();

  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256Hex(rawToken) },
    include: { user: true },
  });
  if (!row) throw invalidRefresh();

  if (row.revokedAt) {
    // Token đã xoay/thu hồi bị dùng lại: coi như bị đánh cắp, hủy cả family.
    await revokeFamily(row.familyId);
    logger.warn({ userId: row.userId, familyId: row.familyId }, 'Phát hiện dùng lại refresh token');
    throw invalidRefresh();
  }
  if (row.expiresAt.getTime() <= Date.now()) throw invalidRefresh();
  if (row.user.status === 'DISABLED') {
    await revokeFamily(row.familyId);
    throw invalidRefresh();
  }

  const rotated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) return null; // request đồng thời đã xoay trước
    const next = await createRefreshToken(tx, row.userId, row.familyId, ctx);
    await tx.refreshToken.update({ where: { id: row.id }, data: { replacedById: next.id } });
    return next.raw;
  });

  if (rotated === null) {
    await revokeFamily(row.familyId);
    logger.warn(
      { userId: row.userId, familyId: row.familyId },
      'Refresh đồng thời với cùng một token',
    );
    throw invalidRefresh();
  }
  return buildSession(row.user, row.familyId, rotated);
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256Hex(rawToken) },
    select: { familyId: true },
  });
  if (row) await revokeFamily(row.familyId);
}

// ───────────── Quên / đặt lại mật khẩu ─────────────

/** Chạy nền (controller không await): chỉ gửi mail khi user tồn tại và ACTIVE. */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.status !== 'ACTIVE') return;

  const raw = generateOpaqueToken();
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256Hex(raw),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    }),
  ]);
  sendMailInBackground(buildResetEmail(user, raw));
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const invalid = () => tokenInvalid(RESET_INVALID_MSG);
  const passwordHash = await hashPassword(input.newPassword);

  await prisma.$transaction(async (tx) => {
    const token = await tx.passwordResetToken.findUnique({
      where: { tokenHash: sha256Hex(input.token) },
      include: { user: { select: { id: true, status: true } } },
    });
    if (!token || token.user.status === 'DISABLED') throw invalid();

    const now = new Date();
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count === 0) throw invalid();

    const userId = token.user.id;
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, failedLoginCount: 0, lastFailedLoginAt: null, lockedUntil: null },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    });
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  });
}

// ───────────── Xác thực email ─────────────

export async function verifyEmail(rawToken: string): Promise<{ emailVerified: true }> {
  const invalid = () => tokenInvalid(VERIFY_INVALID_MSG);
  const ok = { emailVerified: true } as const;

  const token = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: sha256Hex(rawToken) },
    include: { user: { select: { id: true, emailVerifiedAt: true } } },
  });
  if (!token) throw invalid();

  if (token.usedAt) {
    if (token.user.emailVerifiedAt) return ok;
    throw invalid();
  }
  if (token.expiresAt.getTime() <= Date.now()) throw invalid();

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.emailVerificationToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count === 0) {
      // Request đồng thời đã dùng token này: chỉ chấp nhận nếu email đã được xác thực.
      const u = await tx.user.findUnique({
        where: { id: token.userId },
        select: { emailVerifiedAt: true },
      });
      if (!u?.emailVerifiedAt) throw invalid();
      return;
    }
    await tx.user.updateMany({
      where: { id: token.userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: now },
    });
  });
  return ok;
}

export async function resendVerification(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
  if (user.emailVerifiedAt) throw new AppError(409, 'CONFLICT', 'Email đã được xác thực');

  const latest = await prisma.emailVerificationToken.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (latest) {
    const elapsedMs = Date.now() - latest.createdAt.getTime();
    if (elapsedMs < RESEND_COOLDOWN_SEC * 1000) {
      const retryAfterSec = Math.max(1, Math.ceil((RESEND_COOLDOWN_SEC * 1000 - elapsedMs) / 1000));
      throw new AppError(429, 'RATE_LIMITED', 'Bạn vừa yêu cầu gửi email, vui lòng thử lại sau', {
        retryAfterSec,
      });
    }
  }

  const raw = generateOpaqueToken();
  await prisma.$transaction([
    prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.emailVerificationToken.create({
      data: { userId, tokenHash: sha256Hex(raw), expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
    }),
  ]);
  sendMailInBackground(buildVerifyEmail(user, raw));
}

// ───────────── Đổi mật khẩu ─────────────

export async function changePassword(
  userId: string,
  sessionId: string,
  input: ChangePasswordInput,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new AppError(400, 'INVALID_PASSWORD', 'Mật khẩu hiện tại không đúng');
  }
  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null, familyId: { not: sessionId } },
      data: { revokedAt: new Date() },
    }),
  ]);
}
