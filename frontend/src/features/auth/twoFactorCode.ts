/** Chuẩn hóa/kiểm tra mã 2FA ở phía client (server vẫn kiểm lại). */

/** Mã TOTP: bỏ khoảng trắng; đúng 6 chữ số. */
export const normalizeTotp = (s: string): string => s.replace(/\s+/g, "");
export const isTotp = (s: string): boolean => /^\d{6}$/.test(normalizeTotp(s));

export function validateTotp(s: string): string | undefined {
  if (!s.trim()) return "Vui lòng nhập mã 6 số từ ứng dụng xác thực";
  if (!isTotp(s)) return "Mã gồm đúng 6 chữ số";
  return undefined;
}

export function validateBackup(s: string): string | undefined {
  if (!s.trim()) return "Vui lòng nhập mã dự phòng";
  const compact = s.replace(/[\s-]/g, "");
  if (compact.length !== 10) return "Mã dự phòng gồm 10 ký tự, ví dụ ABCDE-FGHJK";
  return undefined;
}

/** Mã hoặc mã dự phòng (ô duy nhất khi tắt/tạo lại mã). */
export function validateAnyCode(s: string): string | undefined {
  if (!s.trim()) return "Vui lòng nhập mã xác thực hoặc mã dự phòng";
  if (isTotp(s)) return undefined;
  return validateBackup(s) ? "Nhập mã 6 số hoặc mã dự phòng 10 ký tự" : undefined;
}

/** "ABCDEFGH" -> "ABCD EFGH" (secret để nhập tay). */
export const groupSecret = (secret: string): string => secret.match(/.{1,4}/g)?.join(" ") ?? secret;

/** mm:ss từ số giây còn lại. */
export function formatCountdown(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
