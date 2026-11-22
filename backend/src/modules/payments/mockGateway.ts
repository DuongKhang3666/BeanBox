import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { MOCK_VNPAY_TMN_CODE, type PaymentConfig } from '../../config/payments.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { AppError } from '../../lib/errors.js';
import { formatVnpayDate } from '../../lib/vnTime.js';
import { validate } from '../../middlewares/validate.js';
import { handleMomoIpn, handleVnpayIpn, momoIpnError } from './payments.ipn.js';
import {
  MOMO_REQUEST_KEYS,
  buildMomoIpn,
  buildMomoReturnUrl,
  fakeTransactionNo,
  pickMomoParams,
  verifyMomo,
  type MockChoice,
} from './momo.js';
import { signVnpay, verifyVnpay, vnpayQueryString, type VnpayParams } from './vnpay.js';

/**
 * Cổng thanh toán GIẢ cho demo (D-060). Router chỉ được mount khi PAYMENT_MOCKS_ENABLED.
 * Cổng giả không có đường tắt cập nhật DB: nó kiểm chữ ký yêu cầu, dựng bộ tham số callback có chữ ký
 * rồi gọi đúng hàm xử lý IPN thật (`handleVnpayIpn` / `handleMomoIpn`).
 */

const completeSchema = z.object({
  params: z
    .record(z.string().max(100), z.string().max(2000), { error: 'Tham số không hợp lệ' })
    .refine((o) => Object.keys(o).length <= 40, 'Quá nhiều tham số'),
  result: z.enum(['success', 'failed', 'cancel'], { error: 'Kết quả không hợp lệ' }),
});
type CompleteBody = z.infer<typeof completeSchema>;

const badSignature = () =>
  new AppError(400, 'PAYMENT_SIGNATURE_INVALID', 'Chữ ký thanh toán không hợp lệ');

const VNPAY_RESULT: Record<MockChoice, { response: string; status: string }> = {
  success: { response: '00', status: '00' },
  failed: { response: '51', status: '02' }, // tài khoản không đủ số dư
  cancel: { response: '24', status: '02' }, // khách hủy giao dịch
};

/** Dựng callback VNPay có chữ ký + URL trả về trang kết quả (hàm thuần, có test). */
export function buildVnpayCallback(
  request: VnpayParams,
  choice: MockChoice,
  secret: string,
  returnUrl: string,
  now: Date,
): { callback: Record<string, string>; returnUrl: string } {
  const txnNo =
    choice === 'success' ? fakeTransactionNo(`vnpay:${request.vnp_TxnRef ?? ''}`, 8) : '0';
  const r = VNPAY_RESULT[choice];
  const cb: VnpayParams = {
    vnp_Amount: request.vnp_Amount ?? '',
    vnp_BankCode: 'NCB',
    vnp_BankTranNo: choice === 'success' ? `VNP${txnNo}` : '',
    vnp_CardType: 'ATM',
    vnp_OrderInfo: request.vnp_OrderInfo ?? '',
    vnp_PayDate: formatVnpayDate(now),
    vnp_ResponseCode: r.response,
    vnp_TmnCode: request.vnp_TmnCode ?? '',
    vnp_TransactionNo: txnNo,
    vnp_TransactionStatus: r.status,
    vnp_TxnRef: request.vnp_TxnRef ?? '',
  };
  const hash = signVnpay(cb, secret);
  const sep = returnUrl.includes('?') ? '&' : '?';
  return {
    callback: { ...cb, vnp_SecureHash: hash },
    returnUrl: `${returnUrl}${sep}${vnpayQueryString(cb)}&vnp_SecureHash=${hash}`,
  };
}

export async function completeVnpayMock(
  body: CompleteBody,
  config: PaymentConfig,
  now: Date = new Date(),
): Promise<{ returnUrl: string }> {
  const vnpay = config.vnpay;
  if (!config.mocksEnabled || !vnpay) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy');
  const q = body.params;
  if (!verifyVnpay(q, vnpay.hashSecret)) throw badSignature();
  if (q.vnp_TmnCode !== MOCK_VNPAY_TMN_CODE || q.vnp_Command !== 'pay') throw badSignature();

  const built = buildVnpayCallback(q, body.result, vnpay.hashSecret, vnpay.returnUrl, now);
  const rsp = await handleVnpayIpn(built.callback, config);
  if (rsp.RspCode === '00' || rsp.RspCode === '02') return { returnUrl: built.returnUrl };
  if (rsp.RspCode === '01') throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy giao dịch');
  if (rsp.RspCode === '04') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [
      { field: 'vnp_Amount', message: 'Số tiền không khớp' },
    ]);
  }
  throw new AppError(500, 'INTERNAL_ERROR', 'Đã có lỗi xảy ra, vui lòng thử lại sau');
}

export async function completeMomoMock(
  body: CompleteBody,
  config: PaymentConfig,
  now: Date = new Date(),
): Promise<{ returnUrl: string }> {
  const momo = config.momo;
  if (!config.mocksEnabled || !momo) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy');
  const request = pickMomoParams(body.params, MOMO_REQUEST_KEYS);
  if (!request || !verifyMomo(request, momo.secret) || request.partnerCode !== momo.partnerCode) {
    throw badSignature();
  }
  const ipn = buildMomoIpn(request, body.result, momo, now);
  const out = await handleMomoIpn(ipn, config);
  if (!out.ok) throw momoIpnError(out.reason);
  return { returnUrl: buildMomoReturnUrl(ipn, momo.returnUrl) };
}

const configOf = (req: { app: { locals: Record<string, unknown> } }): PaymentConfig =>
  req.app.locals.paymentConfig as PaymentConfig;

export function createMockGatewayRouter({ limiter }: { limiter: RequestHandler }): Router {
  const router = Router();
  // Không cần đăng nhập (giống cổng thật); chữ ký của yêu cầu là bằng chứng quyền.
  router.post(
    '/vnpay/complete',
    limiter,
    validate(completeSchema),
    asyncHandler(async (req, res) => {
      res.json({ data: await completeVnpayMock(req.body as CompleteBody, configOf(req)) });
    }),
  );
  router.post(
    '/momo/complete',
    limiter,
    validate(completeSchema),
    asyncHandler(async (req, res) => {
      res.json({ data: await completeMomoMock(req.body as CompleteBody, configOf(req)) });
    }),
  );
  return router;
}
