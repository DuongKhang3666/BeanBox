import { z } from 'zod';
import { normalizePhone } from '../../lib/phone.js';

/** Form liên hệ (api-contract §14.11, D-023). */

// eslint-disable-next-line no-control-regex
export const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
// Cho phép \t (09), \n (0A), \r (0D); chặn phần còn lại và NUL.
// eslint-disable-next-line no-control-regex
const MESSAGE_FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const name = z
  .string({ error: 'Họ tên không hợp lệ' })
  .trim()
  .min(2, 'Họ tên phải từ 2 đến 100 ký tự')
  .max(100, 'Họ tên phải từ 2 đến 100 ký tự')
  .refine((v) => !CONTROL_CHARS.test(v), 'Họ tên không được chứa ký tự điều khiển');

const email = z
  .string({ error: 'Email không hợp lệ' })
  .trim()
  .toLowerCase()
  .pipe(z.email('Email không đúng định dạng').max(254, 'Email tối đa 254 ký tự'));

const phone = z
  .union([z.string(), z.null()], { error: 'Số điện thoại không hợp lệ' })
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === null || v.trim() === '') return null;
    const n = normalizePhone(v);
    if (n === null) {
      ctx.addIssue({ code: 'custom', message: 'Số điện thoại không hợp lệ' });
      return z.NEVER;
    }
    return n;
  });

const subject = z
  .union([z.string(), z.null()], { error: 'Tiêu đề không hợp lệ' })
  .optional()
  .transform((v, ctx) => {
    const s = (v ?? '').trim();
    if (s.length > 150) {
      ctx.addIssue({ code: 'custom', message: 'Tiêu đề tối đa 150 ký tự' });
      return z.NEVER;
    }
    if (CONTROL_CHARS.test(s)) {
      ctx.addIssue({ code: 'custom', message: 'Tiêu đề không được chứa ký tự điều khiển' });
      return z.NEVER;
    }
    return s === '' ? null : s;
  });

const message = z
  .string({ error: 'Nội dung không hợp lệ' })
  .trim()
  .min(10, 'Nội dung phải từ 10 đến 2000 ký tự')
  .max(2000, 'Nội dung phải từ 10 đến 2000 ký tự')
  .refine((v) => !MESSAGE_FORBIDDEN.test(v), 'Nội dung chứa ký tự không hợp lệ');

const website = z
  .union([z.string().max(200, 'Giá trị không hợp lệ'), z.null()], {
    error: 'Giá trị không hợp lệ',
  })
  .optional();

export const createContactSchema = z.object({ name, email, phone, subject, message, website });
export type CreateContactInput = z.infer<typeof createContactSchema>;
