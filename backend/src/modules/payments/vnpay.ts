import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VnpayConfig } from '../../config/payments.js';
import { formatVnpayDate } from '../../lib/vnTime.js';

/**
 * VNPay 2.1.0 – hàm thuần (api-contract §13.2). Không gọi mạng, không đọc env.
 * Chữ ký: lấy mọi tham số `vnp_*` (bỏ vnp_SecureHash, vnp_SecureHashType), sắp khóa tăng dần,
 * mã hóa giá trị bằng encodeURIComponent rồi %20 -> '+', nối `k=v&k=v`, HMAC-SHA512 hex.
 */

export type VnpayParams = Record<string, string>;

const SIGNATURE_KEYS = new Set(['vnp_SecureHash', 'vnp_SecureHashType']);

const encodeValue = (v: string): string => encodeURIComponent(v).replace(/%20/g, '+');

/** Chuỗi đã sắp xếp + mã hóa dùng cho cả ký và dựng URL. */
export function vnpayQueryString(params: VnpayParams): string {
  return Object.keys(params)
    .filter((k) => k.startsWith('vnp_') && !SIGNATURE_KEYS.has(k))
    .sort()
    .map((k) => `${k}=${encodeValue(params[k] ?? '')}`)
    .join('&');
}

export function signVnpay(params: VnpayParams, secret: string): string {
  return createHmac('sha512', secret).update(vnpayQueryString(params), 'utf8').digest('hex');
}

/**
 * Kiểm chữ ký dữ liệu nhận từ VNPay (query của IPN/return). Giá trị `vnp_*` không phải chuỗi
 * (ví dụ tham số lặp thành mảng) -> sai. So sánh hằng thời gian, hex không phân biệt hoa thường.
 */
export function verifyVnpay(query: Record<string, unknown>, secret: string): boolean {
  const received = query.vnp_SecureHash;
  if (typeof received !== 'string' || received === '') return false;
  const params: VnpayParams = {};
  for (const [k, v] of Object.entries(query)) {
    if (!k.startsWith('vnp_') || SIGNATURE_KEYS.has(k)) continue;
    if (typeof v !== 'string') return false;
    params[k] = v;
  }
  const expected = Buffer.from(signVnpay(params, secret), 'utf8');
  const actual = Buffer.from(received.toLowerCase(), 'utf8');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export interface VnpayPayInput {
  /** Payment.id */
  txnRef: string;
  /** grandTotal (VND); hàm tự nhân 100. */
  amountVnd: number;
  /** Mã đơn hiển thị, ví dụ BB-261110-K7QP. */
  orderCode: string;
  ipAddr: string;
  createDate: Date;
  expireDate: Date;
}

/** `req.ip` có thể là IPv4-mapped IPv6 hoặc ::1; VNPay mong đợi IPv4 dạng quen thuộc. */
export function normalizeVnpayIp(ip: string | undefined): string {
  if (!ip) return '127.0.0.1';
  if (ip === '::1') return '127.0.0.1';
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}

export function buildVnpayUrl(input: VnpayPayInput, config: VnpayConfig): string {
  const params: VnpayParams = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: config.tmnCode,
    vnp_Amount: String(input.amountVnd * 100),
    vnp_CurrCode: 'VND',
    vnp_TxnRef: input.txnRef,
    vnp_OrderInfo: `Thanh toan don hang ${input.orderCode}`,
    vnp_OrderType: 'other',
    vnp_Locale: 'vn',
    vnp_ReturnUrl: config.returnUrl,
    vnp_IpAddr: normalizeVnpayIp(input.ipAddr),
    vnp_CreateDate: formatVnpayDate(input.createDate),
    vnp_ExpireDate: formatVnpayDate(input.expireDate),
  };
  const hash = signVnpay(params, config.hashSecret);
  return `${config.paymentUrl}?${vnpayQueryString(params)}&vnp_SecureHash=${hash}`;
}

/** Bỏ trường chữ ký trước khi lưu `Payment.rawPayload`. Chỉ giữ giá trị chuỗi `vnp_*`. */
export function stripVnpaySignature(query: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (k.startsWith('vnp_') && !SIGNATURE_KEYS.has(k) && typeof v === 'string') out[k] = v;
  }
  return out;
}

/** Giao dịch thành công khi vnp_ResponseCode = "00" VÀ vnp_TransactionStatus = "00" (§13.3). */
export function isVnpaySuccess(query: Record<string, unknown>): boolean {
  return query.vnp_ResponseCode === '00' && query.vnp_TransactionStatus === '00';
}
