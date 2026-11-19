import type { ContactMessageQuery, ContactStatus } from "@/types/adminContact";

export const CONTACT_BASE = "/admin/lien-he";
export const CONTACT_Q_MIN = 2;
export const CONTACT_NOTE_MAX = 1000;
export const CONTACT_EXCERPT = 100;

export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
  NEW: "Mới",
  IN_PROGRESS: "Đang xử lý",
  RESOLVED: "Đã xử lý",
  SPAM: "Spam",
};
export const CONTACT_STATUSES: ContactStatus[] = ["NEW", "IN_PROGRESS", "RESOLVED", "SPAM"];

export function parseContactFilters(params: URLSearchParams): ContactMessageQuery {
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const status = params.get("status") as ContactStatus | null;
  const pageNum = Number(params.get("page"));
  const out: ContactMessageQuery = {
    q: q || undefined,
    status: status && CONTACT_STATUSES.includes(status) ? status : undefined,
    page: Number.isInteger(pageNum) && pageNum >= 1 && pageNum <= 10000 ? pageNum : undefined,
  };
  return Object.fromEntries(
    Object.entries(out).filter(([, v]) => v !== undefined),
  ) as ContactMessageQuery;
}

/** Query gửi API: bỏ `q` nếu < 2 ký tự. */
export function contactApiQuery(f: ContactMessageQuery): ContactMessageQuery {
  const { q, ...rest } = f;
  return q && q.trim().length >= CONTACT_Q_MIN ? { ...rest, q: q.trim() } : rest;
}

export function contactFiltersHref(f: ContactMessageQuery): string {
  const qs = new URLSearchParams();
  if (f.q) qs.set("q", f.q);
  if (f.status) qs.set("status", f.status);
  if (f.page && f.page > 1) qs.set("page", String(f.page));
  const s = qs.toString();
  return s ? `${CONTACT_BASE}?${s}` : CONTACT_BASE;
}

/** Trích nội dung dạng text thuần, gộp xuống dòng/khoảng trắng. */
export function contactExcerpt(message: string, max = CONTACT_EXCERPT): string {
  const flat = message.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}
