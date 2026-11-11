import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { getPaymentConfig, type PaymentConfig } from '../config/payments.js';
import { cancelOrderTx } from '../modules/orders/orders.cancel.js';
import { notifyOrderStatusChange } from '../modules/orders/orders.statusEmails.js';
import { defaultStripeHttp, expireSession, type StripeHttp } from '../modules/payments/stripe.js';

/**
 * Job nền (architecture §7). Chạy trong tiến trình API:
 * - dọn dẹp mỗi 60 phút (advisory lock `CLEANUP_LOCK_KEY`);
 * - hủy đơn PENDING_PAYMENT quá hạn mỗi 60 giây (advisory lock `EXPIRE_PAYMENTS_LOCK_KEY`, §13.6).
 */

/** Khóa advisory cố định cho job dọn dẹp ("BBCLEAN1" dạng số), tránh nhiều instance chạy cùng lúc. */
export const CLEANUP_LOCK_KEY = 6_661_000_001n;
/** Khóa advisory riêng cho job hết hạn thanh toán. */
export const EXPIRE_PAYMENTS_LOCK_KEY = 6_661_000_002n;
const EXPIRE_BATCH_SIZE = 50;
const EXPIRE_INTERVAL_MS = 60 * 1000;
const GUEST_CART_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const INTERVAL_MS = 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 30_000;

export type CleanupResult =
  | { skipped: true }
  | {
      skipped: false;
      guestCarts: number;
      refreshTokens: number;
      passwordResetTokens: number;
      emailVerificationTokens: number;
    };

export async function runCleanupOnce(now: Date = new Date()): Promise<CleanupResult> {
  const result = await prisma.$transaction(
    async (tx): Promise<CleanupResult> => {
      const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${CLEANUP_LOCK_KEY}::bigint) AS locked`;
      if (!rows[0]?.locked) return { skipped: true };

      const cartCutoff = new Date(now.getTime() - GUEST_CART_TTL_DAYS * DAY_MS);
      const guestCarts = await tx.cart.deleteMany({
        where: { userId: null, lastActivityAt: { lt: cartCutoff } }, // CartItem xóa theo cascade
      });
      const expired = { expiresAt: { lt: now } };
      const refreshTokens = await tx.refreshToken.deleteMany({ where: expired });
      const passwordResetTokens = await tx.passwordResetToken.deleteMany({ where: expired });
      const emailVerificationTokens = await tx.emailVerificationToken.deleteMany({
        where: expired,
      });
      return {
        skipped: false,
        guestCarts: guestCarts.count,
        refreshTokens: refreshTokens.count,
        passwordResetTokens: passwordResetTokens.count,
        emailVerificationTokens: emailVerificationTokens.count,
      };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  if (result.skipped) {
    logger.debug('Job dọn dẹp: instance khác đang chạy, bỏ qua');
  } else {
    logger.info(
      `Job dọn dẹp: xóa ${result.guestCarts} giỏ guest, ${result.refreshTokens} refresh token, ` +
        `${result.passwordResetTokens} token đặt lại mật khẩu, ` +
        `${result.emailVerificationTokens} token xác minh email`,
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// Job hết hạn thanh toán (api-contract §13.6, D-015)

export interface ExpiredOrder {
  id: string;
  code: string;
  userId: string | null;
  contactEmail: string;
  /** Checkout Session Stripe của các Payment PENDING vừa đặt FAILED (để expire phiên sau commit). */
  stripeSessionIds: string[];
}

export type ExpirePaymentsResult =
  { skipped: true } | { skipped: false; cancelled: ExpiredOrder[]; errors: number };

const EXPIRE_REASON = 'Quá hạn thanh toán';

/** Hủy 1 đơn trong transaction riêng; trả null nếu đã đổi trạng thái/được gia hạn. */
async function expireOneOrder(orderId: string, now: Date): Promise<ExpiredOrder | null> {
  return prisma.$transaction(
    async (tx) => {
      // Khóa Order rồi Payment (cùng thứ tự với applyPaymentResult).
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          code: true,
          userId: true,
          contactEmail: true,
          status: true,
          paymentStatus: true,
          expiresAt: true,
        },
      });
      if (
        !order ||
        order.status !== 'PENDING_PAYMENT' ||
        order.paymentStatus === 'PAID' ||
        !order.expiresAt ||
        order.expiresAt.getTime() >= now.getTime()
      ) {
        return null;
      }
      await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "orderId" = ${orderId} AND "status" = 'PENDING' ORDER BY "id" FOR UPDATE`;
      await cancelOrderTx(tx, {
        orderId,
        from: 'PENDING_PAYMENT',
        actor: 'SYSTEM',
        actorId: null,
        reason: EXPIRE_REASON,
        now,
      });
      const pending = await tx.payment.findMany({
        where: { orderId, status: 'PENDING' },
        select: { id: true, provider: true, providerRef: true },
      });
      if (pending.length > 0) {
        await tx.payment.updateMany({
          where: { id: { in: pending.map((p) => p.id) }, status: 'PENDING' },
          data: { status: 'FAILED' },
        });
      }
      return {
        id: order.id,
        code: order.code,
        userId: order.userId,
        contactEmail: order.contactEmail,
        stripeSessionIds: pending
          .filter((p) => p.provider === 'STRIPE' && p.providerRef)
          .map((p) => p.providerRef as string),
      };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

/**
 * Hủy tối đa 50 đơn PENDING_PAYMENT có expiresAt < now (kể cả paymentStatus FAILED).
 * Advisory lock giữ trong 1 transaction "khóa" (không đụng dòng nào) suốt lượt chạy; mỗi đơn xử lý
 * trong transaction riêng nên lỗi một đơn không chặn đơn khác.
 */
export async function runExpirePendingPaymentsOnce(
  now: Date = new Date(),
): Promise<ExpirePaymentsResult> {
  return prisma.$transaction(
    async (lockTx): Promise<ExpirePaymentsResult> => {
      const rows = await lockTx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${EXPIRE_PAYMENTS_LOCK_KEY}::bigint) AS locked`;
      if (!rows[0]?.locked) return { skipped: true };

      const candidates = await lockTx.order.findMany({
        where: { status: 'PENDING_PAYMENT', expiresAt: { lt: now } },
        orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
        take: EXPIRE_BATCH_SIZE,
        select: { id: true },
      });

      const cancelled: ExpiredOrder[] = [];
      let errors = 0;
      for (const { id } of candidates) {
        try {
          const done = await expireOneOrder(id, now);
          if (done) cancelled.push(done);
        } catch (err) {
          errors++;
          logger.error({ err, orderId: id }, 'Hủy đơn quá hạn thanh toán thất bại');
        }
      }
      return { skipped: false, cancelled, errors };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

export interface AfterExpiredOptions {
  paymentConfig?: PaymentConfig;
  /** HTTP client Stripe (test tiêm bản giả). */
  stripeHttp?: StripeHttp | undefined;
}

/**
 * Hook sau commit các đơn đã hủy vì quá hạn: gửi email hủy (§13.9) và best-effort expire phiên
 * Stripe còn mở (§13.6). Không bao giờ ném lỗi; lỗi chỉ log, không retry.
 */
export async function afterOrdersExpired(
  orders: readonly ExpiredOrder[],
  opts: AfterExpiredOptions = {},
): Promise<void> {
  if (orders.length === 0) return;
  logger.info(`Job hết hạn thanh toán: đã hủy ${orders.length} đơn`);
  let http: StripeHttp | null | undefined = opts.stripeHttp;
  for (const o of orders) {
    try {
      const row = await prisma.order.findUnique({ where: { id: o.id } });
      if (row) notifyOrderStatusChange(row);
    } catch (err) {
      logger.error({ err, orderId: o.id }, 'Gửi email hủy đơn quá hạn thất bại');
    }
    for (const sessionId of o.stripeSessionIds) {
      try {
        http ??= defaultStripeHttp((opts.paymentConfig ?? getPaymentConfig()).stripe);
        if (!http) continue;
        await expireSession(http, sessionId);
      } catch (err) {
        logger.warn({ err, orderId: o.id, sessionId }, 'Expire phiên Stripe thất bại (bỏ qua)');
      }
    }
  }
}

async function safeRunExpire(): Promise<void> {
  try {
    const r = await runExpirePendingPaymentsOnce();
    if (!r.skipped) await afterOrdersExpired(r.cancelled);
  } catch (err) {
    logger.error({ err }, 'Job hết hạn thanh toán thất bại');
  }
}

async function safeRun(): Promise<void> {
  try {
    await runCleanupOnce();
  } catch (err) {
    logger.error({ err }, 'Job dọn dẹp thất bại');
  }
}

/** Dọn dẹp: 1 lần sau ~30 giây, rồi mỗi 60 phút; hết hạn thanh toán: mỗi 60 giây. Trả hàm dừng. Không giữ process sống (unref). */
export function startBackgroundJobs(): () => void {
  const first = setTimeout(() => void safeRun(), FIRST_RUN_DELAY_MS);
  first.unref();
  const timer = setInterval(() => void safeRun(), INTERVAL_MS);
  timer.unref();
  const expireTimer = setInterval(() => void safeRunExpire(), EXPIRE_INTERVAL_MS);
  expireTimer.unref();
  logger.info(`Đã bật job nền (JOBS_ENABLED=${String(env.JOBS_ENABLED)})`);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
    clearInterval(expireTimer);
  };
}
