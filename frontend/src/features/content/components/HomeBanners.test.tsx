import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FooterView } from "@/components/layout/Footer";
import type { PublicBanner } from "@/types/settings";
import { DEFAULT_PUBLIC_SETTINGS } from "../publicSettingsDefaults";
import { HomeBanners } from "./HomeBanners";

const b = (over: Partial<PublicBanner> = {}): PublicBanner => ({
  imageUrl: "/uploads/a.webp",
  alt: "Khuyến mãi mùa đông",
  title: "Giảm 20%",
  subtitle: "Cho đơn đầu tiên",
  href: "/san-pham",
  isActive: true,
  ...over,
});

describe("HomeBanners", () => {
  it("render ảnh, tiêu đề, phụ đề và bọc link nội bộ", () => {
    render(
      <HomeBanners banners={[b(), b({ imageUrl: "/uploads/b.webp", alt: "Hai", href: null })]} />,
    );
    expect(screen.getByAltText("Khuyến mãi mùa đông")).toBeInTheDocument();
    expect(screen.getAllByText("Giảm 20%")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Giảm 20%/ })).toHaveAttribute("href", "/san-pham");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("không có banner hợp lệ -> không render gì; bỏ banner không an toàn", () => {
    const { container, rerender } = render(<HomeBanners banners={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(
      <HomeBanners
        banners={[
          b({ imageUrl: "https://evil.example/x.png" }),
          b({ href: "//evil.example" }),
          b({ alt: "Tắt", isActive: false }),
        ]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("tiêu đề là text thuần (không diễn giải HTML)", () => {
    render(<HomeBanners banners={[b({ title: "<b>x</b>", href: null })]} />);
    expect(screen.getByText("<b>x</b>")).toBeInTheDocument();
  });
});

describe("FooterView", () => {
  it("hiển thị email (mailto) và SĐT (tel) khi có", () => {
    render(
      <FooterView
        contact={{ name: "BeanBox", email: "shop@example.vn", phone: "0901 234 567", address: "" }}
      />,
    );
    expect(screen.getByRole("link", { name: "shop@example.vn" })).toHaveAttribute(
      "href",
      "mailto:shop@example.vn",
    );
    expect(screen.getByRole("link", { name: "0901 234 567" })).toHaveAttribute(
      "href",
      "tel:0901234567",
    );
  });

  it("mặc định: có email, không có SĐT", () => {
    render(<FooterView contact={DEFAULT_PUBLIC_SETTINGS.store.contact} />);
    expect(screen.getByRole("link", { name: "hello@beanbox.local" })).toBeInTheDocument();
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
  });
});
