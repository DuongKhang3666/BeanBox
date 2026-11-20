import type {
  AnalyticsGranularity,
  AnalyticsCompared,
  AnalyticsComparedRate,
  BreakdownDimension,
} from "@/types/admin";

/**
 * Khoảng ngày cho trang Phân tích kinh doanh (api-contract §16.1, D-050). Mọi ngày là ngày lịch
 * Việt Nam (UTC+7) dạng YYYY-MM-DD; tính qua "số ngày từ 1970-01-01" nên không phụ thuộc múi giờ
 * máy chạy.
 */

export const ANALYTICS_BASE = "/admin/phan-tich";
export const MAX_RANGE_DAYS = 366;
export const MIN_DATE = "2020-01-01";
const DAY_MS = 24 * 3600 * 1000;
const VN_OFFSET_MS = 7 * 3600 * 1000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function dayNum(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}
export const ymdOf = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** Ngày hôm nay theo giờ VN. */
export const todayVn = (now: Date = new Date()): string =>
  new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

/** `YYYY-MM-DD` hợp lệ (ngày có thật). */
export function isValidYmd(s: string | null | undefined): s is string {
  if (!s || !YMD.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export interface DateRange {
  from: string;
  to: string;
}

export type PresetId = "7d" | "30d" | "90d" | "thisMonth" | "lastMonth" | "thisYear";

export const PRESETS: ReadonlyArray<{ id: PresetId; label: string }> = [
  { id: "7d", label: "7 ngày" },
  { id: "30d", label: "30 ngày" },
  { id: "90d", label: "90 ngày" },
  { id: "thisMonth", label: "Tháng này" },
  { id: "lastMonth", label: "Tháng trước" },
  { id: "thisYear", label: "Năm nay" },
];

export function presetRange(id: PresetId, today: string): DateRange {
  const t = dayNum(today);
  const [y, m] = today.split("-").map(Number) as [number, number];
  switch (id) {
    case "7d":
      return { from: ymdOf(t - 6), to: today };
    case "30d":
      return { from: ymdOf(t - 29), to: today };
    case "90d":
      return { from: ymdOf(t - 89), to: today };
    case "thisMonth":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "lastMonth": {
      const first = Math.round(Date.UTC(y, m - 1, 1) / DAY_MS);
      const prevFirst = Math.round(Date.UTC(y, m - 2, 1) / DAY_MS);
      return { from: ymdOf(prevFirst), to: ymdOf(first - 1) };
    }
    case "thisYear":
      return { from: `${y}-01-01`, to: today };
  }
}

export function activePreset(range: DateRange, today: string): PresetId | null {
  for (const p of PRESETS) {
    const r = presetRange(p.id, today);
    if (r.from === range.from && r.to === range.to) return p.id;
  }
  return null;
}

export const rangeDays = (r: DateRange) => dayNum(r.to) - dayNum(r.from) + 1;

export function defaultGranularity(days: number): AnalyticsGranularity {
  if (days <= 62) return "day";
  if (days <= 184) return "week";
  return "month";
}

/** Lỗi tiếng Việt cho khoảng ngày người dùng nhập; null = hợp lệ. */
export function validateRange(from: string, to: string, today: string): string | null {
  if (!from || !to) return "Vui lòng chọn đủ ngày bắt đầu và ngày kết thúc.";
  if (!isValidYmd(from) || !isValidYmd(to)) return "Ngày không hợp lệ.";
  if (from < MIN_DATE || to < MIN_DATE) return "Không chọn ngày trước 01/01/2020.";
  if (from > today || to > today) return "Không chọn ngày trong tương lai.";
  if (from > to) return "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.";
  if (rangeDays({ from, to }) > MAX_RANGE_DAYS) {
    return `Khoảng ngày tối đa ${MAX_RANGE_DAYS} ngày.`;
  }
  return null;
}

export interface AnalyticsSelection extends DateRange {
  granularity: AnalyticsGranularity;
  /** Có `g` hợp lệ trong URL (người dùng chọn tường minh). */
  explicitGranularity: boolean;
}

/** Đọc `?from=&to=&g=`; tham số thiếu/sai -> mặc định 30 ngày, không ném lỗi. */
export function parseAnalyticsParams(params: URLSearchParams, today: string): AnalyticsSelection {
  const from = params.get("from");
  const to = params.get("to");
  const range =
    from && to && validateRange(from, to, today) === null
      ? { from, to }
      : presetRange("30d", today);
  const g = params.get("g");
  const explicit = g === "day" || g === "week" || g === "month";
  return {
    ...range,
    granularity: explicit ? g : defaultGranularity(rangeDays(range)),
    explicitGranularity: explicit,
  };
}

/** Chiều cơ cấu doanh thu (`?dim=`); mặc định `category`. */
export const BREAKDOWN_DIMS: ReadonlyArray<{ id: BreakdownDimension; label: string }> = [
  { id: "category", label: "Danh mục" },
  { id: "brand", label: "Thương hiệu" },
  { id: "paymentMethod", label: "Thanh toán" },
  { id: "shippingMethod", label: "Giao hàng" },
  { id: "province", label: "Tỉnh/thành" },
];
export const DEFAULT_DIM: BreakdownDimension = "category";

/** Đọc `?dim=`; thiếu/sai -> mặc định (không ném lỗi). */
export function parseDim(params: URLSearchParams): {
  dim: BreakdownDimension;
  explicitDim: boolean;
} {
  const v = params.get("dim");
  const found = BREAKDOWN_DIMS.find((d) => d.id === v);
  return found ? { dim: found.id, explicitDim: true } : { dim: DEFAULT_DIM, explicitDim: false };
}

export function analyticsHref(
  range: DateRange,
  g?: AnalyticsGranularity,
  dim?: BreakdownDimension,
): string {
  const qs = new URLSearchParams({ from: range.from, to: range.to });
  if (g) qs.set("g", g);
  if (dim) qs.set("dim", dim);
  return `${ANALYTICS_BASE}?${qs.toString()}`;
}

/** "2026-10-13" -> "13/10"; có năm khi `withYear`. */
export function shortDate(iso: string, withYear = false): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

/** "01/10–30/10" (thêm năm khi khoảng qua hai năm khác nhau). */
export function rangeLabel(r: DateRange): string {
  const withYear = r.from.slice(0, 4) !== r.to.slice(0, 4);
  return `${shortDate(r.from, withYear)}–${shortDate(r.to, withYear)}`;
}

/** Số thập phân kiểu Việt Nam: dấu phẩy. */
export const decimalVi = (n: number) => String(n).replace(".", ",");

export const formatInt = (n: number): string =>
  `${n < 0 ? "-" : ""}${Math.abs(Math.trunc(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

/** 0.1667 -> "16,7%". */
export const formatRate = (r: number): string => `${decimalVi(Math.round(r * 1000) / 10)}%`;

export interface Delta {
  direction: "up" | "down" | "flat" | "none";
  /** Mũi tên + số, hiển thị (aria-hidden). */
  visual: string;
  /** Câu đầy đủ cho trình đọc màn hình. */
  spoken: string;
}

/** Định dạng so sánh với kỳ trước; `unit` = "%" (changePct) hoặc "điểm %" (changePts). */
function deltaOf(value: number | null, unit: "%" | "điểm %"): Delta {
  if (value === null) {
    return {
      direction: "none",
      visual: "Không có dữ liệu kỳ trước",
      spoken: "Không có dữ liệu kỳ trước",
    };
  }
  const abs = decimalVi(Math.abs(value));
  const suffix = unit === "%" ? "%" : " điểm %";
  if (value === 0) return { direction: "flat", visual: `= 0${suffix}`, spoken: "Không đổi" };
  if (value > 0) {
    return { direction: "up", visual: `▲ ${abs}${suffix}`, spoken: `Tăng ${abs}${suffix}` };
  }
  return { direction: "down", visual: `▼ ${abs}${suffix}`, spoken: `Giảm ${abs}${suffix}` };
}

export const deltaPct = (c: AnalyticsCompared): Delta => deltaOf(c.changePct, "%");
export const deltaPts = (c: AnalyticsComparedRate): Delta => deltaOf(c.changePts, "điểm %");

/**
 * Thời gian xử lý (giờ) -> chữ tiếng Việt: "3,5 giờ", "1 ngày 6 giờ"; null -> "Chưa có dữ liệu".
 * Làm tròn tới 0,1 giờ; từ 24 giờ trở lên tách ngày.
 */
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return "Chưa có dữ liệu";
  const h = Math.max(0, Math.round(hours * 10) / 10);
  if (h < 24) return `${decimalVi(h)} giờ`;
  const days = Math.floor(h / 24);
  const rest = Math.round((h - days * 24) * 10) / 10;
  return rest === 0 ? `${days} ngày` : `${days} ngày ${decimalVi(rest)} giờ`;
}
