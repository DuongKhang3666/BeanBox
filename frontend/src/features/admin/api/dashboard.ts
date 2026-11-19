import { api } from "@/lib/api/client";
import type { AdminDashboard } from "@/types/admin";

/** GET /admin/dashboard (§14.3). Staff+. */
export async function getAdminDashboard(signal?: AbortSignal): Promise<AdminDashboard> {
  const { data } = await api.get<AdminDashboard>("/admin/dashboard", { signal });
  return data;
}
