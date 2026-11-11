import type { Request } from 'express';
import type { PaymentConfig } from '../../config/payments.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { applyPaymentResult, type ApplyPaymentResult } from './payments.apply.js';
import * as service from './payments.service.js';
import {
  defaultStripeHttp,
  parseStripeSession,
  retrieveSession,
  stripeRawPayload,
  type StripeHttp,
  type StripeSession,
} from './stripe.js';

/** Xử lý webhook / sync Stripe (api-contract §13.4). Đối chiếu chặt trước khi gọi applyPaymentResult. */

/** Stripe chưa cấu hình -> null (kể cả khi test đã tiêm http giả). */
export const stripeHttpOf = (req: Request, config: PaymentConfig): StripeHttp | null =>
  config.stripe
    ? ((req.app.locals.stripeHttp as StripeHttp | undefined) ?? defaultStripeHttp(config.stripe))
    : null;

export type StripeOutcome = 'SUCCEEDED' | 'FAILED';

/** Sự kiện webhook -> kết quả; null = bỏ qua (chờ sự kiện async hoặc loại khác). */
export function outcomeForEvent(type: string, session: StripeSession): StripeOutcome | null {
  switch (type) {
    case 'checkout.session.completed':
      return session.paymentStatus === 'paid' ? 'SUCCEEDED' : null;
    case 'checkout.session.async_payment_succeeded':
      return 'SUCCEEDED';
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
      return 'FAILED';
    default:
      return null;
  }
}

/**
 * Tìm Payment khớp phiên: id theo client_reference_id / metadata.paymentId, provider STRIPE,
 * providerRef = session.id, currency vnd, amount_total = amount. Không khớp -> null.
 */
export async function matchStripePayment(
  session: StripeSession,
): Promise<{ id: string; amount: number } | null> {
  const ids = [session.clientReferenceId, session.metadataPaymentId].filter(
    (v): v is string => v !== null,
  );
  const paymentId = ids[0];
  if (!paymentId || ids.some((v) => v !== paymentId) || paymentId.length > 64) return null;
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, provider: true, providerRef: true, amount: true },
  });
  if (
    !payment ||
    payment.provider !== 'STRIPE' ||
    payment.providerRef !== session.id ||
    session.currency !== 'vnd' ||
    session.amountTotal !== payment.amount
  ) {
    return null;
  }
  return { id: payment.id, amount: payment.amount };
}

export type WebhookOutcome = 'IGNORED' | 'MISMATCH' | 'APPLIED' | 'DUPLICATE';

/** POST /payments/stripe/webhook sau khi chữ ký hợp lệ. Luôn trả để controller đáp 200. */
export async function handleStripeEvent(rawBody: Buffer): Promise<WebhookOutcome> {
  let event: unknown;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'Nội dung JSON không hợp lệ');
  }
  const e = event as { type?: unknown; data?: { object?: unknown } } | null;
  const type = typeof e?.type === 'string' ? e.type : '';
  const session = parseStripeSession(e?.data?.object);
  if (!session) return 'IGNORED';
  const outcome = outcomeForEvent(type, session);
  if (!outcome) return 'IGNORED';

  const payment = await matchStripePayment(session);
  if (!payment) {
    logger.warn({ type, sessionId: session.id }, 'Webhook Stripe không khớp Payment, bỏ qua');
    return 'MISMATCH';
  }
  const applied = await applyPaymentResult({
    provider: 'STRIPE',
    paymentId: payment.id,
    outcome,
    providerTxnId: outcome === 'SUCCEEDED' ? session.paymentIntent : null,
    rawPayload: stripeRawPayload(session),
  });
  if (applied.kind === 'NOT_FOUND') return 'MISMATCH';
  void service.afterPaymentApplied(applied);
  return applied.kind === 'APPLIED' ? 'APPLIED' : 'DUPLICATE';
}

/** POST /payments/stripe/sync: tự hỏi Stripe (server-to-server), không tin dữ liệu từ client. */
export async function syncStripeSession(
  sessionId: string,
  http: StripeHttp,
  config: PaymentConfig,
): Promise<ReturnType<typeof service.toPaymentResult>> {
  const notFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy giao dịch');
  // Chỉ gọi Stripe cho phiên do hệ thống tạo (tránh dùng endpoint làm proxy dò phiên bất kỳ).
  const known = await prisma.payment.findFirst({
    where: { provider: 'STRIPE', providerRef: sessionId },
    select: { id: true },
  });
  if (!known) throw notFound();

  let session: StripeSession;
  try {
    session = await retrieveSession(http, sessionId);
  } catch (err) {
    logger.error({ err, sessionId }, 'Lấy phiên Stripe thất bại');
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Cổng thanh toán tạm thời không khả dụng');
  }

  const payment = await matchStripePayment(session);
  if (!payment) {
    logger.warn({ sessionId }, 'Phiên Stripe không khớp Payment, bỏ qua');
    throw notFound();
  }

  const outcome: StripeOutcome | null =
    session.paymentStatus === 'paid' ? 'SUCCEEDED' : session.status === 'expired' ? 'FAILED' : null;

  let applied: ApplyPaymentResult;
  if (outcome) {
    applied = await applyPaymentResult({
      provider: 'STRIPE',
      paymentId: payment.id,
      outcome,
      providerTxnId: outcome === 'SUCCEEDED' ? session.paymentIntent : null,
      rawPayload: stripeRawPayload(session),
    });
    if (applied.kind === 'NOT_FOUND') throw notFound();
    void service.afterPaymentApplied(applied);
  } else {
    // Chưa thanh toán, chưa hết hạn: chỉ báo trạng thái hiện tại (thường PENDING).
    const row = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      select: {
        status: true,
        order: {
          select: {
            id: true,
            code: true,
            userId: true,
            status: true,
            paymentStatus: true,
            paymentMethod: true,
            expiresAt: true,
          },
        },
      },
    });
    applied = {
      kind: 'DUPLICATE',
      paymentStatus: row.status,
      order: row.order,
      confirmedOrder: null,
      late: false,
    };
  }
  return service.toPaymentResult(applied, config);
}
