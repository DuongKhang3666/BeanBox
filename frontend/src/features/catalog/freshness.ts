import type { RoastStatus } from "@/types/catalog";

/** Độ tươi hạt (D-082, requirements §5.6). Server tính tuổi/ngưỡng; FE chỉ hiển thị. */
export const ROAST_RECOMMENDED_DAYS = 30;
export const ROAST_MAX_DAYS = 90;

export const ROAST_EXPIRED_LABEL = "Ngừng bán do quá hạn rang";

/** "Rang hôm nay" / "Rang X ngày trước"; chuỗi rỗng khi không có ngày rang. */
export function roastAgeLabel(ageDays: number | null | undefined): string {
  if (ageDays == null) return "";
  return ageDays <= 0 ? "Rang hôm nay" : `Rang ${ageDays} ngày trước`;
}

/** Cảnh báo đi kèm nhãn tuổi hạt; null khi còn tươi hoặc không có ngày rang. */
export function roastWarning(status: RoastStatus | null | undefined): string | null {
  if (status === "EXPIRED") return `${ROAST_EXPIRED_LABEL} (quá ${ROAST_MAX_DAYS} ngày).`;
  if (status === "PAST_RECOMMENDED") {
    return `Nên dùng trong ${ROAST_RECOMMENDED_DAYS} ngày sau rang để cà phê ngon nhất.`;
  }
  return null;
}
