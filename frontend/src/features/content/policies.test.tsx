import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductImage } from "@/features/catalog/components/ProductImage";
import { PolicyArticle } from "./components/PolicyArticle";
import { POLICIES, POLICY_SLUGS, isPolicySlug } from "./policies";

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
    expect(screen.getByText(/20\.000đ \(3–5 ngày\)/)).toBeInTheDocument();
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
