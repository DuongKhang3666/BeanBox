import { COMPARE_MAX } from "./store";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function buildCompareHref(slugs: readonly string[]): string {
  return slugs.length === 0 ? "/so-sanh" : `/so-sanh?sp=${slugs.map(encodeURIComponent).join(",")}`;
}

/** Đọc `?sp=a,b,c`: bỏ slug sai định dạng/trùng, giữ thứ tự, tối đa COMPARE_MAX. */
export function parseSpParam(sp: string | null): string[] {
  if (!sp) return [];
  const out: string[] = [];
  for (const part of sp.split(",")) {
    const s = part.trim();
    if (s && s.length <= 200 && SLUG_RE.test(s) && !out.includes(s)) out.push(s);
    if (out.length >= COMPARE_MAX) break;
  }
  return out;
}
