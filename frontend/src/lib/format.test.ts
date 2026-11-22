import { formatDate, formatDateRange, formatDateTime, formatVND } from "./format";

describe("formatVND", () => {
  it("định dạng với dấu chấm ngăn cách và ký hiệu ₫", () => {
    expect(formatVND(125000)).toBe("125.000₫");
    expect(formatVND(0)).toBe("0₫");
    expect(formatVND(999)).toBe("999₫");
    expect(formatVND(1250000)).toBe("1.250.000₫");
    expect(formatVND(1000)).toBe("1.000₫");
  });
  it("xử lý số âm và giá trị không hợp lệ", () => {
    expect(formatVND(-50000)).toBe("-50.000₫");
    expect(formatVND(Number.NaN)).toBe("0₫");
  });
  it("cắt phần thập phân thay vì làm tròn float", () => {
    expect(formatVND(1999.9)).toBe("1.999₫");
  });
});

describe("formatDate", () => {
  it("định dạng dd/MM/yyyy", () => {
    expect(formatDate("2026-11-10T05:00:00Z")).toBe("10/11/2026");
  });
  it("trả chuỗi rỗng khi ngày sai", () => {
    expect(formatDate("không phải ngày")).toBe("");
    expect(formatDateTime("x")).toBe("");
  });
  it("formatDateTime có giờ phút", () => {
    expect(formatDateTime("2026-11-10T07:05:00Z")).toBe("10/11/2026 14:05");
  });
  it("cố định giờ Việt Nam ở biên UTC (không phụ thuộc TZ máy)", () => {
    // 18:30 UTC ngày 20 = 01:30 ngày 21 giờ Việt Nam.
    expect(formatDate("2026-11-20T18:30:00Z")).toBe("21/11/2026");
    expect(formatDateTime("2026-11-20T18:30:00Z")).toBe("21/11/2026 01:30");
    expect(formatDateTime(new Date(Date.UTC(2026, 11, 31, 17, 0)))).toBe("01/01/2027 00:00");
    // 16:59 UTC vẫn là 23:59 cùng ngày.
    expect(formatDateTime("2026-11-20T16:59:00Z")).toBe("20/11/2026 23:59");
  });
});

describe("formatDateRange", () => {
  it("dd/MM – dd/MM từ chuỗi YYYY-MM-DD, không phụ thuộc múi giờ máy", () => {
    expect(formatDateRange("2026-11-22", "2026-11-24")).toBe("22/11 – 24/11");
    expect(formatDateRange("2026-12-30", "2027-01-02")).toBe("30/12 – 02/01");
  });
  it("cùng ngày -> một ngày; chuỗi lạ giữ nguyên", () => {
    expect(formatDateRange("2026-11-22", "2026-11-22")).toBe("22/11");
    expect(formatDateRange("x", "y")).toBe("x – y");
  });
});
