import { z } from 'zod';

const VN_MOBILE = /^0(3|5|7|8|9)\d{8}$/;

/** D-007: chuẩn hóa SĐT di động VN về dạng 0xxxxxxxxx; không hợp lệ -> null. */
export function normalizePhone(input: string): string | null {
  let s = input.trim().replace(/[\s.-]/g, '');
  if (s.startsWith('+84')) s = `0${s.slice(3)}`;
  return VN_MOBILE.test(s) ? s : null;
}

export const phoneSchema = z.string().transform((v, ctx) => {
  const n = normalizePhone(v);
  if (n === null) {
    ctx.addIssue({ code: 'custom', message: 'Số điện thoại không hợp lệ' });
    return z.NEVER;
  }
  return n;
});
