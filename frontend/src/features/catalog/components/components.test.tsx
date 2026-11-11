import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeProduct, makeVariant } from "../fixtures";
import { AddToCartPanel } from "./AddToCartPanel";
import { PriceTag } from "./PriceTag";
import { ProductCard } from "./ProductCard";
import { ProductDescription } from "./ProductDescription";

vi.mock("@/features/cart/CartProvider", () => ({
  useCart: () => ({ addItem: vi.fn(), openMiniCart: vi.fn(), pending: { adding: false } }),
}));

describe("PriceTag", () => {
  it("giá thường theo định dạng 185.000₫, không có giảm giá", () => {
    render(<PriceTag price={185000} />);
    expect(screen.getByText("185.000₫")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("giá sale: hiện giá cũ gạch ngang và % giảm làm tròn xuống", () => {
    const { container } = render(<PriceTag price={185000} compareAtPrice={210000} />);
    expect(container.querySelector("del")).toHaveTextContent("210.000₫");
    expect(screen.getByText("-11%")).toBeInTheDocument(); // 11.9 -> 11
  });
});

describe("ProductCard", () => {
  it("link tới trang chi tiết đúng slug", () => {
    render(<ProductCard product={makeProduct()} />);
    expect(screen.getByRole("link", { name: "Ethiopia Yirgacheffe" })).toHaveAttribute(
      "href",
      "/san-pham/ethiopia-yirgacheffe",
    );
  });

  it("hiện nhãn Hết hàng khi inStock=false", () => {
    render(<ProductCard product={makeProduct({ inStock: false })} />);
    expect(screen.getByText("Hết hàng")).toBeInTheDocument();
  });

  it("ẩn sao khi ratingCount=0, hiện khi có đánh giá", () => {
    const { rerender } = render(
      <ProductCard product={makeProduct({ ratingCount: 0, ratingAvg: 0 })} />,
    );
    expect(screen.queryByText(/đánh giá/)).not.toBeInTheDocument();
    rerender(<ProductCard product={makeProduct()} />);
    expect(screen.getByText("(18 đánh giá)")).toBeInTheDocument();
  });

  it("hiện Nổi bật, mức rang và alt ảnh", () => {
    render(<ProductCard product={makeProduct({ isFeatured: true })} />);
    expect(screen.getByText("Nổi bật")).toBeInTheDocument();
    expect(screen.getByText("Rang sáng")).toBeInTheDocument();
    expect(screen.getByAltText("Túi cà phê")).toBeInTheDocument();
  });

  it("không có ảnh -> placeholder có tên sản phẩm", () => {
    render(<ProductCard product={makeProduct({ primaryImage: null })} />);
    expect(screen.getByRole("img", { name: "Ethiopia Yirgacheffe" })).toBeInTheDocument();
  });
});

describe("AddToCartPanel", () => {
  const variants = [
    makeVariant({ id: "a", name: "250 g", stockStatus: "OUT_OF_STOCK", maxQuantity: 0 }),
    makeVariant({
      id: "b",
      name: "500 g",
      price: 380000,
      effectivePrice: 300000,
      salePrice: 300000,
      isOnSale: true,
      saleEndsAt: "2026-11-30T16:59:59.000Z",
      stockStatus: "LOW_STOCK",
      maxQuantity: 3,
      roastDate: "2026-11-01",
    }),
    makeVariant({ id: "c", name: "1 kg", price: 700000, effectivePrice: 700000 }),
  ];

  it("mặc định chọn biến thể còn hàng đầu tiên", () => {
    render(<AddToCartPanel variants={variants} />);
    expect(screen.getByRole("radio", { name: "500 g" })).toBeChecked();
    expect(screen.getByText("300.000₫")).toBeInTheDocument();
    expect(screen.getByText("-21%")).toBeInTheDocument();
    expect(screen.getByText("Sắp hết hàng")).toBeInTheDocument();
    expect(screen.getByText("Sale đến 30/11/2026")).toBeInTheDocument();
    expect(screen.getByText("Ngày rang: 01/11/2026")).toBeInTheDocument();
  });

  it("đổi biến thể cập nhật giá và trạng thái", async () => {
    const user = userEvent.setup();
    render(<AddToCartPanel variants={variants} />);
    await user.click(screen.getByRole("radio", { name: "1 kg" }));
    expect(screen.getByText("700.000₫")).toBeInTheDocument();
    expect(screen.getByText("Còn hàng")).toBeInTheDocument();
    expect(screen.queryByText(/Sale đến/)).not.toBeInTheDocument();
  });

  it("biến thể hết hàng -> nút disabled chữ Hết hàng", async () => {
    const user = userEvent.setup();
    render(<AddToCartPanel variants={variants} />);
    await user.click(screen.getByRole("radio", { name: /250 g/ }));
    expect(screen.getByRole("button", { name: "Hết hàng" })).toBeDisabled();
    expect(screen.queryByLabelText("Số lượng")).not.toBeInTheDocument();
  });

  it("còn hàng: nút bật; số lượng bị chặn bởi maxQuantity", async () => {
    const user = userEvent.setup();
    render(<AddToCartPanel variants={variants} />);
    expect(screen.getByRole("button", { name: "Thêm vào giỏ" })).toBeEnabled();
    const qty = screen.getByLabelText("Số lượng");
    const plus = screen.getByRole("button", { name: "Tăng số lượng" });
    await user.click(plus);
    await user.click(plus);
    await user.click(plus);
    expect(qty).toHaveValue(3);
    expect(plus).toBeDisabled();
  });

  it("nếu tất cả hết hàng thì chọn biến thể đầu", () => {
    render(
      <AddToCartPanel
        variants={[
          makeVariant({ id: "x", name: "A", stockStatus: "OUT_OF_STOCK" }),
          makeVariant({ id: "y", name: "B", stockStatus: "OUT_OF_STOCK" }),
        ]}
      />,
    );
    expect(screen.getByRole("radio", { name: /A/ })).toBeChecked();
  });
});

describe("ProductDescription", () => {
  it("<script> hiển thị như text, không tạo phần tử script", () => {
    const { container } = render(
      <ProductDescription markdown={"Xin chào <script>alert(1)</script>"} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("đoạn văn và gạch đầu dòng thành p / ul", () => {
    const { container } = render(
      <ProductDescription markdown={"Đoạn một.\n\n- Hoa nhài\n- Cam chanh\n\nĐoạn hai **đậm**."} />,
    );
    expect(container.querySelectorAll("p")).toHaveLength(2);
    const items = within(container.querySelector("ul")!).getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual(["Hoa nhài", "Cam chanh"]);
    expect(container.querySelector("strong")).toHaveTextContent("đậm");
  });
});
