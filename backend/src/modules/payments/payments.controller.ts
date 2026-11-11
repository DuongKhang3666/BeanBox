import type { Request } from 'express';
import type { PaymentConfig } from '../../config/payments.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { applyPaymentResult } from './payments.apply.js';
import type { CreatePaymentBody, StripeSyncBody } from './payments.schema.js';
import * as service from './payments.service.js';
import { handleStripeEvent, stripeHttpOf, syncStripeSession } from './payments.stripe.js';
import { verifyStripeSignature } from './stripe.js';
import { isVnpaySuccess, stripVnpaySignature, verifyVnpay } from './vnpay.js';

const configOf = (req: Request): PaymentConfig => req.app.locals.paymentConfig as PaymentConfig;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export const createVnpay = asyncHandler(async (req, res) => {
  const body = req.body as CreatePaymentBody;
  const data = await service.createPaymentForOrder(
    'VNPAY',
    { code: body.code, phone: body.phone, userId: req.auth?.userId ?? null },
    req.ip ?? '',
    { paymentConfig: configOf(req) },
  );
  res.json({ data });
});

export const createStripe = asyncHandler(async (req, res) => {
  const body = req.body as CreatePaymentBody;
  const config = configOf(req);
  const data = await service.createPaymentForOrder(
    'STRIPE',
    { code: body.code, phone: body.phone, userId: req.auth?.userId ?? null },
    req.ip ?? '',
    { paymentConfig: config, stripeHttp: stripeHttpOf(req, config) ?? undefined },
  );
  res.json({ data });
});

/** POST /payments/stripe/webhook: nhận RAW body (Buffer) để chữ ký tính trên đúng byte gốc (§13.4). */
export const stripeWebhook = asyncHandler(async (req, res) => {
  const secret = configOf(req).stripe?.webhookSecret ?? null;
  if (!secret) {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Webhook Stripe chưa được cấu hình');
  }
  const raw: unknown = req.body;
  const header = req.headers['stripe-signature'];
  if (
    !Buffer.isBuffer(raw) ||
    !verifyStripeSignature(raw, typeof header === 'string' ? header : undefined, secret)
  ) {
    throw new AppError(400, 'PAYMENT_SIGNATURE_INVALID', 'Chữ ký thanh toán không hợp lệ');
  }
  await handleStripeEvent(raw);
  res.json({ received: true });
});

export const stripeSync = asyncHandler(async (req, res) => {
  const config = configOf(req);
  const http = stripeHttpOf(req, config);
  if (!http) {
    throw new AppError(409, 'PAYMENT_NOT_ALLOWED', 'Không thể thanh toán đơn hàng này', {
      reason: 'UNAVAILABLE',
    });
  }
  const body = req.body as StripeSyncBody;
  res.json({ data: await syncStripeSession(body.sessionId, http, config) });
});

type IpnBody = { RspCode: string; Message: string };
const ipn = (RspCode: string, Message: string): IpnBody => ({ RspCode, Message });

/** GET /payments/vnpay/ipn: luôn HTTP 200 (§13.3). Không log query (chứa chữ ký). */
export const vnpayIpn = asyncHandler(async (req, res) => {
  const vnpay = configOf(req).vnpay;
  try {
    if (!vnpay || !verifyVnpay(req.query, vnpay.hashSecret)) {
      res.json(ipn('97', 'Invalid signature'));
      return;
    }
    const payment = await service.findVnpayPayment(str(req.query.vnp_TxnRef));
    if (!payment) {
      res.json(ipn('01', 'Order not found'));
      return;
    }
    if (str(req.query.vnp_Amount) !== String(payment.amount * 100)) {
      res.json(ipn('04', 'Invalid amount'));
      return;
    }
    const applied = await applyPaymentResult({
      provider: 'VNPAY',
      paymentId: payment.id,
      outcome: isVnpaySuccess(req.query) ? 'SUCCEEDED' : 'FAILED',
      providerTxnId: str(req.query.vnp_TransactionNo) || null,
      rawPayload: stripVnpaySignature(req.query),
    });
    if (applied.kind === 'NOT_FOUND') {
      res.json(ipn('01', 'Order not found'));
      return;
    }
    void service.afterPaymentApplied(applied);
    res.json(
      applied.kind === 'APPLIED'
        ? ipn('00', 'Confirm Success')
        : ipn('02', 'Order already confirmed'),
    );
  } catch (err) {
    logger.error({ err }, 'Xử lý IPN VNPay thất bại');
    res.json(ipn('99', 'Unknown error'));
  }
});

/** GET /payments/vnpay/return: trang kết quả FE chuyển nguyên query vnp_* (§13.3). */
export const vnpayReturn = asyncHandler(async (req, res) => {
  const config = configOf(req);
  const vnpay = config.vnpay;
  if (!vnpay || !verifyVnpay(req.query, vnpay.hashSecret)) {
    throw new AppError(400, 'PAYMENT_SIGNATURE_INVALID', 'Chữ ký thanh toán không hợp lệ');
  }
  const payment = await service.findVnpayPayment(str(req.query.vnp_TxnRef));
  if (!payment) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy giao dịch');
  if (str(req.query.vnp_Amount) !== String(payment.amount * 100)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [
      { field: 'vnp_Amount', message: 'Số tiền không khớp' },
    ]);
  }
  const applied = await applyPaymentResult({
    provider: 'VNPAY',
    paymentId: payment.id,
    outcome: isVnpaySuccess(req.query) ? 'SUCCEEDED' : 'FAILED',
    providerTxnId: str(req.query.vnp_TransactionNo) || null,
    rawPayload: stripVnpaySignature(req.query),
  });
  if (applied.kind === 'NOT_FOUND')
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy giao dịch');
  void service.afterPaymentApplied(applied);
  res.json({ data: service.toPaymentResult(applied, config) });
});
