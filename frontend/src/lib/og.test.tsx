// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeDetail } from "@/features/catalog/fixtures";

const getProduct = vi.hoisted(() => vi.fn());
vi.mock("@/features/catalog/api", () => ({ getProduct: (s: string) => getProduct(s) }));

import DefaultImage, { contentType as defaultType, size } from "@/app/opengraph-image";
import TwitterImage from "@/app/twitter-image";
import ProductImage from "@/app/san-pham/[slug]/opengraph-image";
import ProductTwitterImage from "@/app/san-pham/[slug]/twitter-image";
import { fetchRasterImage, sniffRaster } from "./og";

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const isPng = async (res: Response) => {
  const b = new Uint8Array(await res.arrayBuffer());
  return b.length > 1000 && sniffRaster(b) === "image/png";
};

beforeEach(() => getProduct.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe("route ảnh OG", () => {
  it("mặc định: 200 image/png 1200x630, có nội dung PNG", async () => {
    const res = await DefaultImage();
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(defaultType).toBe("image/png");
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(await isPng(res)).toBe(true);
    expect((await TwitterImage()).headers.get("content-type")).toBe("image/png");
  });

  it("sản phẩm: image/png (ảnh seed SVG bị bỏ, không lỗi)", async () => {
    getProduct.mockResolvedValue(makeDetail({ name: "Cà phê Ethiopia Yirgacheffe rang vừa" }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<svg xmlns='http://www.w3.org/2000/svg'/>")),
    );
    const res = await ProductImage({ params: Promise.resolve({ slug: "x" }) });
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(await isPng(res)).toBe(true);
    expect(getProduct).toHaveBeenCalledWith("x");
    expect(
      (await ProductTwitterImage({ params: Promise.resolve({ slug: "x" }) })).headers.get(
        "content-type",
      ),
    ).toBe("image/png");
  });

  it("sản phẩm có ảnh PNG đọc được: vẫn trả PNG", async () => {
    getProduct.mockResolvedValue(
      makeDetail({ images: [{ id: "i", url: "/uploads/a.png", alt: null, isPrimary: true }] }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(PNG_1PX)),
    );
    const res = await ProductImage({ params: Promise.resolve({ slug: "x" }) });
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(await isPng(res)).toBe(true);
  });

  it("ảnh sản phẩm hỏng (đúng magic, sai dữ liệu) -> lùi về ảnh không ảnh, vẫn PNG", async () => {
    getProduct.mockResolvedValue(
      makeDetail({ images: [{ id: "i", url: "/uploads/a.png", alt: null, isPrimary: true }] }),
    );
    const broken = Buffer.concat([PNG_1PX.subarray(0, 8), Buffer.from("garbage-data")]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(broken)),
    );
    const res = await ProductImage({ params: Promise.resolve({ slug: "x" }) });
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(await isPng(res)).toBe(true);
  });

  it("API lỗi hoặc không tìm thấy -> ảnh mặc định, không ném", async () => {
    getProduct.mockRejectedValue(new Error("down"));
    const err = await ProductImage({ params: Promise.resolve({ slug: "x" }) });
    expect(err.headers.get("content-type")).toBe("image/png");
    expect(await isPng(err)).toBe(true);
    getProduct.mockResolvedValue(null);
    const nf = await ProductImage({ params: Promise.resolve({ slug: "khong-co" }) });
    expect(await isPng(nf)).toBe(true);
  });
});

describe("fetchRasterImage", () => {
  const stub = (body: BodyInit | null, init?: ResponseInit) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, init)),
    );

  it("nhận PNG/JPEG/WebP theo magic bytes", async () => {
    stub(PNG_1PX);
    expect(await fetchRasterImage("/uploads/a.png")).toMatch(/^data:image\/png;base64,/);
    stub(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]));
    expect(await fetchRasterImage("/uploads/a.jpg")).toMatch(/^data:image\/jpeg;base64,/);
    stub(Buffer.from("RIFF\0\0\0\0WEBPVP8 xx"));
    expect(await fetchRasterImage("/uploads/a.webp")).toMatch(/^data:image\/webp;base64,/);
  });

  it("bỏ SVG, 404, URL ngoài /uploads, đường dẫn có .., ảnh quá lớn, lỗi mạng", async () => {
    stub("<svg/>", { headers: { "content-type": "image/png" } });
    expect(await fetchRasterImage("/uploads/a.svg")).toBeNull();
    stub("nope", { status: 404 });
    expect(await fetchRasterImage("/uploads/a.png")).toBeNull();
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await fetchRasterImage("https://evil.test/a.png")).toBeNull();
    expect(await fetchRasterImage("/uploads/../etc/passwd")).toBeNull();
    expect(await fetchRasterImage(null)).toBeNull();
    expect(f).not.toHaveBeenCalled();
    stub(Buffer.concat([PNG_1PX.subarray(0, 8), Buffer.alloc(2 * 1024 * 1024 + 1)]));
    expect(await fetchRasterImage("/uploads/big.png")).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("net"))),
    );
    expect(await fetchRasterImage("/uploads/a.png")).toBeNull();
  });
});
