import { describe, expect, it } from "vitest";
import {
  changeFilters,
  clearFilters,
  parseFilters,
  toApiQuery,
  toSearchParams,
  buildHref,
} from "./filters";

describe("parseFilters", () => {
  it("trả mặc định khi rỗng", () => {
    const f = parseFilters({});
    expect(f).toMatchObject({ page: 1, pageSize: 12, inStock: false, brand: [], roast: [] });
    expect(f.q).toBeUndefined();
  });

  it("bỏ enum lạ, giữ enum hợp lệ", () => {
    const f = parseFilters({ roast: "LIGHT,BAD,DARK", process: "XYZ", brew: ["PHIN", "nope"] });
    expect(f.roast).toEqual(["LIGHT", "DARK"]);
    expect(f.process).toEqual([]);
    expect(f.brew).toEqual(["PHIN"]);
  });

  it("bỏ giá âm / không phải số / thập phân", () => {
    const f = parseFilters({ minPrice: "-5", maxPrice: "abc" });
    expect(f.minPrice).toBeUndefined();
    expect(f.maxPrice).toBeUndefined();
    expect(parseFilters({ minPrice: "10.5" }).minPrice).toBeUndefined();
    expect(parseFilters({ minPrice: "100000" }).minPrice).toBe(100000);
  });

  it("minPrice > maxPrice thì bỏ cả hai", () => {
    const f = parseFilters({ minPrice: "500", maxPrice: "100" });
    expect(f.minPrice).toBeUndefined();
    expect(f.maxPrice).toBeUndefined();
  });

  it("q chỉ có khoảng trắng thì bỏ; q được trim", () => {
    expect(parseFilters({ q: "   " }).q).toBeUndefined();
    expect(parseFilters({ q: "  phin  " }).q).toBe("phin");
  });

  it("page < 1 hoặc sai -> 1; pageSize chỉ 12 hoặc 24", () => {
    expect(parseFilters({ page: "0" }).page).toBe(1);
    expect(parseFilters({ page: "-3" }).page).toBe(1);
    expect(parseFilters({ page: "x" }).page).toBe(1);
    expect(parseFilters({ page: "3" }).page).toBe(3);
    expect(parseFilters({ pageSize: "24" }).pageSize).toBe(24);
    expect(parseFilters({ pageSize: "100" }).pageSize).toBe(12);
  });

  it("sort: bỏ giá trị lạ; relevance cần q", () => {
    expect(parseFilters({ sort: "hack" }).sort).toBeUndefined();
    expect(parseFilters({ sort: "relevance" }).sort).toBeUndefined();
    expect(parseFilters({ sort: "relevance", q: "a" }).sort).toBe("relevance");
    expect(parseFilters({ sort: "price_asc" }).sort).toBe("price_asc");
  });

  it("loại slug thương hiệu không hợp lệ", () => {
    expect(parseFilters({ brand: "hario,<script>,kinto" }).brand).toEqual(["hario", "kinto"]);
  });
});

describe("toApiQuery", () => {
  it("chỉ gồm trường hợp lệ, danh sách nối bằng dấu phẩy", () => {
    const q = toApiQuery(
      parseFilters({ roast: "LIGHT,MEDIUM", inStock: "true", minPrice: "1000", sort: "price_asc" }),
      "ca-phe-hat",
    );
    expect(q).toMatchObject({
      category: "ca-phe-hat",
      roast: "LIGHT,MEDIUM",
      inStock: true,
      minPrice: 1000,
      sort: "price_asc",
      page: 1,
      pageSize: 12,
    });
    expect(q.q).toBeUndefined();
    expect(q.brand).toBeUndefined();
  });

  it("không gửi sort mặc định", () => {
    expect(toApiQuery(parseFilters({ sort: "newest" })).sort).toBeUndefined();
  });
});

describe("toSearchParams / URL", () => {
  it("bỏ giá trị mặc định", () => {
    expect(toSearchParams(parseFilters({})).toString()).toBe("");
    expect(buildHref("/danh-muc/x", parseFilters({ page: "1", sort: "newest" }))).toBe(
      "/danh-muc/x",
    );
  });

  it("đổi bộ lọc thì reset page", () => {
    const f = parseFilters({ page: "4", roast: "LIGHT" });
    const next = changeFilters(f, { inStock: true });
    expect(next.page).toBe(1);
    expect(toSearchParams(next).get("page")).toBeNull();
  });

  it("round-trip parse -> serialize -> parse", () => {
    const f = parseFilters({
      q: "ethiopia",
      brand: "hario,kinto",
      origin: "Ethiopia,Việt Nam",
      roast: "LIGHT",
      process: "WASHED",
      brew: "PHIN,MOKA",
      minPrice: "1000",
      maxPrice: "9000",
      inStock: "true",
      sort: "price_desc",
      page: "3",
      pageSize: "24",
    });
    const qs = Object.fromEntries(toSearchParams(f).entries());
    expect(parseFilters(qs)).toEqual(f);
  });

  it("clearFilters giữ q và sort", () => {
    const f = clearFilters(
      parseFilters({ q: "phin", roast: "LIGHT", sort: "price_asc", page: "2" }),
    );
    expect(f.q).toBe("phin");
    expect(f.sort).toBe("price_asc");
    expect(f.roast).toEqual([]);
    expect(f.page).toBe(1);
  });
});
