import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetCompareForTests, addToCompare, getCompareSnapshot } from "../store";
import { CompareBar, isCompareBarHidden } from "./CompareBar";

const path = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.value }));

const p = (n: number) => ({
  slug: `sp-${n}`,
  name: `Cà phê ${n}`,
  imageUrl: null,
  categoryName: null,
});

beforeEach(() => {
  window.localStorage.clear();
  __resetCompareForTests();
  path.value = "/danh-muc/ca-phe-hat";
});

describe("CompareBar", () => {
  it("không hiện khi chưa chọn sản phẩm nào", () => {
    render(<CompareBar />);
    expect(screen.queryByRole("complementary", { name: "So sánh sản phẩm" })).toBeNull();
  });

  it("1 sản phẩm: link bị vô hiệu kèm chú thích", () => {
    addToCompare(p(1));
    render(<CompareBar />);
    const bar = screen.getByRole("complementary", { name: "So sánh sản phẩm" });
    expect(within(bar).queryByRole("link")).toBeNull();
    expect(within(bar).getByText("So sánh (1)")).toHaveAttribute("aria-disabled", "true");
    expect(within(bar).getByText("Chọn thêm ít nhất 1 sản phẩm")).toBeInTheDocument();
  });

  it("từ 2 sản phẩm: link tới /so-sanh?sp= đúng thứ tự", () => {
    addToCompare(p(1));
    addToCompare(p(2));
    render(<CompareBar />);
    expect(screen.getByRole("link", { name: "So sánh (2)" })).toHaveAttribute(
      "href",
      "/so-sanh?sp=sp-1,sp-2",
    );
    expect(screen.queryByText("Chọn thêm ít nhất 1 sản phẩm")).toBeNull();
  });

  it("bỏ từng món và Xóa tất cả", async () => {
    addToCompare(p(1));
    addToCompare(p(2));
    addToCompare(p(3));
    const u = userEvent.setup();
    render(<CompareBar />);
    await u.click(screen.getByRole("button", { name: "Bỏ Cà phê 2 khỏi so sánh" }));
    expect(getCompareSnapshot().map((e) => e.slug)).toEqual(["sp-1", "sp-3"]);
    await u.click(screen.getByRole("button", { name: "Xóa tất cả" }));
    expect(getCompareSnapshot()).toHaveLength(0);
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it.each(["/so-sanh", "/thanh-toan", "/thanh-toan/ket-qua", "/admin", "/admin/san-pham"])(
    "ẩn ở %s",
    (route) => {
      addToCompare(p(1));
      path.value = route;
      render(<CompareBar />);
      expect(screen.queryByRole("complementary")).toBeNull();
    },
  );

  it("không ẩn nhầm các route có tiền tố tương tự", () => {
    expect(isCompareBarHidden("/so-sanh-gia")).toBe(false);
    expect(isCompareBarHidden("/administrator")).toBe(false);
    expect(isCompareBarHidden("/")).toBe(false);
    expect(isCompareBarHidden(null)).toBe(false);
  });
});
