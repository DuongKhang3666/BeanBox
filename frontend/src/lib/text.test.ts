import { describe, expect, it } from "vitest";
import { matchesQuery, normalizeSearch } from "./text";

describe("normalizeSearch", () => {
  it("bỏ dấu, đ -> d, lowercase, gộp khoảng trắng", () => {
    expect(normalizeSearch("  Thành phố   Đà Nẵng ")).toBe("thanh pho da nang");
    expect(normalizeSearch("ĐƯỜNG")).toBe("duong");
  });
});

describe("matchesQuery", () => {
  it("khớp không dấu, mọi token", () => {
    expect(matchesQuery("Thành phố Hà Nội", "ha noi")).toBe(true);
    expect(matchesQuery("Phường Hoàn Kiếm", "HOAN kiem")).toBe(true);
    expect(matchesQuery("Phường Hoàn Kiếm", "kiem hoan")).toBe(true);
    expect(matchesQuery("Phường Hoàn Kiếm", "ba dinh")).toBe(false);
  });
  it("query rỗng khớp tất cả", () => {
    expect(matchesQuery("Phường Ba Đình", "   ")).toBe(true);
  });
});
