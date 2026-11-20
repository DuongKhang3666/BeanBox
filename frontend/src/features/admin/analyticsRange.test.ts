import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activePreset,
  analyticsHref,
  deltaPct,
  deltaPts,
  formatHours,
  formatInt,
  formatRate,
  isValidYmd,
  parseAnalyticsParams,
  parseDim,
  presetRange,
  rangeLabel,
  todayVn,
  validateRange,
} from "./analyticsRange";

const TODAY = "2026-11-20";

afterEach(() => vi.unstubAllEnvs());

describe("todayVn", () => {
  it("tính theo giờ VN, không phụ thuộc múi giờ máy", () => {
    expect(todayVn(new Date("2026-11-19T17:00:00Z"))).toBe("2026-11-20"); // 00:00 VN
    expect(todayVn(new Date("2026-11-19T16:59:59Z"))).toBe("2026-11-19");
    expect(todayVn(new Date("2026-12-31T20:00:00Z"))).toBe("2027-01-01");
  });
});

describe("presetRange", () => {
  it("7/30/90 ngày gồm cả hôm nay", () => {
    expect(presetRange("7d", TODAY)).toEqual({ from: "2026-11-14", to: TODAY });
    expect(presetRange("30d", TODAY)).toEqual({ from: "2026-10-22", to: TODAY });
    expect(presetRange("90d", TODAY)).toEqual({ from: "2026-08-23", to: TODAY });
  });

  it("tháng này, tháng trước, năm nay", () => {
    expect(presetRange("thisMonth", TODAY)).toEqual({ from: "2026-11-01", to: TODAY });
    expect(presetRange("lastMonth", TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetRange("thisYear", TODAY)).toEqual({ from: "2026-01-01", to: TODAY });
  });

  it("tháng trước qua ranh giới năm và tháng 2 nhuận", () => {
    expect(presetRange("lastMonth", "2027-01-15")).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
    expect(presetRange("lastMonth", "2028-03-05")).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  it("mọi preset hợp lệ (<= 366 ngày, không tương lai)", () => {
    for (const id of ["7d", "30d", "90d", "thisMonth", "lastMonth", "thisYear"] as const) {
      const r = presetRange(id, "2028-12-31");
      expect(validateRange(r.from, r.to, "2028-12-31"), id).toBeNull();
    }
  });

  it("activePreset nhận ra preset đang chọn", () => {
    expect(activePreset(presetRange("90d", TODAY), TODAY)).toBe("90d");
    expect(activePreset({ from: "2026-11-01", to: "2026-11-02" }, TODAY)).toBeNull();
  });
});

describe("validateRange", () => {
  it("báo lỗi tiếng Việt", () => {
    expect(validateRange("", "2026-11-01", TODAY)).toMatch(/chọn đủ/);
    expect(validateRange("2026-02-30", "2026-11-01", TODAY)).toMatch(/không hợp lệ/);
    expect(validateRange("2026-11-10", "2026-11-01", TODAY)).toMatch(/trước hoặc bằng/);
    expect(validateRange("2026-11-01", "2026-11-21", TODAY)).toMatch(/tương lai/);
    expect(validateRange("2019-12-31", "2020-01-02", TODAY)).toMatch(/trước 01\/01\/2020/);
    expect(validateRange("2025-11-19", "2026-11-20", TODAY)).toMatch(/tối đa 366/);
    expect(validateRange("2025-11-20", "2026-11-20", TODAY)).toBeNull(); // đúng 366 ngày
    expect(validateRange("2026-11-20", "2026-11-20", TODAY)).toBeNull();
  });

  it("isValidYmd", () => {
    expect(isValidYmd("2028-02-29")).toBe(true);
    expect(isValidYmd("2027-02-29")).toBe(false);
    expect(isValidYmd("2026-1-1")).toBe(false);
    expect(isValidYmd(null)).toBe(false);
  });
});

describe("parseAnalyticsParams", () => {
  const p = (qs: string) => parseAnalyticsParams(new URLSearchParams(qs), TODAY);

  it("không tham số -> 30 ngày, nhóm theo ngày", () => {
    expect(p("")).toEqual({
      from: "2026-10-22",
      to: TODAY,
      granularity: "day",
      explicitGranularity: false,
    });
  });

  it("tham số hợp lệ được giữ; g hợp lệ là tường minh", () => {
    expect(p("from=2026-01-01&to=2026-06-30&g=month")).toEqual({
      from: "2026-01-01",
      to: "2026-06-30",
      granularity: "month",
      explicitGranularity: true,
    });
    expect(p("from=2026-01-01&to=2026-06-30").granularity).toBe("week"); // 181 ngày
    expect(p("from=2025-11-20&to=2026-11-20").granularity).toBe("month"); // 366 ngày
  });

  it("tham số sai -> mặc định, không ném lỗi", () => {
    const def = p("");
    expect(p("from=abc&to=xyz")).toEqual(def);
    expect(p("from=2026-11-01")).toEqual(def); // thiếu to
    expect(p("from=2026-11-10&to=2026-11-01")).toEqual(def);
    expect(p("from=2026-11-01&to=2099-01-01")).toEqual(def);
    expect(p("from=2020-01-01&to=2026-11-20")).toEqual(def); // > 366 ngày
    expect(p("g=year").granularity).toBe("day");
    expect(p("g=year").explicitGranularity).toBe(false);
  });
});

describe("analyticsHref / rangeLabel", () => {
  it("tạo URL ổn định", () => {
    expect(analyticsHref({ from: "2026-11-01", to: "2026-11-20" })).toBe(
      "/admin/phan-tich?from=2026-11-01&to=2026-11-20",
    );
    expect(analyticsHref({ from: "2026-11-01", to: "2026-11-20" }, "week")).toBe(
      "/admin/phan-tich?from=2026-11-01&to=2026-11-20&g=week",
    );
  });

  it("nhãn khoảng ngày, có năm khi qua hai năm", () => {
    expect(rangeLabel({ from: "2026-10-01", to: "2026-10-30" })).toBe("01/10–30/10");
    expect(rangeLabel({ from: "2025-12-20", to: "2026-01-05" })).toBe("20/12/2025–05/01/2026");
  });
});

describe("định dạng so sánh", () => {
  it("tăng, giảm, không đổi, không có dữ liệu", () => {
    expect(deltaPct({ current: 1, previous: 1, changePct: 12.5 })).toEqual({
      direction: "up",
      visual: "▲ 12,5%",
      spoken: "Tăng 12,5%",
    });
    expect(deltaPct({ current: 1, previous: 1, changePct: -3 })).toMatchObject({
      direction: "down",
      visual: "▼ 3%",
      spoken: "Giảm 3%",
    });
    expect(deltaPct({ current: 1, previous: 1, changePct: 0 }).direction).toBe("flat");
    expect(deltaPct({ current: 5, previous: 0, changePct: null })).toMatchObject({
      direction: "none",
      visual: "Không có dữ liệu kỳ trước",
    });
  });

  it("tỷ lệ so sánh bằng điểm phần trăm", () => {
    expect(deltaPts({ current: 0.2, previous: 0.1, changePts: 10 })).toMatchObject({
      visual: "▲ 10 điểm %",
      spoken: "Tăng 10 điểm %",
    });
    expect(deltaPts({ current: 0, previous: 0, changePts: null }).direction).toBe("none");
  });

  it("số và tỷ lệ", () => {
    expect(formatInt(1234567)).toBe("1.234.567");
    expect(formatInt(0)).toBe("0");
    expect(formatRate(0.1667)).toBe("16,7%");
    expect(formatRate(0)).toBe("0%");
  });
});

describe("parseDim / analyticsHref với dim", () => {
  const d = (qs: string) => parseDim(new URLSearchParams(qs));
  it("dim hợp lệ được giữ, thiếu/sai về category", () => {
    expect(d("dim=brand")).toEqual({ dim: "brand", explicitDim: true });
    expect(d("dim=province")).toEqual({ dim: "province", explicitDim: true });
    expect(d("")).toEqual({ dim: "category", explicitDim: false });
    expect(d("dim=drop table")).toEqual({ dim: "category", explicitDim: false });
  });
  it("href thêm dim sau g", () => {
    const r = { from: "2026-11-01", to: "2026-11-20" };
    expect(analyticsHref(r, undefined, "paymentMethod")).toBe(
      "/admin/phan-tich?from=2026-11-01&to=2026-11-20&dim=paymentMethod",
    );
    expect(analyticsHref(r, "week", "brand")).toBe(
      "/admin/phan-tich?from=2026-11-01&to=2026-11-20&g=week&dim=brand",
    );
  });
});

describe("formatHours", () => {
  it("dưới 24 giờ: x,y giờ; từ 24 giờ: x ngày y giờ; null -> Chưa có dữ liệu", () => {
    expect(formatHours(0)).toBe("0 giờ");
    expect(formatHours(3.5)).toBe("3,5 giờ");
    expect(formatHours(23.96)).toBe("1 ngày");
    expect(formatHours(24)).toBe("1 ngày");
    expect(formatHours(25)).toBe("1 ngày 1 giờ");
    expect(formatHours(54.5)).toBe("2 ngày 6,5 giờ");
    expect(formatHours(null)).toBe("Chưa có dữ liệu");
    expect(formatHours(undefined)).toBe("Chưa có dữ liệu");
  });
});
