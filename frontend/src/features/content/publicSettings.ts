import "server-only";
import { serverGet } from "@/lib/api/server";
import { DEFAULT_PUBLIC_SETTINGS, normalizePublicSettings } from "./publicSettingsDefaults";
import type { PublicSettings } from "@/types/settings";

/**
 * Đọc GET /settings/public (ISR 300 giây). Mọi lỗi (mạng, 5xx, shape sai) -> nội dung mặc định
 * để build/trang vẫn chạy khi backend tắt.
 */
export async function getPublicSettings(): Promise<PublicSettings> {
  try {
    const res = await serverGet<unknown>("/settings/public", { revalidate: 300 });
    return normalizePublicSettings(res.data) ?? DEFAULT_PUBLIC_SETTINGS;
  } catch {
    return DEFAULT_PUBLIC_SETTINGS;
  }
}
