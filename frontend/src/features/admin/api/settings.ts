import { api } from "@/lib/api/client";
import type { AdminSettings, AdminSettingsMeta } from "@/types/settings";

export interface AdminSettingsResult {
  data: AdminSettings;
  meta: AdminSettingsMeta;
}

function toResult(data: AdminSettings, meta?: Partial<AdminSettingsMeta>): AdminSettingsResult {
  return { data, meta: { updatedAt: meta?.updatedAt ?? {} } };
}

/** GET /admin/settings (§14.9). Chỉ ADMIN (STAFF nhận 403). */
export async function getAdminSettings(signal?: AbortSignal): Promise<AdminSettingsResult> {
  const { data, meta } = await api.get<AdminSettings, Partial<AdminSettingsMeta>>(
    "/admin/settings",
    { signal },
  );
  return toResult(data, meta);
}

/** PUT /admin/settings: chỉ gửi các key cần đổi; trả toàn bộ cài đặt mới. */
export async function updateAdminSettings(
  patch: Partial<AdminSettings>,
): Promise<AdminSettingsResult> {
  const { data, meta } = await api.put<AdminSettings, Partial<AdminSettingsMeta>>(
    "/admin/settings",
    patch,
  );
  return toResult(data, meta);
}
