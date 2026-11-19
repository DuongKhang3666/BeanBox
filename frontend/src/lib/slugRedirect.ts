import { permanentRedirect } from "next/navigation";
import { ApiError } from "./api/errors";

/** Kết quả tra cứu theo slug ở Server Component (D-018). */
export type SlugLookup<T> =
  { status: "ok"; data: T } | { status: "moved"; movedTo: string } | { status: "missing" };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 404 kèm `details.movedTo` (slug hợp lệ) -> slug mới; ngược lại null. */
export function movedToOf(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 404) return null;
  const d = err.details;
  if (typeof d !== "object" || d === null) return null;
  const v = (d as { movedTo?: unknown }).movedTo;
  return typeof v === "string" && v.length <= 200 && SLUG_RE.test(v) ? v : null;
}

/** Chuyển lỗi API thành SlugLookup: 404 -> moved/missing; lỗi khác được ném tiếp. */
export function lookupFromError(err: unknown): SlugLookup<never> {
  if (err instanceof ApiError && err.status === 404) {
    const movedTo = movedToOf(err);
    return movedTo ? { status: "moved", movedTo } : { status: "missing" };
  }
  throw err;
}

/** Nếu slug đã đổi -> HTTP 308 sang URL mới (ném NEXT_REDIRECT); còn lại trả nguyên kết quả. */
export function redirectIfMoved<T>(
  lookup: SlugLookup<T>,
  basePath: "/san-pham" | "/danh-muc",
): Exclude<SlugLookup<T>, { status: "moved" }> {
  if (lookup.status === "moved") {
    return permanentRedirect(`${basePath}/${encodeURIComponent(lookup.movedTo)}`);
  }
  return lookup;
}
