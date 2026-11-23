/**
 * Độ tươi hạt cà phê (requirements §5.6, D-082). Hàm thuần, đồng hồ tiêm được.
 * - Khuyến nghị dùng trong 30 ngày sau rang: quá 30 ngày -> `PAST_RECOMMENDED` (chỉ cảnh báo).
 * - Không bán lô đã rang quá 90 ngày: quá 90 ngày -> `EXPIRED` (server từ chối thêm giỏ/báo giá/đặt đơn).
 * Tuổi hạt = (ngày hôm nay theo giờ Việt Nam) - `roastDate` (cột `DATE`, đã là ngày lịch), tính theo ngày
 * nguyên; `roastDate` null (không phải hạt/không ghi ngày rang) -> không áp quy tắc.
 */

export const ROAST_RECOMMENDED_DAYS = 30;
export const ROAST_MAX_DAYS = 90;

export type RoastStatus = 'FRESH' | 'PAST_RECOMMENDED' | 'EXPIRED';

const DAY_MS = 24 * 60 * 60 * 1000;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Số ngày từ ngày rang đến hôm nay (giờ VN), >= 0; null khi không có ngày rang. */
export function roastAgeDays(roastDate: Date | null | undefined, now: Date): number | null {
  if (roastDate == null) return null;
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const todayUtcMidnight = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate());
  const roastUtcMidnight = Date.UTC(
    roastDate.getUTCFullYear(),
    roastDate.getUTCMonth(),
    roastDate.getUTCDate(),
  );
  return Math.max(0, Math.round((todayUtcMidnight - roastUtcMidnight) / DAY_MS));
}

export function roastStatusOfAge(age: number | null): RoastStatus | null {
  if (age == null) return null;
  if (age > ROAST_MAX_DAYS) return 'EXPIRED';
  if (age > ROAST_RECOMMENDED_DAYS) return 'PAST_RECOMMENDED';
  return 'FRESH';
}

export function roastStatusOf(roastDate: Date | null | undefined, now: Date): RoastStatus | null {
  return roastStatusOfAge(roastAgeDays(roastDate, now));
}

export function isRoastExpired(roastDate: Date | null | undefined, now: Date): boolean {
  return roastStatusOf(roastDate, now) === 'EXPIRED';
}
