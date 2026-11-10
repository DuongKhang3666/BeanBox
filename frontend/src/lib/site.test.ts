import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAIN_NAV, ROOT_CATEGORY_SLUGS } from "./site";

const CATEGORY_LINK = /\/danh-muc\/([a-z0-9-]+)/g;

describe("slug danh mục gốc", () => {
  it("MAIN_NAV chỉ trỏ tới slug trong ROOT_CATEGORY_SLUGS", () => {
    const slugs = MAIN_NAV.filter((n) => n.href.startsWith("/danh-muc/")).map((n) =>
      n.href.replace("/danh-muc/", ""),
    );
    expect(slugs.length).toBeGreaterThan(0);
    for (const s of slugs) expect(ROOT_CATEGORY_SLUGS).toContain(s);
  });

  it("có đủ 4 danh mục gốc, gồm Quà tặng & Combo", () => {
    expect([...ROOT_CATEGORY_SLUGS]).toEqual([
      "ca-phe-hat",
      "dung-cu-pha-che",
      "phu-kien",
      "qua-tang-combo",
    ]);
    expect(MAIN_NAV.map((n) => n.label)).toContain("Quà tặng & Combo");
  });

  it("trang chủ chỉ dùng slug hợp lệ và không còn hat-ca-phe", () => {
    const src = readFileSync(path.resolve(__dirname, "../app/page.tsx"), "utf8");
    expect(src).not.toContain('hat-ca-phe"');
    // slug viết thẳng (nếu có) phải nằm trong danh sách
    for (const m of src.matchAll(CATEGORY_LINK)) expect(ROOT_CATEGORY_SLUGS).toContain(m[1]);
  });

  it("không có file nguồn nào dùng slug sai hat-ca-phe", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = path.join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    const offenders = walk(path.resolve(__dirname, ".."))
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("site.test.ts"))
      .filter((f) => /(^|[^a-z-])hat-ca-phe/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
