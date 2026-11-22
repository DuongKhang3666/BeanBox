import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeUser } from "@/features/account/testing";
import { ADMIN_2FA_REQUIRED_EVENT } from "@/lib/api/client";
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

  it("D-070: Admin bị bắt buộc 2FA mà chưa bật -> màn hình hướng dẫn, nút tới /tai-khoan, không chuyển hướng, không lộ nội dung", () => {
    auth = {
      status: "authenticated",
      user: makeUser({ role: "ADMIN", twoFactorRequired: true }),
      logoutReason: null,
    };
    renderGuard();
    expect(screen.getByRole("heading", { name: "Cần bật xác thực 2 lớp" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bật xác thực 2 lớp" })).toHaveAttribute(
      "href",
      "/tai-khoan#account-2fa",
    );
    expect(screen.queryByText("Nội dung quản trị")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Đơn hàng" })).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("D-070: cờ tắt hoặc Admin đã bật 2FA -> vào bình thường", () => {
    auth = {
      status: "authenticated",
      user: makeUser({ role: "ADMIN", twoFactorEnabled: true, twoFactorRequired: false }),
      logoutReason: null,
    };
    renderGuard();
    expect(screen.getByText("Nội dung quản trị")).toBeInTheDocument();
    expect(screen.queryByText("Cần bật xác thực 2 lớp")).not.toBeInTheDocument();
  });

  it("D-070: cờ bật giữa phiên (sự kiện 403) -> chuyển sang màn hình bật 2FA, không chuyển hướng", () => {
    auth = {
      status: "authenticated",
      user: makeUser({ role: "ADMIN", twoFactorEnabled: false, twoFactorRequired: false }),
      logoutReason: null,
    };
    renderGuard();
    expect(screen.getByText("Nội dung quản trị")).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new CustomEvent(ADMIN_2FA_REQUIRED_EVENT));
    });
    expect(screen.getByRole("heading", { name: "Cần bật xác thực 2 lớp" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bật xác thực 2 lớp" })).toHaveAttribute(
      "href",
      "/tai-khoan#account-2fa",
    );
    expect(screen.queryByText("Nội dung quản trị")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("D-070: sự kiện 403 nhưng user đã bật 2FA (đã làm mới) -> vẫn vào được", () => {
    auth = {
      status: "authenticated",
      user: makeUser({ role: "ADMIN", twoFactorEnabled: true, twoFactorRequired: false }),
      logoutReason: null,
    };
    renderGuard();
    act(() => {
      window.dispatchEvent(new CustomEvent(ADMIN_2FA_REQUIRED_EVENT));
    });
    expect(screen.getByText("Nội dung quản trị")).toBeInTheDocument();
  });
});
