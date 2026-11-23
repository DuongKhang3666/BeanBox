/**
 * Allowlist ảnh đại diện (D-081), bản FE của `backend/src/lib/avatarUrl.ts` (phòng thủ 2 lớp: server vẫn
 * là nguồn sự thật khi lưu; FE chỉ render ảnh khi qua cùng bộ kiểm, ngược lại hiện chữ cái đầu).
 * Chỉ nhận `/uploads/...` hoặc URL `https:` có host trong NEXT_PUBLIC_AVATAR_URL_HOSTS (nhúng lúc build,
 * phải trùng AVATAR_URL_HOSTS của backend; mặc định rỗng = chỉ /uploads).
 */
export const AVATAR_URL_MAX_LENGTH = 500;

export const AVATAR_URL_HOSTS: readonly string[] = (process.env.NEXT_PUBLIC_AVATAR_URL_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter((h) => h.length > 0);

const UPLOADS_PATH = /^\/uploads(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)+$/;

/** Cú pháp hợp lệ: `/uploads/...` hoặc `https://...` (chưa xét host). */
export function isAvatarUrlShapeValid(value: string): boolean {
  if (value.length === 0 || value.length > AVATAR_URL_MAX_LENGTH) return false;
  if (value.startsWith("/")) return UPLOADS_PATH.test(value) && !value.includes("..");
  if (!/^https:\/\/[^\s\\]+$/.test(value)) return false;
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      u.username === "" &&
      u.password === "" &&
      u.port === "" &&
      u.hash === "" &&
      !value.includes("#")
    );
  } catch {
    return false;
  }
}

/** Được phép render làm ảnh: đúng cú pháp và (nếu https) host nằm trong allowlist. */
export function isAllowedAvatarUrl(
  value: string | null | undefined,
  hosts: readonly string[] = AVATAR_URL_HOSTS,
): boolean {
  if (!value || !isAvatarUrlShapeValid(value)) return false;
  if (value.startsWith("/")) return true;
  return hosts.includes(new URL(value).hostname.toLowerCase());
}
