import { z } from 'zod';

/**
 * Helper kiểm tra đầu vào dùng chung cho các schema zod (D-074, gom từ nhiều module; hành vi không đổi).
 */

/** Email: cắt khoảng trắng, hạ chữ thường, đúng định dạng, tối đa 254 ký tự. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Email không đúng định dạng').max(254, 'Email tối đa 254 ký tự'));

/** Số nguyên không âm từ query string. */
export const intParam = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} không hợp lệ` })
    .trim()
    .regex(/^\d+$/, `${label} phải là số nguyên không âm`)
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(min, `${label} phải từ ${min} đến ${max}`)
        .max(max, `${label} phải từ ${min} đến ${max}`),
    );

/** Postgres không lưu được byte NUL trong text: chặn sớm để trả 400 thay vì 500. */
// eslint-disable-next-line no-control-regex
export const NO_NUL = /^[^\u0000]*$/;
