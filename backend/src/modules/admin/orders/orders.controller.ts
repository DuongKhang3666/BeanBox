import { asyncHandler } from '../../../lib/asyncHandler.js';
import type {
  AdminOrdersQuery,
  RefundPaymentInput,
  UpdateOrderStatusInput,
} from './orders.schema.js';
import * as service from './orders.service.js';

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
