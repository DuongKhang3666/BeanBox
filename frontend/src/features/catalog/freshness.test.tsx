import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CartLine } from "@/features/cart/components/CartLine";
import { cartErrorMessage, cartWarningMessage } from "@/features/cart/messages";
import { makeCartItem } from "@/features/cart/testing";
import { orderErrorMessage } from "@/features/orders/labels";
import { ApiError } from "@/lib/api/errors";
import { AddToCartPanel, pickDefaultVariant } from "./components/AddToCartPanel";
import { makeVariant } from "./fixtures";
import { roastAgeLabel, roastWarning } from "./freshness";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("@/features/cart/CartProvider", () => ({
  useCart: () => ({
    addItem: vi.fn(),
    openMiniCart: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    pending: { adding: false, itemIds: new Set() },
  }),
}));

describe("nhãn độ tươi hạt (D-082)", () => {
  it("roastAgeLabel", () => {
    expect(roastAgeLabel(null)).toBe("");
    expect(roastAgeLabel(0)).toBe("Rang hôm nay");
    expect(roastAgeLabel(12)).toBe("Rang 12 ngày trước");
  });

  it("roastWarning theo trạng thái", () => {
    expect(roastWarning(null)).toBeNull();
    expect(roastWarning("FRESH")).toBeNull();
    expect(roastWarning("PAST_RECOMMENDED")).toMatch(/30 ngày/);
    expect(roastWarning("EXPIRED")).toMatch(/Ngừng bán do quá hạn rang/);
  });
});

describe("AddToCartPanel với độ tươi", () => {
  it("lô còn tươi: hiện 'Rang X ngày trước', không cảnh báo, nút Thêm vào giỏ", () => {
    render(
      <AddToCartPanel
        variants={[
          makeVariant({ roastDate: "2026-11-10", roastAgeDays: 13, roastStatus: "FRESH" }),
        ]}
      />,
    );
    expect(screen.getByText(/Ngày rang: 10\/11\/2026 \(Rang 13 ngày trước\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Nên dùng trong 30 ngày/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thêm vào giỏ" })).toBeEnabled();
  });

  it("quá 30 ngày: cảnh báo nhưng vẫn mua được", () => {
    render(
      <AddToCartPanel
        variants={[
          makeVariant({
            roastDate: "2026-09-20",
            roastAgeDays: 64,
            roastStatus: "PAST_RECOMMENDED",
          }),
        ]}
      />,
    );
    expect(screen.getByText(/Rang 64 ngày trước/)).toBeInTheDocument();
    expect(screen.getByText(/Nên dùng trong 30 ngày sau rang/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thêm vào giỏ" })).toBeEnabled();
  });

  it("quá 90 ngày: nút disabled 'Ngừng bán do quá hạn rang', không có ô số lượng", () => {
    render(
      <AddToCartPanel
        variants={[
          makeVariant({
            roastDate: "2026-06-01",
            roastAgeDays: 175,
            roastStatus: "EXPIRED",
            maxQuantity: 0,
          }),
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Ngừng bán do quá hạn rang" })).toBeDisabled();
    expect(screen.queryByLabelText("Số lượng")).not.toBeInTheDocument();
    expect(screen.getByText(/quá 90 ngày/)).toBeInTheDocument();
  });

  it("biến thể mặc định bỏ qua lô quá hạn", () => {
    const old = makeVariant({ id: "old", roastStatus: "EXPIRED", roastAgeDays: 120 });
    const ok = makeVariant({ id: "ok" });
    expect(pickDefaultVariant([old, ok])?.id).toBe("ok");
    expect(pickDefaultVariant([old])?.id).toBe("old");
  });
});

describe("giỏ hàng và thông báo lỗi với độ tươi", () => {
  it("dòng giỏ quá 30 ngày: hiện nhãn tuổi hạt và gợi ý", () => {
    render(
      <ul>
        <CartLine item={makeCartItem({ roastAgeDays: 45, roastStatus: "PAST_RECOMMENDED" })} />
      </ul>,
    );
    expect(screen.getByText(/Rang 45 ngày trước\. Nên dùng trong 30 ngày/)).toBeInTheDocument();
  });

  it("dòng giỏ quá 90 ngày: cảnh báo UNAVAILABLE là 'Ngừng bán do quá hạn rang'", () => {
    const item = makeCartItem({
      warnings: ["UNAVAILABLE"],
      roastAgeDays: 100,
      roastStatus: "EXPIRED",
    });
    expect(cartWarningMessage("UNAVAILABLE", item)).toBe("Ngừng bán do quá hạn rang");
    render(
      <ul>
        <CartLine item={item} />
      </ul>,
    );
    expect(screen.getByText("Ngừng bán do quá hạn rang")).toBeInTheDocument();
    expect(screen.queryByLabelText("Tăng số lượng")).not.toBeInTheDocument();
  });

  it("lỗi 409 ITEM_UNAVAILABLE có reason ROAST_EXPIRED", () => {
    const err = new ApiError(409, "ITEM_UNAVAILABLE", "x", { reason: "ROAST_EXPIRED" });
    expect(cartErrorMessage(err)).toBe("Ngừng bán do quá hạn rang.");
    const order = new ApiError(409, "ITEM_UNAVAILABLE", "x", {
      items: [{ variantId: "v", reason: "ROAST_EXPIRED" }],
    });
    expect(orderErrorMessage(order)).toMatch(/quá hạn rang/);
    expect(orderErrorMessage(new ApiError(409, "ITEM_UNAVAILABLE", "x", { items: [] }))).toMatch(
      /ngừng bán/,
    );
  });
});
