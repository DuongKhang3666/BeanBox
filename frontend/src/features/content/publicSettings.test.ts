import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { DEFAULT_PUBLIC_SETTINGS, isSafeBanner } from "./publicSettingsDefaults";

const serverGet = vi.fn();
vi.mock("@/lib/api/server", () => ({ serverGet: (...a: unknown[]) => serverGet(...a) }));

import { getPublicSettings } from "./publicSettings";

beforeEach(() => {
  serverGet.mockReset();
});

describe("getPublicSettings", () => {
  it("gọi /settings/public với revalidate 300 và trả dữ liệu hợp lệ", async () => {
    const data = structuredClone(DEFAULT_PUBLIC_SETTINGS);
    data.store.contact.email = "shop@example.vn";
    data.home.banners = [
      {
        imageUrl: "/uploads/a.webp",
        alt: "A",
        title: "",
        subtitle: "",
        href: null,
        isActive: true,
      },
    ];
    serverGet.mockResolvedValue({ data });
    const r = await getPublicSettings();
    expect(serverGet).toHaveBeenCalledWith("/settings/public", { revalidate: 300 });
    expect(r.store.contact.email).toBe("shop@example.vn");
    expect(r.home.banners).toHaveLength(1);
  });

  it("contactCaptcha: có -> giữ; thiếu/sai shape -> null", async () => {
    const data = structuredClone(DEFAULT_PUBLIC_SETTINGS) as unknown as Record<string, unknown>;
    serverGet.mockResolvedValue({
      data: { ...data, contactCaptcha: { provider: "turnstile", siteKey: "test-site-key" } },
    });
    expect((await getPublicSettings()).contactCaptcha).toEqual({
      provider: "turnstile",
      siteKey: "test-site-key",
    });
    delete data.contactCaptcha;
    serverGet.mockResolvedValue({ data });
    expect((await getPublicSettings()).contactCaptcha).toBeNull();
    serverGet.mockResolvedValue({ data: { ...data, contactCaptcha: { provider: "x" } } });
    expect((await getPublicSettings()).contactCaptcha).toBeNull();
  });

  it("lỗi mạng -> mặc định", async () => {
    serverGet.mockImplementation(async () => {
      throw new ApiError(0, "NETWORK_ERROR", "x");
    });
    expect(await getPublicSettings()).toEqual(DEFAULT_PUBLIC_SETTINGS);
  });

  it("5xx -> mặc định", async () => {
    serverGet.mockImplementation(async () => {
      throw new ApiError(503, "INTERNAL", "x");
    });
    expect(await getPublicSettings()).toEqual(DEFAULT_PUBLIC_SETTINGS);
  });

  it("shape sai -> mặc định", async () => {
    serverGet.mockResolvedValue({ data: { shipping: {} } });
    expect(await getPublicSettings()).toEqual(DEFAULT_PUBLIC_SETTINGS);
    serverGet.mockResolvedValue({ data: null });
    expect(await getPublicSettings()).toEqual(DEFAULT_PUBLIC_SETTINGS);
  });
});

describe("isSafeBanner", () => {
  const base = {
    imageUrl: "/uploads/a.webp",
    alt: "A",
    title: "",
    subtitle: "",
    href: null,
    isActive: true,
  };
  it("chỉ nhận ảnh /uploads/ và href nội bộ", () => {
    expect(isSafeBanner(base)).toBe(true);
    expect(isSafeBanner({ ...base, href: "/san-pham" })).toBe(true);
    expect(isSafeBanner({ ...base, imageUrl: "https://evil.example/a.png" })).toBe(false);
    expect(isSafeBanner({ ...base, imageUrl: "/other/a.png" })).toBe(false);
    expect(isSafeBanner({ ...base, href: "//evil.example" })).toBe(false);
    expect(isSafeBanner({ ...base, href: "https://evil.example" })).toBe(false);
    expect(isSafeBanner({ ...base, href: "javascript:alert(1)" })).toBe(false);
  });
});
