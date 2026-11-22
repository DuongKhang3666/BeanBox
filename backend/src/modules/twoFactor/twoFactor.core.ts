import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { hashBackupCode, normalizeBackupCode } from '../../lib/backupCodes.js';
import { decryptSecret, encryptSecret } from '../../lib/secretBox.js';
import { generateOpaqueToken, sha256Hex } from '../../lib/tokens.js';
import { verifyTotp } from '../../lib/totp.js';

/**
 * Phần lõi dùng chung của xác thực 2 lớp (D-063): khóa/mã hóa secret, kiểm mã (TOTP hoặc mã dự phòng,
 * dùng một lần, nguyên tử) và tạo thử thách đăng nhập. Không phụ thuộc auth.service để tránh vòng import.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export const CHALLENGE_TTL_MS = 5 * 60_000;
export const MAX_CHALLENGE_ATTEMPTS = 5;
export const SETUP_TTL_MS = 10 * 60_000;

export const unavailable = () =>
  new AppError(
    503,
    'TWO_FACTOR_UNAVAILABLE',
    'Xác thực 2 lớp tạm thời không khả dụng, vui lòng thử lại sau',
  );

/** Khóa AES-256; thiếu -> 503 (không bao giờ bỏ qua bước 2). Đọc env tại thời điểm gọi. */
export function totpKey(): Buffer {
  const key = env.TOTP_ENCRYPTION_KEY;
  if (!key) throw unavailable();
  return key;
}

/** Mã hóa secret buộc với `userId` (AAD) để không hoán đổi ciphertext giữa các user. */
export const sealSecret = (secret: Buffer, userId: string): string =>
  encryptSecret(secret, totpKey(), userId);

/** Sai khóa / ciphertext bị sửa -> 503 (cấu hình lỗi), ghi log không kèm dữ liệu nhạy cảm. */
export function openSecret(enc: string, userId: string): Buffer {
  const key = totpKey();
  try {
    return decryptSecret(enc, key, userId);
  } catch {
    logger.error({ userId }, 'Không giải mã được secret 2FA (sai khóa hoặc dữ liệu bị sửa)');
    throw unavailable();
  }
}

export interface CodeSource {
  id: string;
  twoFactorSecretEnc: string | null;
  twoFactorLastStep: number | null;
}

export type CodeMethod = 'totp' | 'backup';

const stripSpaces = (s: string): string => s.replace(/\s+/g, '');
export const isTotpShape = (s: string): boolean => /^\d{6}$/.test(stripSpaces(s));

/**
 * Tiêu thụ MỘT mã: `totp` (6 số, bước phải lớn hơn bước đã dùng, ghi nguyên tử) hoặc `backup`
 * (mã dự phòng chưa dùng, đánh dấu usedAt nguyên tử). Trả phương thức dùng, hoặc null nếu sai.
 * `any`: tự nhận dạng (6 chữ số -> TOTP, ngược lại -> mã dự phòng).
 */
export async function consumeCode(
  db: Db,
  user: CodeSource,
  input: { totp?: string | undefined; backup?: string | undefined; any?: string | undefined },
  now: Date,
): Promise<CodeMethod | null> {
  const totp =
    input.totp ?? (input.any !== undefined && isTotpShape(input.any) ? input.any : undefined);
  const backup =
    input.backup ?? (input.any !== undefined && !isTotpShape(input.any) ? input.any : undefined);

  if (totp !== undefined) {
    if (!user.twoFactorSecretEnc) return null;
    const secret = openSecret(user.twoFactorSecretEnc, user.id);
    const step = verifyTotp(secret, stripSpaces(totp), now.getTime(), user.twoFactorLastStep);
    if (step === null) return null;
    const claimed = await db.user.updateMany({
      where: {
        id: user.id,
        OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { lt: step } }],
      },
      data: { twoFactorLastStep: step },
    });
    return claimed.count === 1 ? 'totp' : null;
  }
  if (backup !== undefined) {
    const normalized = normalizeBackupCode(backup);
    if (!normalized) return null;
    const claimed = await db.twoFactorBackupCode.updateMany({
      where: { userId: user.id, codeHash: hashBackupCode(normalized), usedAt: null },
      data: { usedAt: now },
    });
    return claimed.count === 1 ? 'backup' : null;
  }
  return null;
}

export interface LoginChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  expiresAt: string;
}

/** Tạo thử thách bước 2 (vô hiệu các thử thách chưa dùng trước đó của user). Token rõ chỉ trả một lần. */
export async function createChallenge(userId: string): Promise<LoginChallenge> {
  totpKey(); // thiếu khóa -> 503 trước khi phát token
  const raw = generateOpaqueToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
  await prisma.$transaction([
    prisma.twoFactorChallenge.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.twoFactorChallenge.create({
      data: { userId, tokenHash: sha256Hex(raw), expiresAt },
    }),
  ]);
  return { twoFactorRequired: true, challengeToken: raw, expiresAt: expiresAt.toISOString() };
}

/** Thu hồi mọi phiên của user, trừ `exceptFamilyId` (nếu có). */
export const revokeSessions = (db: Db, userId: string, exceptFamilyId?: string) =>
  db.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptFamilyId ? { familyId: { not: exceptFamilyId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
