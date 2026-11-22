/**
 * Thời gian giao dự kiến (D-062). Tính theo NGÀY LỊCH Việt Nam (UTC+7), KHÔNG loại chủ nhật/ngày lễ,
 * tính từ ngày đặt hàng. Ngày được lưu/trả dạng "ngày thuần": Date lúc 00:00 UTC của ngày VN đó
 * (cột `@db.Date`) hoặc chuỗi `YYYY-MM-DD`.
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface EtaRange {
  minDays: number;
  maxDays: number;
}

export interface EtaDto extends EtaRange {
  /** `YYYY-MM-DD` (ngày VN). */
  fromDate: string;
  toDate: string;
}

/** Ngày lịch VN của thời điểm `d`, dạng Date 00:00 UTC của ngày đó. */
export function vnCalendarDate(d: Date): Date {
  return new Date(Math.floor((d.getTime() + VN_OFFSET_MS) / DAY_MS) * DAY_MS);
}

export function addDays(day: Date, n: number): Date {
  return new Date(day.getTime() + n * DAY_MS);
}

export function formatDateOnly(day: Date): string {
  return day.toISOString().slice(0, 10);
}

export interface EtaDates {
  from: Date;
  to: Date;
}

export function computeEtaDates(now: Date, range: EtaRange): EtaDates {
  const base = vnCalendarDate(now);
  return { from: addDays(base, range.minDays), to: addDays(base, range.maxDays) };
}

export function computeEta(now: Date, range: EtaRange): EtaDto {
  const { from, to } = computeEtaDates(now, range);
  return {
    minDays: range.minDays,
    maxDays: range.maxDays,
    fromDate: formatDateOnly(from),
    toDate: formatDateOnly(to),
  };
}

/** `3-5` hoặc `2` khi min = max (giữ trường `estimatedDays` cũ của shippingOptions). */
export function formatDaysRange(r: EtaRange): string {
  return r.minDays === r.maxDays ? String(r.minDays) : `${r.minDays}-${r.maxDays}`;
}

/** 08:00 giờ VN của ngày `day` (Date 00:00 UTC của ngày VN) -> thời điểm tuyệt đối. */
export function vnMorning(day: Date, hour = 8): Date {
  return new Date(day.getTime() + (hour * 60 * 60 * 1000 - VN_OFFSET_MS));
}

/** `YYYY-MM-DD` -> `dd/MM` hoặc `dd/MM/yyyy`. */
function fmtDay(iso: string, withYear: boolean): string {
  const [y, m, d] = iso.split('-');
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

/** `22/11/2026 – 24/11/2026`, hoặc một ngày khi from = to. Dùng cho email. */
export function formatEtaRange(fromDate: string, toDate: string): string {
  return fromDate === toDate
    ? fmtDay(fromDate, true)
    : `${fmtDay(fromDate, true)} - ${fmtDay(toDate, true)}`;
}
