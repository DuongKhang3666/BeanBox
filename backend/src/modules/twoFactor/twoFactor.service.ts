import type { Prisma, User } from '../../generated/prisma/client.js';
import { writeAudit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import { generateBackupCodes, hashBackupCode, normalizeBackupCode } from '../../lib/backupCodes.js';
import { verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { base32Encode, buildOtpauthUri, generateTotpSecret, verifyTotp } from '../../lib/totp.js';
import { qrPngDataUrl } from '../payments/vietqr.js';
import { recordFailedLogin } from '../auth/auth.service.js';
import {
  consumeCode,
  openSecret,
  revokeSessions,
  sealSecret,
  SETUP_TTL_MS,
  totpKey,
} from './twoFactor.core.js';

/** Bật/tắt/quản lý 2FA của chính người dùng (api-contract §6.5, D-063). */

export const ISSUER = 'BeanBox';

export interface Actor {
  userId: string;
  sessionId: string;
  ip: string | undefined;
}

export interface SetupResult {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
}

const invalidCode = () =>
  new AppError(400, 'TWO_FACTOR_INVALID', 'Mã xác thực không đúng hoặc đã được sử dụng');

async function loadUser(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
  return user;
}

async function checkPassword(user: User, password: string): Promise<void> {
  if (!(await verifyPassword(user.passwordHash, password))) {
    throw new AppError(400, 'INVALID_PASSWORD', 'Mật khẩu không đúng');
  }
}

const alreadyEnabled = () => new AppError(409, 'CONFLICT', 'Xác thực 2 lớp đã được bật');
const notEnabled = () =>
  new AppError(409, 'TWO_FACTOR_NOT_ENABLED', 'Xác thực 2 lớp chưa được bật');

export async function setup(actor: Actor, password: string): Promise<SetupResult> {
  totpKey(); // 503 trước mọi thứ nếu chưa cấu hình khóa
  const user = await loadUser(actor.userId);
  await checkPassword(user, password);
  if (user.twoFactorEnabledAt) throw alreadyEnabled();

  const secret = generateTotpSecret();
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, twoFactorEnabledAt: null },
    data: {
      twoFactorPendingSecretEnc: sealSecret(secret, user.id),
      twoFactorPendingAt: new Date(),
    },
  });
  if (claimed.count === 0) throw alreadyEnabled();

  const secretBase32 = base32Encode(secret);
  const otpauthUri = buildOtpauthUri({ secretBase32, issuer: ISSUER, account: user.email });
  return { secret: secretBase32, otpauthUri, qrDataUrl: await qrPngDataUrl(otpauthUri) };
}

export async function enable(actor: Actor, code: string): Promise<{ backupCodes: string[] }> {
  const user = await loadUser(actor.userId);
  if (user.twoFactorEnabledAt) throw alreadyEnabled();
  const now = new Date();
  const pending = user.twoFactorPendingSecretEnc;
  if (
    !pending ||
    !user.twoFactorPendingAt ||
    now.getTime() - user.twoFactorPendingAt.getTime() > SETUP_TTL_MS
  ) {
    throw new AppError(
      409,
      'TWO_FACTOR_SETUP_REQUIRED',
      'Chưa bắt đầu thiết lập hoặc phiên thiết lập đã hết hạn, vui lòng bắt đầu lại',
    );
  }
  const step = verifyTotp(openSecret(pending, user.id), code.replace(/\s+/g, ''), now.getTime());
  if (step === null) throw invalidCode();

  const backupCodes = generateBackupCodes();
  await prisma.$transaction(async (tx) => {
    // Nguyên tử: chỉ một request thắng; ghi bước vừa dùng để mã này không đăng nhập lại được.
    const claimed = await tx.user.updateMany({
      where: { id: user.id, twoFactorEnabledAt: null, twoFactorPendingSecretEnc: pending },
      data: {
        twoFactorEnabledAt: now,
        twoFactorSecretEnc: pending,
        twoFactorPendingSecretEnc: null,
        twoFactorPendingAt: null,
        twoFactorLastStep: step,
      },
    });
    if (claimed.count === 0) throw alreadyEnabled();
    await replaceBackupCodes(tx, user.id, backupCodes);
    await revokeSessions(tx, user.id, actor.sessionId);
    await writeAudit(tx, {
      actorId: user.id,
      action: 'user.2fa.enable',
      entity: 'User',
      entityId: user.id,
      diff: { twoFactorEnabled: [false, true] },
      ip: actor.ip ?? null,
    });
  });
  return { backupCodes };
}

async function replaceBackupCodes(
  tx: Prisma.TransactionClient,
  userId: string,
  codes: string[],
): Promise<void> {
  await tx.twoFactorBackupCode.deleteMany({ where: { userId } });
  await tx.twoFactorBackupCode.createMany({
    data: codes.map((c) => ({ userId, codeHash: hashBackupCode(normalizeBackupCode(c)!) })),
  });
}

/** Xác minh mật khẩu + mã (TOTP hoặc mã dự phòng) của user đã bật 2FA; sai mã tính vào lockout đăng nhập. */
async function authorize(
  actor: Actor,
  password: string,
  code: string,
  run: (tx: Prisma.TransactionClient, user: User) => Promise<void>,
): Promise<void> {
  const user = await loadUser(actor.userId);
  await checkPassword(user, password);
  if (!user.twoFactorEnabledAt) throw notEnabled();

  class BadCode extends Error {}
  try {
    await prisma.$transaction(async (tx) => {
      const method = await consumeCode(tx, user, { any: code }, new Date());
      if (!method) throw new BadCode();
      await run(tx, user);
    });
  } catch (err) {
    if (err instanceof BadCode) {
      await recordFailedLogin(user.id);
      throw invalidCode();
    }
    throw err;
  }
}

export async function disable(actor: Actor, password: string, code: string): Promise<void> {
  await authorize(actor, password, code, async (tx, user) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabledAt: null,
        twoFactorSecretEnc: null,
        twoFactorPendingSecretEnc: null,
        twoFactorPendingAt: null,
        twoFactorLastStep: null,
      },
    });
    await tx.twoFactorBackupCode.deleteMany({ where: { userId: user.id } });
    await tx.twoFactorChallenge.deleteMany({ where: { userId: user.id } });
    await revokeSessions(tx, user.id, actor.sessionId);
    await writeAudit(tx, {
      actorId: user.id,
      action: 'user.2fa.disable',
      entity: 'User',
      entityId: user.id,
      diff: { twoFactorEnabled: [true, false] },
      ip: actor.ip ?? null,
    });
  });
}

export async function regenerateBackupCodes(
  actor: Actor,
  password: string,
  code: string,
): Promise<{ backupCodes: string[] }> {
  const backupCodes = generateBackupCodes();
  await authorize(actor, password, code, async (tx, user) => {
    await replaceBackupCodes(tx, user.id, backupCodes);
    await writeAudit(tx, {
      actorId: user.id,
      action: 'user.2fa.backup_regenerate',
      entity: 'User',
      entityId: user.id,
      diff: { backupCodes: [null, backupCodes.length] },
      ip: actor.ip ?? null,
    });
  });
  return { backupCodes };
}
