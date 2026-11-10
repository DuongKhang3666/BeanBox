/** Validate phía client, mirror quy tắc server (docs/api-contract.md §1, §5). Server vẫn là nguồn quyết định. */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const PASSWORD_HINT = "Từ 8 đến 72 ký tự, gồm ít nhất 1 chữ cái và 1 chữ số.";
export const EMAIL_MAX = 254;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^0(3|5|7|8|9)\d{8}$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return "Vui lòng nhập email";
  if (v.length > EMAIL_MAX || !EMAIL_RE.test(v)) return "Email không đúng định dạng";
  return null;
}

/** Dùng cho đăng nhập: chỉ kiểm có nhập, không lộ chính sách. */
export function validateRequiredPassword(value: string): string | null {
  return value ? null : "Vui lòng nhập mật khẩu";
}

export function validatePassword(value: string): string | null {
  if (!value) return "Vui lòng nhập mật khẩu";
  if (value.length < PASSWORD_MIN) return `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự`;
  if (value.length > PASSWORD_MAX) return `Mật khẩu tối đa ${PASSWORD_MAX} ký tự`;
  if (!/\p{L}/u.test(value)) return "Mật khẩu cần có ít nhất 1 chữ cái";
  if (!/\d/.test(value)) return "Mật khẩu cần có ít nhất 1 chữ số";
  return null;
}

export function validatePasswordConfirm(password: string, confirm: string): string | null {
  if (!confirm) return "Vui lòng nhập lại mật khẩu";
  return password === confirm ? null : "Mật khẩu nhập lại không khớp";
}

export function validateFullName(value: string): string | null {
  const v = value.trim();
  if (!v) return "Vui lòng nhập họ tên";
  if (v.length < 2) return "Họ tên tối thiểu 2 ký tự";
  if (v.length > 100) return "Họ tên tối đa 100 ký tự";
  return null;
}

/** D-007: bỏ khoảng trắng, dấu chấm, gạch ngang; "+84" đầu -> "0". Chưa kiểm định dạng. */
export function normalizePhone(value: string): string {
  const s = value.replace(/[\s.-]/g, "");
  return s.startsWith("+84") ? `0${s.slice(3)}` : s;
}

export function isValidPhone(value: string): boolean {
  return PHONE_RE.test(normalizePhone(value));
}

/** SĐT tùy chọn: rỗng là hợp lệ. */
export function validateOptionalPhone(value: string): string | null {
  if (!value.trim()) return null;
  return isValidPhone(value) ? null : "Số điện thoại không hợp lệ (ví dụ 0901234567)";
}
