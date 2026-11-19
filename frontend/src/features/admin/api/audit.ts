import { api } from "@/lib/api/client";
import type { AuditLogItem, AuditLogQuery } from "@/types/admin";
import type { PaginationMeta } from "@/types/api";

/** GET /admin/audit-logs (§14.4). Chỉ ADMIN (STAFF nhận 403). */
export async function listAuditLogs(query: AuditLogQuery, signal?: AbortSignal) {
  const { data, meta } = await api.get<AuditLogItem[], Partial<PaginationMeta>>(
    "/admin/audit-logs",
    { query: { ...query }, signal },
  );
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
