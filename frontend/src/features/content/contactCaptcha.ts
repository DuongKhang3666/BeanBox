import { api } from "@/lib/api/client";
import type { ContactCaptcha } from "@/types/settings";
import { normalizePublicSettings } from "./publicSettingsDefaults";

export function sameCaptcha(a: ContactCaptcha | null, b: ContactCaptcha | null): boolean {
  return a === b || (a !== null && b !== null && a.siteKey === b.siteKey);
}

/**
 * Lấy cấu hình captcha mới nhất từ API (trang /lien-he là ISR nên HTML có thể cũ).
 * Trả `undefined` khi lỗi mạng/dữ liệu sai shape: caller giữ giá trị hiện có, không báo lỗi.
 */
export async function fetchContactCaptcha(
  signal?: AbortSignal,
): Promise<ContactCaptcha | null | undefined> {
  try {
    const { data } = await api.get<unknown>("/settings/public", { signal });
    return normalizePublicSettings(data)?.contactCaptcha;
  } catch {
    return undefined;
  }
}
