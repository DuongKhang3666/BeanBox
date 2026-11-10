/** Validate client cho hồ sơ & địa chỉ (mirror docs/api-contract.md §6; server vẫn quyết định). */

export const PROVINCE_CODE_RE = /^\d{2}$/;
export const WARD_CODE_RE = /^\d{5}$/;
export const MAX_ADDRESSES = 10;

/** YYYY-MM-DD theo giờ máy người dùng. */
export function todayISO(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

export function validateBirthDate(value: string, today: string = todayISO()): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Ngày sinh không hợp lệ";
  if (Number(value.slice(0, 4)) < 1900) return "Ngày sinh phải từ năm 1900 trở đi";
  if (value > today) return "Ngày sinh không được ở tương lai";
  return null;
}

export function validateAvatarUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (v.length > 500) return "Đường dẫn ảnh tối đa 500 ký tự";
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:"
      ? null
      : "Đường dẫn ảnh phải bắt đầu bằng http:// hoặc https://";
  } catch {
    return "Đường dẫn ảnh không hợp lệ";
  }
}

export function validateLine1(value: string): string | null {
  const v = value.trim();
  if (!v) return "Vui lòng nhập địa chỉ chi tiết";
  if (v.length < 5) return "Địa chỉ chi tiết tối thiểu 5 ký tự";
  if (v.length > 200) return "Địa chỉ chi tiết tối đa 200 ký tự";
  return null;
}

export function validateProvinceCode(value: string): string | null {
  const v = value.trim();
  if (!v) return "Vui lòng nhập mã tỉnh/thành";
  return PROVINCE_CODE_RE.test(v) ? null : "Mã tỉnh/thành gồm đúng 2 chữ số";
}

export function validateWardCode(value: string): string | null {
  const v = value.trim();
  if (!v) return "Vui lòng nhập mã phường/xã";
  return WARD_CODE_RE.test(v) ? null : "Mã phường/xã gồm đúng 5 chữ số";
}

export function validateLocationName(value: string, label: string): string | null {
  const v = value.trim();
  if (!v) return `Vui lòng nhập ${label}`;
  if (v.length < 2) return `${label[0]!.toUpperCase()}${label.slice(1)} tối thiểu 2 ký tự`;
  if (v.length > 100) return `${label[0]!.toUpperCase()}${label.slice(1)} tối đa 100 ký tự`;
  return null;
}
