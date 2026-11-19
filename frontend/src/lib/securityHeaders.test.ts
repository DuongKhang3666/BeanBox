import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

type Rule = { source: string; headers: { key: string; value: string }[] };

async function rules(): Promise<Rule[]> {
  return (await nextConfig.headers!()) as Rule[];
}

/** Giá trị cuối cùng của header cho một đường dẫn (rule đứng sau thắng, như Next). */
function effective(all: Rule[], matches: (source: string) => boolean, key: string) {
  let v: string | undefined;
  for (const r of all) {
    if (!matches(r.source)) continue;
    for (const h of r.headers) if (h.key === key) v = h.value;
  }
  return v;
}

describe("next.config headers", () => {
  it("mọi route có header an toàn", async () => {
    const all = await rules();
    const any = (s: string) => s === "/:path*";
    expect(effective(all, any, "X-Content-Type-Options")).toBe("nosniff");
    expect(effective(all, any, "X-Frame-Options")).toBe("DENY");
    expect(effective(all, any, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(effective(all, any, "Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("trang có token/chữ ký trên URL vẫn là no-referrer (rule riêng đứng sau rule chung)", async () => {
    const all = await rules();
    for (const page of ["/dat-lai-mat-khau", "/thanh-toan/ket-qua", "/xac-thuc-email"]) {
      const v = effective(all, (s) => s === "/:path*" || s === page, "Referrer-Policy");
      expect(v, page).toBe("no-referrer");
    }
  });
});
