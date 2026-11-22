import { describe, expect, it } from "vitest";
import robots from "./robots";
import { NOINDEX_PATHS, ROBOTS_DISALLOW_PATHS } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

describe("robots.txt (D-069)", () => {
  const result = robots();
  const rule = (Array.isArray(result.rules) ? result.rules[0] : result.rules) as {
    disallow: string[];
    allow: string;
  };

  it("chỉ chặn /admin và /api/", () => {
    expect(rule.disallow).toEqual(["/admin", "/api/"]);
    expect(rule.disallow).toEqual([...ROBOTS_DISALLOW_PATHS]);
  });

  it("KHÔNG chặn trang noindex để crawler còn đọc được meta noindex", () => {
    for (const p of NOINDEX_PATHS) {
      expect(rule.disallow.some((d) => p.startsWith(d))).toBe(false);
    }
    for (const p of ["/tai-khoan", "/gio-hang", "/thanh-toan", "/dang-nhap", "/tim-kiem"]) {
      expect(rule.disallow).not.toContain(p);
    }
  });

  it("không chặn trang công khai và khai báo sitemap", () => {
    expect(rule.allow).toBe("/");
    expect(rule.disallow).not.toContain("/");
    expect(rule.disallow).not.toContain("/san-pham");
    expect(rule.disallow).not.toContain("/danh-muc");
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});
