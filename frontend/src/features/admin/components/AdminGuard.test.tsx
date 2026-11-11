import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeUser } from "@/features/account/testing";
import type { UserRole } from "@/types/auth";
import { AdminGuard } from "./AdminGuard";

const replace = vi.fn();
let pathname = "/admin/don-hang";
let auth: { status: string; user: ReturnType<typeof makeUser> | null; logoutReason: null } = {
  status: "loading",
  user: null,
  logoutReason: null,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => pathname,
}));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => auth }));

function signedIn(role: UserRole) {
  auth = { status: "authenticated", user: makeUser({ role }), logoutReason: null };
}

function renderGuard() {
  return render(
    <AdminGuard>
      <p>Nội dung quản trị</p>
    </AdminGuard>,
  );
}

beforeEach(() => {
  replace.mockReset();
  pathname = "/admin/don-hang";
});

describe("AdminGuard", () => {
  it("loading -> skeleton, không chuyển trang, không lộ nội dung", () => {
    auth = { status: "loading", user: null, logoutReason: null };
    renderGuard();
    expect(screen.getByTestId("admin-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Nội dung quản trị")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("anonymous -> replace sang /dang-nhap với next đã mã hóa", () => {
    auth = { status: "anonymous", user: null, logoutReason: null };
    pathname = "/admin/don-hang/BB-261110-K7QP";
    renderGuard();
    expect(replace).toHaveBeenCalledWith("/dang-nhap?next=%2Fadmin%2Fdon-hang%2FBB-261110-K7QP");
    expect(screen.queryByText("Nội dung quản trị")).not.toBeInTheDocument();
  });

  it("CUSTOMER bị chặn: thông báo không có quyền + link trang chủ, không render nội dung", () => {
    signedIn("CUSTOMER");
    renderGuard();
    expect(screen.getByText("Bạn không có quyền truy cập khu quản trị")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
    expect(screen.queryByText("Nội dung quản trị")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it.each(["STAFF", "ADMIN"] as const)(
    "%s vào được: nội dung + menu, aria-current đúng mục",
    (role) => {
      signedIn(role);
      pathname = "/admin/don-hang/BB-261110-K7QP";
      renderGuard();
      expect(screen.getByText("Nội dung quản trị")).toBeInTheDocument();
      const orders = screen.getByRole("link", { name: "Đơn hàng" });
      expect(orders).toHaveAttribute("aria-current", "page");
      expect(orders).toHaveAttribute("href", "/admin/don-hang");
      expect(screen.getByRole("link", { name: "Tồn kho" })).not.toHaveAttribute("aria-current");
      for (const n of ["Sản phẩm", "Danh mục", "Thương hiệu"]) {
        expect(screen.getByRole("link", { name: n })).toBeInTheDocument();
      }
    },
  );
});
