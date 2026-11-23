import type { Request } from 'express';
import type { PaymentConfig } from '../../../config/payments.js';
import { asyncHandler } from '../../../lib/asyncHandler.js';
import type {
  AddOrderNoteInput,
  AdminOrdersQuery,
  PrintOrdersQuery,
  RefundPaymentInput,
  UpdateOrderStatusInput,
} from './orders.schema.js';
import type { StripeHttp } from '../../payments/stripe.js';
import * as notes from './orders.notes.js';
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

// D-061: Staff+ (như xác nhận thu tiền COD).
export const confirmBankTransfer = asyncHandler(async (req, res) => {
  const data = await service.confirmBankTransfer({
    rawCode: String(req.params.code ?? ''),
    actorId: req.auth!.userId,
    role: req.auth!.role as 'STAFF' | 'ADMIN',
    ip: req.ip ?? null,
  });
  res.json({ data });
});

// D-071: ghi chú nội bộ.
export const listNotes = asyncHandler(async (req, res) => {
  res.json({ data: await notes.listNotes(String(req.params.code ?? '')) });
});

export const addNote = asyncHandler(async (req, res) => {
  const data = await notes.addNote({
    rawCode: String(req.params.code ?? ''),
    input: req.body as AddOrderNoteInput,
    actorId: req.auth!.userId,
    ip: req.ip ?? null,
  });
  res.status(201).json({ data });
});

export const deleteNote = asyncHandler(async (req, res) => {
  await notes.deleteNote({
    rawCode: String(req.params.code ?? ''),
    noteId: String(req.params.noteId ?? ''),
    actorId: req.auth!.userId,
    ip: req.ip ?? null,
  });
  res.status(204).end();
});

// D-072: dữ liệu in hàng loạt (chỉ đọc).
export const printOrders = asyncHandler(async (req, res) => {
  const { codes } = req.query as unknown as PrintOrdersQuery;
  const { data, missing } = await notes.printOrders(codes, req.auth!.role as 'STAFF');
  res.json({ data, meta: { missing } });
});
