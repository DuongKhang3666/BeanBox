import { api } from "@/lib/api/client";
import type { UserRole } from "@/types/auth";
import type { PaginationMeta } from "@/types/api";
import type {
  AdminUserDetail,
  AdminUserItem,
  AdminUserQuery,
  AdminUserStatus,
} from "@/types/adminUsers";

/** GET /admin/users (§14.10). Chỉ ADMIN (STAFF nhận 403). */
export async function listAdminUsers(query: AdminUserQuery, signal?: AbortSignal) {
  const { data, meta } = await api.get<AdminUserItem[], Partial<PaginationMeta>>("/admin/users", {
    query: { ...query },
    signal,
  });
  return {
    data,
    meta: {
      page: meta?.page ?? 1,
      pageSize: meta?.pageSize ?? data.length,
      total: meta?.total ?? data.length,
      totalPages: meta?.totalPages ?? 1,
    } satisfies PaginationMeta,
  };
}

export async function getAdminUser(id: string, signal?: AbortSignal): Promise<AdminUserDetail> {
  const { data } = await api.get<AdminUserDetail>(`/admin/users/${encodeURIComponent(id)}`, {
    signal,
  });
  return data;
}

export async function updateAdminUserStatus(
  id: string,
  body: { status: AdminUserStatus; reason?: string },
): Promise<AdminUserDetail> {
  const { data } = await api.patch<AdminUserDetail>(
    `/admin/users/${encodeURIComponent(id)}/status`,
    body,
  );
  return data;
}

/** POST /admin/users/:id/2fa/reset (§14.10): tắt 2FA của người dùng khác, thu hồi mọi phiên của họ. */
export async function resetAdminUserTwoFactor(id: string): Promise<AdminUserDetail> {
  const { data } = await api.post<AdminUserDetail>(
    `/admin/users/${encodeURIComponent(id)}/2fa/reset`,
  );
  return data;
}

export async function updateAdminUserRole(
  id: string,
  body: { role: UserRole },
): Promise<AdminUserDetail> {
  const { data } = await api.patch<AdminUserDetail>(
    `/admin/users/${encodeURIComponent(id)}/role`,
    body,
  );
  return data;
}
