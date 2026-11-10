import { describe, expect, it } from "vitest";
import { MAX_FILTER_VALUES, parseFilters, toApiQuery, toSearchParams } from "./filters";

describe("giới hạn số giá trị mỗi bộ lọc", () => {
  const many = Array.from({ length: 40 }, (_, i) => `brand-${i}`).join(",");

  it("hằng số khớp backend", () => {
    expect(MAX_FILTER_VALUES).toBe(30);
  });

  it("URL có 40 giá trị -> chỉ giữ 30, API query và URL không vượt 30", () => {
    const f = parseFilters({ brand: many, origin: many.replaceAll("brand-", "vn") });
    expect(f.brand).toHaveLength(30);
    expect(f.origin).toHaveLength(30);
    expect(f.brand[29]).toBe("brand-29");
    expect(String(toApiQuery(f).brand).split(",")).toHaveLength(30);
    expect(toSearchParams(f).get("brand")!.split(",")).toHaveLength(30);
    expect(toSearchParams(f).get("origin")!.split(",")).toHaveLength(30);
  });

  it("cắt sau khi khử trùng lặp", () => {
    const dup = [...Array.from({ length: 35 }, () => "a"), "b", "c"].join(",");
    expect(parseFilters({ brand: dup }).brand).toEqual(["a", "b", "c"]);
  });
});
