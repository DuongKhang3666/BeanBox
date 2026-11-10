import { formatDate, formatDateTime, formatVND } from "./format";

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
    expect(formatDate(new Date(2026, 10, 10))).toBe("10/11/2026");
  });
  it("trả chuỗi rỗng khi ngày sai", () => {
    expect(formatDate("không phải ngày")).toBe("");
    expect(formatDateTime("x")).toBe("");
  });
  it("formatDateTime có giờ phút", () => {
    expect(formatDateTime(new Date(2026, 10, 10, 14, 5))).toBe("10/11/2026 14:05");
  });
});
