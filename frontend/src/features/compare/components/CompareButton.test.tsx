import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetCompareForTests, addToCompare, getCompareSnapshot } from "../store";
import { CompareBar } from "./CompareBar";
import { CompareButton } from "./CompareButton";

vi.mock("next/navigation", () => ({ usePathname: () => "/danh-muc/ca-phe-hat" }));

const p = (n: number) => ({
  slug: `sp-${n}`,
  name: `Cà phê ${n}`,
  imageUrl: null,
  categoryName: "Cà phê hạt",
});

beforeEach(() => {
  window.localStorage.clear();
  __resetCompareForTests();
});

describe("CompareButton", () => {
  it("toggle: tên đọc được thay đổi, aria-pressed đúng, lưu vào store", async () => {
    const u = userEvent.setup();
    render(<CompareButton product={p(1)} />);
    const add = screen.getByRole("button", { name: "Thêm Cà phê 1 vào so sánh" });
    expect(add).toHaveAttribute("aria-pressed", "false");
    await u.click(add);
    expect(getCompareSnapshot().map((e) => e.slug)).toEqual(["sp-1"]);
    const remove = screen.getByRole("button", { name: "Bỏ Cà phê 1 khỏi so sánh" });
    expect(remove).toHaveAttribute("aria-pressed", "true");
    await u.click(remove);
    expect(getCompareSnapshot()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Thêm Cà phê 1 vào so sánh" })).toBeInTheDocument();
  });

  it("phản ánh trạng thái đã chọn từ store ngay khi render", () => {
    addToCompare(p(2));
    render(<CompareButton product={p(2)} variant="labeled" />);
    expect(screen.getByRole("button", { name: "Bỏ Cà phê 2 khỏi so sánh" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("đã đủ 4: không thêm và hiện thông báo role=status", async () => {
    for (let i = 1; i <= 4; i++) addToCompare(p(i));
    const u = userEvent.setup();
    render(
      <>
        <CompareButton product={p(5)} />
        <CompareBar />
      </>,
    );
    await u.click(screen.getByRole("button", { name: "Thêm Cà phê 5 vào so sánh" }));
    expect(getCompareSnapshot()).toHaveLength(4);
    expect(screen.getByRole("status")).toHaveTextContent("Chỉ so sánh tối đa 4 sản phẩm");
    expect(screen.getByRole("button", { name: "Thêm Cà phê 5 vào so sánh" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
