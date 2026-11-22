import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { MomoMockConfig } from '../../config/payments.js';

/**
 * MoMo GIẢ (D-060) – hàm thuần, không gọi mạng, không đọc env. Chỉ mô phỏng KIỂU chữ ký của MoMo
 * (không phải tích hợp MoMo thật, không có tài khoản MoMo nào liên quan).
 * Chữ ký: lấy mọi tham số (bỏ `signature`), sắp khóa tăng dần, nối thô `key=value&key=value`
 * (KHÔNG mã hóa URL), HMAC-SHA256 hex bằng PAYMENT_MOCK_SECRET.
 */

export type MomoParams = Record<string, string>;

/** Tham số hợp lệ của yêu cầu thanh toán (URL tới cổng giả). */
export const MOMO_REQUEST_KEYS = [
  'partnerCode',
  'orderId',
  'requestId',
  'amount',
  'orderInfo',
  'redirectUrl',
  'requestType',
  'extraData',
  'lang',
  'signature',
] as const;

/** Tham số của IPN và của trang kết quả (return). */
export const MOMO_RESULT_KEYS = [
  'partnerCode',
  'orderId',
  'requestId',
  'amount',
  'orderInfo',
  'orderType',
  'transId',
  'resultCode',
  'message',
  'payType',
  'responseTime',
  'extraData',
  'signature',
] as const;

export const MOMO_RESULT_OK = '0';
export const MOMO_RESULT_USER_DENIED = '1006';
export const MOMO_RESULT_FAILED = '1001';

export type MockChoice = 'success' | 'failed' | 'cancel';

export function momoRawString(params: MomoParams): string {
  return Object.keys(params)
    .filter((k) => k !== 'signature')
    .sort()
    .map((k) => `${k}=${params[k] ?? ''}`)
    .join('&');
}

export function signMomo(params: MomoParams, secret: string): string {
  return createHmac('sha256', secret).update(momoRawString(params), 'utf8').digest('hex');
}

/** Giữ các khóa cho phép có giá trị chuỗi; khóa lặp (mảng) -> `null` (coi là sai). */
export function pickMomoParams(
  source: Record<string, unknown>,
  keys: readonly string[],
): MomoParams | null {
  const out: MomoParams = {};
  for (const k of keys) {
    const v = source[k];
    if (v === undefined) continue;
    if (typeof v !== 'string') return null;
    out[k] = v;
  }
  return out;
}

export function verifyMomo(params: MomoParams, secret: string): boolean {
  const received = params.signature;
  if (typeof received !== 'string' || received === '') return false;
  const expected = Buffer.from(signMomo(params, secret), 'utf8');
  const actual = Buffer.from(received.toLowerCase(), 'utf8');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export interface MomoPayInput {
  /** Payment.id */
  paymentId: string;
  amountVnd: number;
  orderCode: string;
  now: Date;
}

/** URL trang cổng giả kèm yêu cầu đã ký. */
export function buildMomoMockUrl(input: MomoPayInput, config: MomoMockConfig): string {
  const params: MomoParams = {
    partnerCode: config.partnerCode,
    orderId: input.paymentId,
    requestId: `${input.paymentId}-${input.now.getTime()}`,
    amount: String(input.amountVnd),
    orderInfo: `Thanh toan don hang ${input.orderCode}`,
    redirectUrl: config.returnUrl,
    requestType: 'captureWallet',
    extraData: '',
    lang: 'vi',
  };
  const signature = signMomo(params, config.secret);
  const qs = new URLSearchParams({ ...params, signature }).toString();
  return `${config.paymentUrl}?${qs}`;
}

/** Số giao dịch giả, ổn định theo hạt giống (gọi lại cùng giao dịch ra cùng số). */
export function fakeTransactionNo(seed: string, digits = 10): string {
  const hex = createHash('sha256').update(seed).digest('hex');
  return BigInt(`0x${hex.slice(0, 14)}`)
    .toString()
    .padStart(digits, '0')
    .slice(-digits);
}

const RESULT_BY_CHOICE: Record<MockChoice, { code: string; message: string }> = {
  success: { code: MOMO_RESULT_OK, message: 'Successful.' },
  failed: { code: MOMO_RESULT_FAILED, message: 'Transaction failed (demo).' },
  cancel: { code: MOMO_RESULT_USER_DENIED, message: 'Transaction denied by user (demo).' },
};

/** IPN giả (có chữ ký) dựng từ yêu cầu đã kiểm chữ ký + lựa chọn của người dùng ở cổng giả. */
export function buildMomoIpn(
  request: MomoParams,
  choice: MockChoice,
  config: MomoMockConfig,
  now: Date,
): MomoParams {
  const r = RESULT_BY_CHOICE[choice];
  const params: MomoParams = {
    partnerCode: request.partnerCode ?? config.partnerCode,
    orderId: request.orderId ?? '',
    requestId: request.requestId ?? '',
    amount: request.amount ?? '',
    orderInfo: request.orderInfo ?? '',
    orderType: 'momo_wallet',
    transId: choice === 'success' ? fakeTransactionNo(`momo:${request.orderId ?? ''}`) : '0',
    resultCode: r.code,
    message: r.message,
    payType: 'qr',
    responseTime: String(now.getTime()),
    extraData: request.extraData ?? '',
  };
  return { ...params, signature: signMomo(params, config.secret) };
}

/** URL trang kết quả của FE kèm tham số đã ký (nguồn: IPN giả). */
export function buildMomoReturnUrl(ipn: MomoParams, returnUrl: string): string {
  const sep = returnUrl.includes('?') ? '&' : '?';
  return `${returnUrl}${sep}${new URLSearchParams(ipn).toString()}`;
}
