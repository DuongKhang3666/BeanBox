import type { PaymentProvider, Prisma } from '@prisma/client';
import { getPaymentConfig, type PaymentConfig } from '../../config/payments.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { normalizeOrderCode, ORDER_CODE_REGEX } from '../../lib/orderCode.js';
import { normalizePhone } from '../../lib/phone.js';
import { prisma } from '../../lib/prisma.js';
import { computeCanPay } from '../orders/orders.dto.js';
import type { ApplyPaymentResult } from './payments.apply.js';
import { notifyOrderStatusChange } from '../orders/orders.statusEmails.js';
import { ADAPTERS, type AdapterRegistry } from './payments.providers.js';
import type { StripeHttp } from './stripe.js';

export { applyPaymentResult } from './payments.apply.js';

/** Dịch vụ thanh toán (api-contract §13.2). Phần xử lý kết quả: `payments.apply.ts`. */

type Db = Prisma.TransactionClient;

export type NotAllowedReason = 'STATUS' | 'METHOD_MISMATCH' | 'EXPIRED' | 'UNAVAILABLE';

const orderNotFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy đơn hàng');

const notAllowed = (reason: NotAllowedReason) =>
  new AppError(409, 'PAYMENT_NOT_ALLOWED', 'Không thể thanh toán đơn hàng này', { reason });

export interface CreatePaymentInput {
  code: string;
  /** Bắt buộc khi không đăng nhập. */
  phone?: string | undefined;
  /** Có = đã đăng nhập. */
  userId?: string | null | undefined;
}

export interface CreatePaymentOptions {
  paymentConfig?: PaymentConfig;
  adapters?: AdapterRegistry;
  stripeHttp?: StripeHttp | undefined;
  now?: Date;
}

export interface CreatePaymentResult {
  redirectUrl: string;
  paymentId: string;
  expiresAt: string;
}

/**
 * Tạo phiên thanh toán cho đơn. Quyền như hủy đơn (§9.4): chủ đơn, hoặc đơn guest + SĐT khớp;
 * mọi trường hợp khác -> 404. Điều kiện: PENDING_PAYMENT, đúng phương thức, còn hạn, đang bật.
 */
export async function createPaymentForOrder(
  provider: PaymentProvider,
  input: CreatePaymentInput,
  ip: string,
  opts: CreatePaymentOptions = {},
): Promise<CreatePaymentResult> {
  const now = opts.now ?? new Date();
  const config = opts.paymentConfig ?? getPaymentConfig();
  const adapters = opts.adapters ?? ADAPTERS;
  const userId = input.userId ?? null;

  let guestPhone: string | null = null;
  if (!userId) {
    const normalized = input.phone ? normalizePhone(input.phone) : null;
    if (!normalized) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [
        {
          field: 'phone',
          message: input.phone
            ? 'Số điện thoại không hợp lệ'
            : 'Vui lòng nhập số điện thoại đặt hàng',
        },
      ]);
    }
    guestPhone = normalized;
  }

  const code = normalizeOrderCode(input.code);
  if (!ORDER_CODE_REGEX.test(code)) throw orderNotFound();

  const adapter = adapters[provider];

  const created = await prisma.$transaction(
    async (tx: Db) => {
      const found = await tx.order.findUnique({
        where: { code },
        select: { id: true, userId: true, contactPhone: true },
      });
      const owned = found
        ? userId
          ? found.userId === userId
          : found.userId === null && found.contactPhone === guestPhone
        : false;
      if (!found || !owned) throw orderNotFound();

      // Khóa Order rồi đọc lại: tránh tạo Payment cho đơn đang bị hủy/xác nhận đồng thời.
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${found.id} FOR UPDATE`;
      const order = await tx.order.findUniqueOrThrow({
        where: { id: found.id },
        select: {
          id: true,
          code: true,
          status: true,
          paymentMethod: true,
          expiresAt: true,
          grandTotal: true,
        },
      });

      if (order.status !== 'PENDING_PAYMENT') throw notAllowed('STATUS');
      if (order.paymentMethod !== provider) throw notAllowed('METHOD_MISMATCH');
      if (!order.expiresAt || order.expiresAt.getTime() <= now.getTime()) {
        throw notAllowed('EXPIRED');
      }
      if (!adapter || !adapter.isConfigured(config)) throw notAllowed('UNAVAILABLE');

      const payment = await tx.payment.create({
        data: { orderId: order.id, provider, amount: order.grandTotal, status: 'PENDING' },
        select: { id: true, amount: true },
      });
      return { payment, order: { ...order, expiresAt: order.expiresAt } };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  try {
    const session = await adapter!.createSession({
      payment: created.payment,
      order: {
        code: created.order.code,
        grandTotal: created.order.grandTotal,
        expiresAt: created.order.expiresAt,
      },
      ip,
      config,
      now,
      stripeHttp: opts.stripeHttp,
    });
    await prisma.payment.update({
      where: { id: created.payment.id },
      data: { providerRef: session.providerRef },
    });
    return {
      redirectUrl: session.redirectUrl,
      paymentId: created.payment.id,
      expiresAt: created.order.expiresAt.toISOString(),
    };
  } catch (err) {
    // Không lộ chi tiết nhà cung cấp; Payment vừa tạo đặt FAILED (§13.2).
    logger.error({ err, paymentId: created.payment.id, provider }, 'Tạo phiên thanh toán thất bại');
    await prisma.payment
      .updateMany({
        where: { id: created.payment.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      })
      .catch(() => undefined);
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Cổng thanh toán tạm thời không khả dụng');
  }
}

/** Payment của VNPay theo vnp_TxnRef (= Payment.id); không thấy -> null. */
export async function findVnpayPayment(txnRef: string) {
  if (!txnRef || txnRef.length > 64) return null;
  const payment = await prisma.payment.findUnique({
    where: { id: txnRef },
    select: { id: true, provider: true, amount: true, status: true },
  });
  return payment && payment.provider === 'VNPAY' ? payment : null;
}

// ---------------------------------------------------------------------------
// PaymentResult (§13.3) – không chứa PII

export interface PaymentResultDto {
  orderCode: string;
  result: 'SUCCEEDED' | 'FAILED' | 'PENDING';
  orderStatus: string;
  paymentStatus: string;
  canPay: boolean;
  expiresAt: string | null;
}

export function toPaymentResult(
  applied: ApplyPaymentResult,
  config: PaymentConfig,
  now: Date = new Date(),
): PaymentResultDto {
  const order = applied.order;
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy giao dịch');
  const result =
    applied.paymentStatus === 'FAILED'
      ? 'FAILED'
      : applied.paymentStatus === 'PENDING' || applied.paymentStatus === null
        ? 'PENDING'
        : 'SUCCEEDED'; // SUCCEEDED | REFUNDED
  return {
    orderCode: order.code,
    result,
    orderStatus: order.status,
    paymentStatus: order.paymentStatus,
    canPay: computeCanPay(order, { paymentConfig: config, now }),
    expiresAt: order.expiresAt ? order.expiresAt.toISOString() : null,
  };
}

/**
 * Hook sau commit của applyPaymentResult: khi đơn vừa CONFIRMED gửi email §13.9 (nền).
 * Không bao giờ ném lỗi; caller gọi `void afterPaymentApplied(...)` để không chờ.
 */
export async function afterPaymentApplied(applied: ApplyPaymentResult): Promise<void> {
  const confirmed = applied.confirmedOrder;
  if (!confirmed) return;
  logger.info({ orderCode: confirmed.code }, 'Đơn đã được xác nhận qua thanh toán');
  try {
    const row = await prisma.order.findUnique({ where: { id: confirmed.id } });
    // Trạng thái tại thời điểm thanh toán là CONFIRMED (đơn có thể đã được xử lý tiếp).
    if (row) notifyOrderStatusChange({ ...row, status: 'CONFIRMED' });
  } catch (err) {
    logger.error({ err, orderCode: confirmed.code }, 'Gửi email xác nhận thanh toán thất bại');
  }
}
