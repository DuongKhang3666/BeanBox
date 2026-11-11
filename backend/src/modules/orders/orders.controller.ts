import type { Request, RequestHandler } from 'express';
import type { PaymentConfig } from '../../config/payments.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { identityOf } from '../cart/cart.controller.js';
import type {
  CancelOrderInput,
  CreateOrderInput,
  MyOrdersQuery,
  TrackOrderQuery,
} from './orders.schema.js';
import * as service from './orders.service.js';

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
  const result = await service.placeOrder({
    identity: identityOf(req),
    idempotencyKey: res.locals.idempotencyKey as string,
    input: req.body as CreateOrderInput,
    paymentConfig: paymentConfigOf(req),
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
