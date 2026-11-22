import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductImage } from "@/features/catalog/components/ProductImage";
import type { PublicSettings } from "@/types/settings";
import { PolicyArticle } from "./components/PolicyArticle";
import { POLICIES, POLICY_SLUGS, buildPolicies, formatKg, isPolicySlug } from "./policies";
import { DEFAULT_PUBLIC_SETTINGS } from "./publicSettingsDefaults";

function withSettings(over: (s: PublicSettings) => void): PublicSettings {
  const s = structuredClone(DEFAULT_PUBLIC_SETTINGS);
  over(s);
  return s;
}

const text = (p: ReturnType<typeof buildPolicies>["van-chuyen"]) =>
  p.sections.flatMap((s) => [...(s.paragraphs ?? []), ...(s.bullets ?? [])]).join("\n");

describe("policies", () => {
  it("có đủ 4 slug và nhận diện slug hợp lệ", () => {
    expect(POLICY_SLUGS).toHaveLength(4);
    expect(isPolicySlug("doi-tra")).toBe(true);
    expect(isPolicySlug("khac")).toBe(false);
  });

  it("PolicyArticle: h1, ghi chú demo, mục lục, link chéo sang 3 chính sách khác", () => {
    render(<PolicyArticle policy={POLICIES["van-chuyen"]} />);
    expect(screen.getByRole("heading", { level: 1, name: "Chính sách vận chuyển" })).toBeVisible();
    expect(screen.getByText(/dự án demo/)).toBeInTheDocument();
    const toc = screen.getByRole("navigation", { name: "Mục lục" });
    expect(toc.querySelectorAll("a")).toHaveLength(POLICIES["van-chuyen"].sections.length);
    const more = screen.getByRole("navigation", { name: "Chính sách khác" });
    expect(more.querySelectorAll("a")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Điều khoản mua hàng" })).toHaveAttribute(
      "href",
      "/chinh-sach/dieu-khoan",
    );
    expect(screen.getByText(/20\.000₫ \(1–2 ngày\)/)).toBeInTheDocument();
  });
});

describe("buildPolicies", () => {
  it("mặc định: phí, ngưỡng, phụ phí và tên tỉnh nội thành đúng số liệu", () => {
    const t = text(buildPolicies(DEFAULT_PUBLIC_SETTINGS)["van-chuyen"]);
    expect(t).toContain("Nội thành gồm Thành phố Hà Nội và Thành phố Hồ Chí Minh");
    expect(t).toContain("Nội thành: Tiêu chuẩn 20.000₫ (1–2 ngày), Nhanh 35.000₫ (0–1 ngày).");
    expect(t).toContain(
      "Tỉnh/thành khác: Tiêu chuẩn 35.000₫ (3–5 ngày), Nhanh 55.000₫ (1–3 ngày).",
    );
    expect(t).toContain("Đơn từ 500.000₫");
    expect(t).toContain(
      "Đơn nặng trên 2 kg phát sinh 5.000₫ cho mỗi 1 kg hoặc phần lẻ vượt quá 2 kg.",
    );
    expect(t).not.toContain("phường/xã được cửa hàng cấu hình riêng");
  });

  it("dùng số liệu từ settings, kg lẻ dùng dấu phẩy", () => {
    const s = withSettings((x) => {
      x.shipping.rates.other.STANDARD = 40000;
      x.shipping.freeShippingThreshold = 700000;
      x.shipping.weightSurcharge = { freeGram: 1500, stepGram: 500, feePerStep: 3000 };
    });
    const t = text(buildPolicies(s)["van-chuyen"]);
    expect(t).toContain("Tiêu chuẩn 40.000₫");
    expect(t).toContain("Đơn từ 700.000₫");
    expect(t).toContain(
      "Đơn nặng trên 1,5 kg phát sinh 3.000₫ cho mỗi 0,5 kg hoặc phần lẻ vượt quá 1,5 kg.",
    );
    expect(formatKg(2000)).toBe("2");
    expect(formatKg(1500)).toBe("1,5");
  });

  it("freeship = 0: mọi đơn Tiêu chuẩn miễn phí", () => {
    const s = withSettings((x) => void (x.shipping.freeShippingThreshold = 0));
    const t = text(buildPolicies(s)["van-chuyen"]);
    expect(t).toContain("Mọi đơn dùng phương thức Tiêu chuẩn đều được miễn phí vận chuyển");
    expect(t).not.toContain("Đơn từ");
  });

  it("feePerStep = 0: không có phụ phí", () => {
    const s = withSettings((x) => void (x.shipping.weightSurcharge.feePerStep = 0));
    const t = text(buildPolicies(s)["van-chuyen"]);
    expect(t).toContain("Hiện không có phụ phí khối lượng.");
    expect(t).not.toContain("Đơn nặng trên");
  });

  it("innerCityWardCount > 0: thêm câu về phường/xã cấu hình riêng", () => {
    const s = withSettings((x) => void (x.shipping.innerCityWardCount = 12));
    expect(text(buildPolicies(s)["van-chuyen"])).toContain(
      "Nội thành gồm Thành phố Hà Nội và Thành phố Hồ Chí Minh và một số phường/xã được cửa hàng cấu hình riêng",
    );
  });

  it("một hoặc nhiều tỉnh nội thành: nối tự nhiên", () => {
    const one = withSettings((x) => {
      x.shipping.innerCityProvinces = [{ code: "01", name: "Thành phố Hà Nội" }];
    });
    expect(text(buildPolicies(one)["van-chuyen"])).toContain("Nội thành gồm Thành phố Hà Nội (");
    const three = withSettings((x) => {
      x.shipping.innerCityProvinces = [
        { code: "01", name: "A" },
        { code: "02", name: "B" },
        { code: "03", name: "C" },
      ];
    });
    expect(text(buildPolicies(three)["van-chuyen"])).toContain("Nội thành gồm A, B và C");
  });

  it("danh sách tỉnh rỗng: nói không có khu vực nội thành, không có dòng Nội thành", () => {
    const s = withSettings((x) => void (x.shipping.innerCityProvinces = []));
    const p = buildPolicies(s)["van-chuyen"];
    expect(text(p)).toContain("không có khu vực nội thành riêng");
    expect(p.sections[0]!.bullets!.some((b) => b.startsWith("Nội thành"))).toBe(false);
  });

  it("email liên hệ lấy từ settings ở đổi trả và bảo mật", () => {
    const s = withSettings((x) => void (x.store.contact.email = "shop@example.vn"));
    const all = buildPolicies(s);
    expect(text(all["doi-tra"])).toContain("shop@example.vn");
    expect(text(all["bao-mat"])).toContain("shop@example.vn");
    expect(text(all["doi-tra"])).not.toContain("hello@beanbox.local");
  });

  it("bảo mật: nêu form liên hệ được lưu để phản hồi và không lưu IP; ngày cập nhật 19/11/2026", () => {
    const p = buildPolicies(withSettings(() => undefined))["bao-mat"];
    const t = text(p);
    expect(t).toContain("form liên hệ");
    expect(t).toContain("không lưu địa chỉ IP");
    expect(p.updatedAt).toBe("19/11/2026");
  });

  it("điều khoản: COD xác nhận sau, thanh toán online trong N phút, không còn 'sẽ có sau'", () => {
    const s = withSettings((x) => void (x.order.paymentExpiryMinutes = 30));
    const t = text(buildPolicies(s)["dieu-khoan"]);
    expect(t).toContain("COD");
    expect(t).toContain("VNPay");
    expect(t).toContain("Stripe");
    expect(t).toContain("trong 30 phút");
    expect(t).toContain("tự động hủy");
    expect(t).not.toContain("sẽ có sau");
  });
});

describe("ProductImage", () => {
  it("className có w-16 thì không render w-full", () => {
    const { container } = render(
      <ProductImage src={null} name="Cà phê" sizes="64px" className="h-16 w-16 shrink-0" />,
    );
    const root = container.firstElementChild!;
    expect(root).toHaveClass("w-16", "h-16");
    expect(root).not.toHaveClass("w-full");
  });
});
