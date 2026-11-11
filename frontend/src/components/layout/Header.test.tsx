import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeUser } from "@/features/account/testing";
import type { UserRole } from "@/types/auth";
import { Header } from "./Header";

let role: UserRole;

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: makeUser({ role }),
    logout: async () => {},
  }),
}));
vi.mock("@/features/cart/CartProvider", () => ({ useCart: () => ({ cart: null }) }));

describe("Header - bố cục khi đăng nhập STAFF/ADMIN (viewport 1024)", () => {
  it("ô tìm kiếm có min-width, flex-1 và không còn min-w-0", () => {
    role = "ADMIN";
    render(<Header />);
    const form = screen.getByRole("search");
    const cls = form.className.split(/\s+/);
    expect(cls).toContain("flex-1");
    expect(cls).toContain("min-w-40"); // 10rem từ mobile (thiếu chỗ thì xuống hàng)
    expect(cls).toContain("lg:min-w-48"); // 12rem từ lg
    expect(cls).toContain("md:max-w-xs");
    expect(cls).not.toContain("min-w-0");
    expect(screen.getByPlaceholderText(/Tìm hạt cà phê/)).toBeInTheDocument();
  });

  it("thanh header cho phép xuống hàng và nhóm icon không bị co", () => {
    role = "STAFF";
    const { container } = render(<Header />);
    expect(container.querySelector("header > div")?.className).toContain("flex-wrap");
    expect(screen.getByRole("link", { name: /Giỏ hàng/ }).parentElement?.className).toContain(
      "shrink-0",
    );
  });

  it("link Quản trị thu về icon dưới xl nhưng vẫn truy cập được bằng aria-label", () => {
    role = "STAFF";
    render(<Header />);
    const link = screen.getByRole("link", { name: "Quản trị" });
    expect(link).toHaveAttribute("href", "/admin/don-hang");
    expect(link).toHaveAttribute("aria-label", "Quản trị");
    const label = link.querySelector("span");
    expect(label?.className).toContain("hidden");
    expect(label?.className).toContain("xl:inline");
    expect(link.querySelector("svg")).not.toBeNull();
  });

  it("nút Đăng xuất vẫn có tên truy cập khi chỉ hiện icon", () => {
    role = "ADMIN";
    render(<Header />);
    expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeInTheDocument();
  });
});
