import type { OrderStatus } from "./order";
import type { UserRole } from "./auth";

export type AdminUserStatus = "ACTIVE" | "DISABLED";
export type AdminUserSort = "newest" | "oldest" | "lastLogin";

/** Item danh sách GET /admin/users (§14.10). */
export interface AdminUserItem {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  status: AdminUserStatus;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  /** D-065: khách đã tự xóa tài khoản (đã ẩn danh); khác DISABLED do admin khóa. */
  deleted: boolean;
  createdAt: string;
  orderCount: number;
}

export interface AdminUserRecentOrder {
  code: string;
  status: OrderStatus;
  grandTotal: number;
  createdAt: string;
}

/** GET /admin/users/:id và kết quả 2 PATCH. */
export interface AdminUserDetail extends AdminUserItem {
  addressCount: number;
  orders: { count: number; paidTotal: number; recent: AdminUserRecentOrder[] };
  activeSessions: number;
}

export interface AdminUserQuery {
  q?: string;
  role?: UserRole;
  status?: AdminUserStatus;
  sort?: AdminUserSort;
  page?: number;
  pageSize?: number;
}
