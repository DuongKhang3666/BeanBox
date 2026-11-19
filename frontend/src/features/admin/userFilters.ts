import type { AdminUserQuery, AdminUserSort, AdminUserStatus } from "@/types/adminUsers";
import type { UserRole } from "@/types/auth";

export const USERS_BASE = "/admin/nguoi-dung";
export const USER_Q_MIN = 2;

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  CUSTOMER: "Khách hàng",
  STAFF: "Nhân viên",
  ADMIN: "Quản trị viên",
};
export const USER_ROLES: UserRole[] = ["CUSTOMER", "STAFF", "ADMIN"];

export const USER_STATUS_LABEL: Record<AdminUserStatus, string> = {
  ACTIVE: "Đang hoạt động",
  DISABLED: "Đã khóa",
};
export const USER_STATUSES: AdminUserStatus[] = ["ACTIVE", "DISABLED"];

export const USER_SORT_LABEL: Record<AdminUserSort, string> = {
  newest: "Mới nhất",
  oldest: "Cũ nhất",
  lastLogin: "Đăng nhập gần đây",
};
export const USER_SORTS: AdminUserSort[] = ["newest", "oldest", "lastLogin"];

/** Bộ lọc từ URL; giá trị lạ bị bỏ qua. `q` ngắn hơn 2 ký tự vẫn giữ để hiện ô nhập (xem userApiQuery). */
export function parseUserFilters(params: URLSearchParams): AdminUserQuery {
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const role = params.get("role") as UserRole | null;
  const status = params.get("status") as AdminUserStatus | null;
  const sort = params.get("sort") as AdminUserSort | null;
  const pageNum = Number(params.get("page"));
  const out: AdminUserQuery = {
    q: q || undefined,
    role: role && USER_ROLES.includes(role) ? role : undefined,
    status: status && USER_STATUSES.includes(status) ? status : undefined,
    sort: sort && USER_SORTS.includes(sort) && sort !== "newest" ? sort : undefined,
    page: Number.isInteger(pageNum) && pageNum >= 1 && pageNum <= 10000 ? pageNum : undefined,
  };
  return Object.fromEntries(
    Object.entries(out).filter(([, v]) => v !== undefined),
  ) as AdminUserQuery;
}

/** Query gửi API: bỏ `q` nếu < 2 ký tự. */
export function userApiQuery(f: AdminUserQuery): AdminUserQuery {
  const { q, ...rest } = f;
  return q && q.trim().length >= USER_Q_MIN ? { ...rest, q: q.trim() } : rest;
}

export function userFiltersHref(f: AdminUserQuery): string {
  const qs = new URLSearchParams();
  if (f.q) qs.set("q", f.q);
  if (f.role) qs.set("role", f.role);
  if (f.status) qs.set("status", f.status);
  if (f.sort && f.sort !== "newest") qs.set("sort", f.sort);
  if (f.page && f.page > 1) qs.set("page", String(f.page));
  const s = qs.toString();
  return s ? `${USERS_BASE}?${s}` : USERS_BASE;
}

/** Đang bị khóa tạm (đăng nhập sai nhiều lần): lockedUntil ở tương lai. */
export function isTempLocked(lockedUntil: string | null, now: number = Date.now()): boolean {
  if (!lockedUntil) return false;
  const t = new Date(lockedUntil).getTime();
  return Number.isFinite(t) && t > now;
}
