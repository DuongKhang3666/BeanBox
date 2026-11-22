import type { PaymentConfig } from '../../config/payments.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { applyPaymentResult, type ApplyPaymentResult } from './payments.apply.js';
import * as service from './payments.service.js';
import { MOMO_RESULT_KEYS, MOMO_RESULT_OK, pickMomoParams, verifyMomo } from './momo.js';
import { isVnpaySuccess, stripVnpaySignature, verifyVnpay } from './vnpay.js';

/**
 * Xử lý IPN dùng chung giữa cổng thật/sandbox và cổng giả (D-060): cổng giả KHÔNG có đường tắt
 * cập nhật DB, nó dựng bộ tham số có chữ ký rồi gọi đúng các hàm này.
 */

export type IpnBody = { RspCode: string; Message: string };
const ipn = (RspCode: string, Message: string): IpnBody => ({ RspCode, Message });

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** VNPay IPN (api-contract §13.3). Không ném lỗi: mọi trường hợp trả RspCode. */
export async function handleVnpayIpn(
  query: Record<string, unknown>,
  config: PaymentConfig,
): Promise<IpnBody> {
  const vnpay = config.vnpay;
  try {
    if (!vnpay || !verifyVnpay(query, vnpay.hashSecret)) return ipn('97', 'Invalid signature');
    const payment = await service.findVnpayPayment(str(query.vnp_TxnRef));
    if (!payment) return ipn('01', 'Order not found');
    if (str(query.vnp_Amount) !== String(payment.amount * 100)) return ipn('04', 'Invalid amount');
    const applied = await applyPaymentResult({
      provider: 'VNPAY',
      paymentId: payment.id,
      outcome: isVnpaySuccess(query) ? 'SUCCEEDED' : 'FAILED',
      providerTxnId: str(query.vnp_TransactionNo) || null,
      rawPayload: stripVnpaySignature(query),
    });
    if (applied.kind === 'NOT_FOUND') return ipn('01', 'Order not found');
    void service.afterPaymentApplied(applied);
    return applied.kind === 'APPLIED'
      ? ipn('00', 'Confirm Success')
      : ipn('02', 'Order already confirmed');
  } catch (err) {
    logger.error({ err }, 'Xử lý IPN VNPay thất bại');
    return ipn('99', 'Unknown error');
  }
}

export type MomoIpnOutcome =
  | { ok: true; applied: ApplyPaymentResult }
  | { ok: false; reason: 'SIGNATURE' | 'NOT_FOUND' | 'AMOUNT' | 'ERROR' };

/** MoMo (giả) IPN: kiểm chữ ký -> đối chiếu số tiền -> `applyPaymentResult` (idempotent). */
export async function handleMomoIpn(
  body: Record<string, unknown>,
  config: PaymentConfig,
): Promise<MomoIpnOutcome> {
  const momo = config.momo;
  try {
    const params = pickMomoParams(body, MOMO_RESULT_KEYS);
    if (!momo || !params || !verifyMomo(params, momo.secret))
      return { ok: false, reason: 'SIGNATURE' };
    const payment = await service.findMomoPayment(params.orderId ?? '');
    if (!payment) return { ok: false, reason: 'NOT_FOUND' };
    if (params.amount !== String(payment.amount)) return { ok: false, reason: 'AMOUNT' };
    const { signature: _signature, ...raw } = params;
    void _signature;
    const applied = await applyPaymentResult({
      provider: 'MOMO',
      paymentId: payment.id,
      outcome: params.resultCode === MOMO_RESULT_OK ? 'SUCCEEDED' : 'FAILED',
      providerTxnId: params.resultCode === MOMO_RESULT_OK ? params.transId || null : null,
      rawPayload: raw,
    });
    if (applied.kind === 'NOT_FOUND') return { ok: false, reason: 'NOT_FOUND' };
    void service.afterPaymentApplied(applied);
    return { ok: true, applied };
  } catch (err) {
    logger.error({ err }, 'Xử lý IPN MoMo thất bại');
    return { ok: false, reason: 'ERROR' };
  }
}

/** Trạng thái hiện tại của một Payment (cho trang kết quả MoMo: chỉ đọc DB, không áp kết quả). */
export async function loadPaymentApplied(paymentId: string): Promise<ApplyPaymentResult> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
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
  if (!payment) {
    return {
      kind: 'NOT_FOUND',
      paymentStatus: null,
      order: null,
      confirmedOrder: null,
      late: false,
    };
  }
  return {
    kind: 'DUPLICATE',
    paymentStatus: payment.status,
    order: payment.order,
    confirmedOrder: null,
    late: false,
  };
}

export function momoIpnError(reason: 'SIGNATURE' | 'NOT_FOUND' | 'AMOUNT' | 'ERROR'): AppError {
  switch (reason) {
    case 'SIGNATURE':
      return new AppError(400, 'PAYMENT_SIGNATURE_INVALID', 'Chữ ký thanh toán không hợp lệ');
    case 'NOT_FOUND':
      return new AppError(404, 'NOT_FOUND', 'Không tìm thấy giao dịch');
    case 'AMOUNT':
      return new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [
        { field: 'amount', message: 'Số tiền không khớp' },
      ]);
    default:
      return new AppError(500, 'INTERNAL_ERROR', 'Lỗi hệ thống');
  }
}
