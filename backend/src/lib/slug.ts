export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 120;

/**
 * Sinh slug từ tên: bỏ dấu tiếng Việt, `đ -> d`, lowercase, ký tự ngoài [a-z0-9] thành `-`,
 * gộp và cắt `-` ở hai đầu, tối đa 120 ký tự.
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
  return slug;
}
