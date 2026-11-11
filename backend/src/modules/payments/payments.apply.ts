import type {
  OrderStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  PaymentTxnStatus,
  Prisma,
} from '@prisma/client';
import { writeAudit } from '../../lib/audit.js';
import { canTransition } from '../../lib/orderStateMachine.js';
import { prisma } from '../../lib/prisma.js';

/**
 * Hàm xử lý kết quả thanh toán chung (api-contract §13.5). Dùng cho VNPay IPN/return và (task sau)
 * Stripe webhook/sync. Idempotent; 1 transaction; khóa Order FOR UPDATE rồi Payment FOR UPDATE.
 */

export type PaymentOutcome = 'SUCCEEDED' | 'FAILED';

export interface ApplyPaymentInput {
  provider: PaymentProvider;
  paymentId: string;
  outcome: PaymentOutcome;
  /** vnp_TransactionNo / Stripe payment_intent; chỉ lưu khi thành công. */
  providerTxnId?: string | null;
  /** Đã bỏ trường chữ ký. */
  rawPayload: Record<string, unknown>;
  now?: Date;
}

export type PaymentTransition = 'APPLY' | 'DUPLICATE' | 'IGNORE';

/** Máy trạng thái Payment: PENDING -> SUCCEEDED|FAILED; FAILED -> SUCCEEDED; SUCCEEDED -> REFUNDED (admin). */
export function decidePaymentTransition(
  current: PaymentTxnStatus,
  outcome: PaymentOutcome,
): PaymentTransition {
  if (current === 'PENDING') return 'APPLY';
  if (current === 'FAILED') return outcome === 'SUCCEEDED' ? 'APPLY' : 'DUPLICATE';
  // SUCCEEDED / REFUNDED: kết quả thành công trùng; thất bại đến sau bị bỏ qua.
  return outcome === 'SUCCEEDED' ? 'DUPLICATE' : 'IGNORE';
}

export interface AppliedOrderSnapshot {
  id: string;
  code: string;
  userId: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  expiresAt: Date | null;
}

export interface ApplyPaymentResult {
  /** APPLIED = đã thay đổi; DUPLICATE = trùng, không đổi gì; IGNORED = chuyển trạng thái không hợp lệ. */
  kind: 'APPLIED' | 'DUPLICATE' | 'IGNORED' | 'NOT_FOUND';
  /** Trạng thái Payment sau xử lý. */
  paymentStatus: PaymentTxnStatus | null;
  order: AppliedOrderSnapshot | null;
  /** Đơn vừa chuyển PENDING_PAYMENT -> CONFIRMED trong lần gọi này (caller gửi email sau commit). */
  confirmedOrder: { id: string; code: string } | null;
  /** Thành công muộn / trả trùng: đơn không đổi trạng thái, cần hoàn tiền. */
  late: boolean;
}

const methodLabel: Record<string, string> = { VNPAY: 'VNPay', STRIPE: 'Stripe' };

const notFound = (): ApplyPaymentResult => ({
  kind: 'NOT_FOUND',
  paymentStatus: null,
  order: null,
  confirmedOrder: null,
  late: false,
});

export async function applyPaymentResult(input: ApplyPaymentInput): Promise<ApplyPaymentResult> {
  const now = input.now ?? new Date();

  const pre = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    select: { orderId: true, provider: true },
  });
  if (!pre || pre.provider !== input.provider) return notFound();

  return prisma.$transaction(
    async (tx): Promise<ApplyPaymentResult> => {
      // Thứ tự khóa cố định: Order rồi Payment (job hết hạn, hủy đơn dùng cùng thứ tự).
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${pre.orderId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${input.paymentId} FOR UPDATE`;
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: input.paymentId } });
      const order = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
        select: {
          id: true,
          code: true,
          userId: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          expiresAt: true,
          paidAt: true,
        },
      });
      const snapshot: AppliedOrderSnapshot = {
        id: order.id,
        code: order.code,
        userId: order.userId,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        expiresAt: order.expiresAt,
      };

      const decision = decidePaymentTransition(payment.status, input.outcome);
      if (decision !== 'APPLY') {
        return {
          kind: decision === 'DUPLICATE' ? 'DUPLICATE' : 'IGNORED',
          paymentStatus: payment.status,
          order: snapshot,
          confirmedOrder: null,
          late: false,
        };
      }

      const raw = input.rawPayload as Prisma.InputJsonObject;

      if (input.outcome === 'FAILED') {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED', rawPayload: raw },
        });
        let paymentStatus = order.paymentStatus;
        // D-001: đơn vẫn chờ tới hạn để thử lại; chỉ đánh dấu paymentStatus.
        if (order.status === 'PENDING_PAYMENT' && order.paymentStatus !== 'PAID') {
          await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED' } });
          paymentStatus = 'FAILED';
        }
        return {
          kind: 'APPLIED',
          paymentStatus: 'FAILED',
          order: { ...snapshot, paymentStatus },
          confirmedOrder: null,
          late: false,
        };
      }

      // Thành công.
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCEEDED',
          providerTxnId: input.providerTxnId ?? null,
          rawPayload: raw,
        },
      });

      if (
        order.status === 'PENDING_PAYMENT' &&
        order.paymentStatus !== 'PAID' &&
        canTransition('PENDING_PAYMENT', 'CONFIRMED', 'SYSTEM')
      ) {
        const moved = await tx.order.updateMany({
          where: { id: order.id, status: 'PENDING_PAYMENT' },
          data: { status: 'CONFIRMED', paymentStatus: 'PAID', paidAt: now, confirmedAt: now },
        });
        if (moved.count === 1) {
          await tx.orderStatusHistory.create({
            data: {
              orderId: order.id,
              fromStatus: 'PENDING_PAYMENT',
              toStatus: 'CONFIRMED',
              note: `Thanh toán ${methodLabel[payment.provider] ?? payment.provider} thành công`,
              actorId: null,
            },
          });
          return {
            kind: 'APPLIED',
            paymentStatus: 'SUCCEEDED',
            order: { ...snapshot, status: 'CONFIRMED', paymentStatus: 'PAID' },
            confirmedOrder: { id: order.id, code: order.code },
            late: false,
          };
        }
      }

      // Thanh toán muộn (đơn CANCELLED...) hoặc trả trùng (đã PAID bởi Payment khác): không đổi trạng thái đơn.
      let paymentStatus = order.paymentStatus;
      if (order.paymentStatus !== 'PAID' && order.paymentStatus !== 'REFUNDED') {
        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: 'PAID', ...(order.paidAt ? {} : { paidAt: now }) },
        });
        paymentStatus = 'PAID';
      }
      await writeAudit(tx, {
        actorId: null,
        action: 'payment.late',
        entity: 'Order',
        entityId: order.id,
        diff: {
          paymentId: [null, payment.id],
          provider: [null, payment.provider],
          amount: [null, payment.amount],
          orderStatus: [null, order.status],
          orderPaymentStatus: [order.paymentStatus, paymentStatus],
        },
      });
      return {
        kind: 'APPLIED',
        paymentStatus: 'SUCCEEDED',
        order: { ...snapshot, paymentStatus },
        confirmedOrder: null,
        late: true,
      };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}
