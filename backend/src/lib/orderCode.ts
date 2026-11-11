import { randomInt } from 'node:crypto';

/** Mã đơn dạng BB-YYMMDD-XXXX (ngày theo giờ VN, UTC+7). Alphabet bỏ ký tự dễ nhầm (0,O,1,I,L). */

export const ORDER_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const ORDER_CODE_REGEX = /^BB-\d{6}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export function generateOrderCode(
  now: Date = new Date(),
  randInt: (max: number) => number = (max) => randomInt(max),
): string {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const yy = String(vn.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(vn.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(vn.getUTCDate()).padStart(2, '0');
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += ORDER_CODE_ALPHABET[randInt(ORDER_CODE_ALPHABET.length)];
  return `BB-${yy}${mm}${dd}-${suffix}`;
}

export function normalizeOrderCode(s: string): string {
  return s.trim().toUpperCase();
}
