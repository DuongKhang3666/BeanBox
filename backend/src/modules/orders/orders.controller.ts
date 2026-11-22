import type { Request, RequestHandler } from 'express';
import type { PaymentConfig } from '../../config/payments.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import type { CaptchaConfig, TurnstileVerifier } from '../../lib/turnstile.js';
import type { StripeHttp } from '../payments/stripe.js';
import { identityOf } from '../cart/cart.controller.js';
import type {
  CancelOrderInput,
  CreateOrderInput,
  MyOrdersQuery,
  TrackOrderQuery,
} from './orders.schema.js';
import * as service from './orders.service.js';
import * as bankTransfer from '../payments/bankTransfer.js';
import type { BankTransferOwnerInput } from '../payments/bankTransfer.schema.js';

const paymentConfigOf = (req: Request): PaymentConfig =>
  req.app.locals.paymentConfig as PaymentConfig;

/** UUID v4, không phân biệt hoa thường. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Kiểm header TRƯỚC khi parse body. Lưu key (lowercase) vào res.locals. */
export const requireIdempotencyKey: RequestHandler = (req, res, next) => {
  const raw = req.get('idempotency-key')?.trim();
  if (!raw || !UUID_V4.test(raw)) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu không hợp lệ',
        details: [
          { field: 'Idempotency-Key', message: 'Idempotency-Key phải là UUID phiên bản 4' },
        ],
      },
    });
    return;
  }
  res.locals.idempotencyKey = raw.toLowerCase();
  next();
};

export const createOrder = asyncHandler(async (req, res) => {
  // Captcha tùy chọn (D-057): bật khi cấu hình Turnstile (cùng cơ chế với form liên hệ, D-028).
  const config = req.app.locals.captchaConfig as CaptchaConfig | null | undefined;
  const verify = req.app.locals.captchaVerify as TurnstileVerifier | undefined;
  const result = await service.placeOrder({
    identity: identityOf(req),
    idempotencyKey: res.locals.idempotencyKey as string,
    input: req.body as CreateOrderInput,
    paymentConfig: paymentConfigOf(req),
    captcha: config && verify ? { verify } : null,
  });
  res.status(result.created ? 201 : 200).json({ data: result.order });
});

export const getOrder = asyncHandler(async (req, res) => {
  const order = await service.getOrderForUser(String(req.params.code ?? ''), req.auth!.userId, {
    paymentConfig: paymentConfigOf(req),
  });
  res.json({ data: order });
});

export const trackOrder = asyncHandler(async (req, res) => {
  const q = req.query as unknown as TrackOrderQuery;
  res.json({
    data: await service.trackOrder(q.code, q.phone, { paymentConfig: paymentConfigOf(req) }),
  });
});

export const cancelOrder = asyncHandler(async (req, res) => {
  const order = await service.cancelOrderForCustomer({
    rawCode: String(req.params.code ?? ''),
    userId: req.auth?.userId ?? null,
    input: req.body as CancelOrderInput,
    paymentConfig: paymentConfigOf(req),
    stripeHttp: req.app.locals.stripeHttp as StripeHttp | undefined,
  });
  res.json({ data: order });
});

export const listMyOrders = asyncHandler(async (req, res) => {
  const result = await service.listMyOrders(
    req.auth!.userId,
    req.query as unknown as MyOrdersQuery,
  );
  res.json(result);
});

export const getBankTransfer = asyncHandler(async (req, res) => {
  const q = req.query as BankTransferOwnerInput;
  const data = await bankTransfer.getBankTransferInstructions(
    { code: String(req.params.code ?? ''), phone: q.phone, userId: req.auth?.userId ?? null },
    paymentConfigOf(req),
  );
  res.json({ data });
});

export const claimBankTransfer = asyncHandler(async (req, res) => {
  const body = req.body as BankTransferOwnerInput;
  const data = await bankTransfer.claimBankTransfer(
    { code: String(req.params.code ?? ''), phone: body.phone, userId: req.auth?.userId ?? null },
    paymentConfigOf(req),
  );
  res.json({ data });
});
