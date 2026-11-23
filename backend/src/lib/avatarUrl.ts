/**
 * Allowlist cho `User.avatarUrl` (D-081, R-18). Chỉ nhận:
 * (a) đường dẫn tương đối `/uploads/...` (ảnh do chính server phục vụ), hoặc
 * (b) URL `https:` có host nằm trong env `AVATAR_URL_HOSTS` (mặc định rỗng = chỉ `/uploads`).
 * Không `http:`, `data:`, `javascript:`... Hàm thuần: danh sách host được tiêm để test.
 */

export const AVATAR_URL_MAX_LENGTH = 500;
export const AVATAR_URL_ERROR =
  'Ảnh đại diện phải là đường dẫn /uploads/... hoặc URL https của máy chủ ảnh được phép';

/** Mỗi đoạn bắt đầu bằng chữ/số: loại `.`/`..`, `//`, query, hash, khoảng trắng, `\`, ký tự điều khiển. */
const UPLOADS_PATH = /^\/uploads(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)+$/;

export function isAllowedAvatarUrl(value: string, allowedHosts: readonly string[]): boolean {
  if (value.length === 0 || value.length > AVATAR_URL_MAX_LENGTH) return false;
  if (value.startsWith('/')) return UPLOADS_PATH.test(value) && !value.includes('..');

  // Kiểm chuỗi thô trước khi parse (URL parser bỏ qua/chuẩn hóa nhiều ký tự lạ).
  if (!/^https:\/\/[^\s\\]+$/.test(value)) return false;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username !== '' || u.password !== '' || u.port !== '') {
    return false;
  }
  if (u.hash !== '' || value.includes('#')) return false;
  return allowedHosts.includes(u.hostname.toLowerCase());
}
