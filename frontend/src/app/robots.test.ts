import { describe, expect, it } from "vitest";
import robots from "./robots";
import { PRIVATE_PATHS } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

describe("robots.txt", () => {
  const result = robots();
  const rule = (Array.isArray(result.rules) ? result.rules[0] : result.rules) as {
    disallow: string[];
    allow: string;
  };

  it("chặn mọi đường dẫn riêng tư và /api/", () => {
    for (const p of [
      "/admin",
      "/api/",
      "/tai-khoan",
      "/gio-hang",
      "/thanh-toan",
      "/dat-hang-thanh-cong",
      "/tra-cuu-don-hang",
      "/dang-nhap",
      "/dang-ky",
      "/quen-mat-khau",
      "/dat-lai-mat-khau",
      "/xac-thuc-email",
    ]) {
      expect(rule.disallow).toContain(p);
    }
    expect(rule.disallow).toEqual([...PRIVATE_PATHS]);
  });

  it("không chặn trang công khai và khai báo sitemap", () => {
    expect(rule.allow).toBe("/");
    expect(rule.disallow).not.toContain("/");
    expect(rule.disallow).not.toContain("/san-pham");
    expect(rule.disallow).not.toContain("/danh-muc");
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});
