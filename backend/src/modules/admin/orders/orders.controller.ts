import type { Request } from 'express';
import type { PaymentConfig } from '../../../config/payments.js';
import { asyncHandler } from '../../../lib/asyncHandler.js';
import type {
  AdminOrdersQuery,
  RefundPaymentInput,
  UpdateOrderStatusInput,
} from './orders.schema.js';
import type { StripeHttp } from '../../payments/stripe.js';
import * as service from './orders.service.js';

const stripeOf = (req: Request) => ({
  paymentConfig: req.app.locals.paymentConfig as PaymentConfig | undefined,
  stripeHttp: req.app.locals.stripeHttp as StripeHttp | undefined,
});

export const listOrders = asyncHandler(async (req, res) => {
  res.json(await service.listOrders(req.query as unknown as AdminOrdersQuery));
});

export const getOrder = asyncHandler(async (req, res) => {
  const data = await service.getOrder(String(req.params.code ?? ''), req.auth!.role as 'STAFF');
  res.json({ data });
});

export const updateStatus = asyncHandler(async (req, res) => {
  const data = await service.updateOrderStatus({
    rawCode: String(req.params.code ?? ''),
    input: req.body as UpdateOrderStatusInput,
    actorId: req.auth!.userId,
    role: req.auth!.role as 'STAFF' | 'ADMIN',
    ip: req.ip ?? null,
    stripe: stripeOf(req),
  });
  res.json({ data });
});

export const refundPayment = asyncHandler(async (req, res) => {
  const data = await service.refundPayment({
    rawCode: String(req.params.code ?? ''),
    input: req.body as RefundPaymentInput,
    actorId: req.auth!.userId,
    ip: req.ip ?? null,
  });
  res.json({ data });
});
