import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP tự cài theo RFC 6238 (dựa trên HOTP, RFC 4226) và base32 theo RFC 4648 (D-063).
 * HMAC-SHA1, bước 30 giây, 6 chữ số. Không phụ thuộc thư viện OTP.
 */

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Chấp nhận mã của bước hiện tại và 1 bước liền trước/sau (lệch đồng hồ). */
export const TOTP_WINDOW = 1;
export const TOTP_SECRET_BYTES = 20;

// ───────────── Base32 (RFC 4648 §6, bảng chữ cái chuẩn, không padding) ─────────────

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(data: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1; // giữ giá trị nhỏ, tránh tràn số 32 bit
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Giải mã base32: bỏ khoảng trắng, "-" và "=", không phân biệt hoa/thường. Ký tự lạ -> ném lỗi. */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Ký tự base32 không hợp lệ');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return Buffer.from(bytes);
}

// ───────────── HOTP / TOTP ─────────────

/** HOTP (RFC 4226 §5.3) với truncation động; trả số nguyên 31 bit TRƯỚC khi lấy `mod 10^digits`. */
export function hotpTruncated(secret: Uint8Array, counter: number): number {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(msg).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  return (
    ((hmac[offset]! & 0x7f) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!
  );
}

export function hotp(secret: Uint8Array, counter: number, digits: number = TOTP_DIGITS): string {
  return String(hotpTruncated(secret, counter) % 10 ** digits).padStart(digits, '0');
}

/** Số bước 30 giây kể từ epoch (T trong RFC 6238) tại `nowMs`. */
export function stepAt(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

export function totpAt(secret: Uint8Array, nowMs: number, digits: number = TOTP_DIGITS): string {
  return hotp(secret, stepAt(nowMs), digits);
}

const safeEqualStr = (a: string, b: string): boolean => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

/**
 * Kiểm mã TOTP trong cửa sổ ±1 bước quanh `nowMs`. Trả số bước khớp, hoặc null nếu sai.
 * `lastStep`: bước đã dùng gần nhất; chỉ nhận bước > lastStep (chống dùng lại, RFC 6238 §5.2).
 * Duyệt đủ cả cửa sổ và so sánh hằng thời gian (không thoát sớm).
 */
export function verifyTotp(
  secret: Uint8Array,
  code: string,
  nowMs: number,
  lastStep?: number | null,
): number | null {
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(code)) return null;
  const current = stepAt(nowMs);
  let matched: number | null = null;
  for (let step = current - TOTP_WINDOW; step <= current + TOTP_WINDOW; step++) {
    if (step < 0) continue;
    const ok = safeEqualStr(hotp(secret, step), code);
    if (ok && (lastStep === null || lastStep === undefined || step > lastStep)) {
      // Nhiều bước cùng khớp (gần như không xảy ra): lấy bước lớn nhất.
      matched = matched === null ? step : Math.max(matched, step);
    }
  }
  return matched;
}

export const generateTotpSecret = (): Buffer => randomBytes(TOTP_SECRET_BYTES);

/** URI `otpauth://` (Key URI Format của Google Authenticator) để tạo mã QR. */
export function buildOtpauthUri(opts: {
  secretBase32: string;
  issuer: string;
  account: string;
}): string {
  const issuer = encodeURIComponent(opts.issuer);
  const label = `${issuer}:${encodeURIComponent(opts.account)}`;
  return (
    `otpauth://totp/${label}?secret=${opts.secretBase32}&issuer=${issuer}` +
    `&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`
  );
}
