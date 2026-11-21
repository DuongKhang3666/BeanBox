import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MAIN_NAV } from "@/lib/site";
import { MobileCategoryMenu } from "./MobileCategoryMenu";

function setup() {
  render(
    <div>
      <button type="button">Ngoài menu</button>
      <MobileCategoryMenu />
    </div>,
  );
  const button = screen.getByRole("button", { name: "Danh mục" });
  return { button, user: userEvent.setup() };
}

describe("MobileCategoryMenu", () => {
  it("mặc định đóng: aria-expanded=false, bảng ẩn, aria-controls trỏ đúng bảng", () => {
    const { button } = setup();
    expect(button).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(button.getAttribute("aria-controls")!);
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("hidden");
    expect(screen.queryByRole("link", { name: MAIN_NAV[0]!.label })).not.toBeInTheDocument();
  });

  it("bấm nút mở bảng với đủ mục danh mục, bấm lần nữa thì đóng", async () => {
    const { button, user } = setup();
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const nav = screen.getByRole("navigation", { name: "Danh mục sản phẩm" });
    for (const item of MAIN_NAV) {
      expect(screen.getByRole("link", { name: item.label })).toHaveAttribute("href", item.href);
    }
    expect(nav).toBeVisible();
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(nav).not.toBeVisible();
  });

  it("Escape đóng và trả focus về nút", async () => {
    const { button, user } = setup();
    await user.click(button);
    await user.tab(); // focus vào link đầu tiên trong bảng
    expect(screen.getByRole("link", { name: MAIN_NAV[0]!.label })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  it("chọn một link thì đóng bảng", async () => {
    const { button, user } = setup();
    await user.click(button);
    await user.click(screen.getByRole("link", { name: MAIN_NAV[1]!.label }));
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("bấm ra ngoài thì đóng", async () => {
    const { button, user } = setup();
    await user.click(button);
    await user.click(screen.getByRole("button", { name: "Ngoài menu" }));
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});
