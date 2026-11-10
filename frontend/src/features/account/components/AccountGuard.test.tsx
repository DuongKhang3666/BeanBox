import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountGuard } from "./AccountGuard";

const replace = vi.fn();
let pathname = "/tai-khoan";
let auth: { status: string; logout: () => Promise<void> } = {
  status: "loading",
  logout: async () => {},
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => pathname,
}));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => auth }));

beforeEach(() => {
  replace.mockReset();
  pathname = "/tai-khoan";
});

describe("AccountGuard", () => {
  it("loading -> skeleton, không chuyển trang, không render nội dung", () => {
    auth = { status: "loading", logout: async () => {} };
    render(
      <AccountGuard>
        <p>Nội dung riêng tư</p>
      </AccountGuard>,
    );
    expect(screen.getByTestId("account-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Nội dung riêng tư")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("anonymous -> replace sang /dang-nhap với next đã mã hóa", () => {
    auth = { status: "anonymous", logout: async () => {} };
    pathname = "/tai-khoan/dia-chi";
    render(
      <AccountGuard>
        <p>Nội dung riêng tư</p>
      </AccountGuard>,
    );
    expect(replace).toHaveBeenCalledWith("/dang-nhap?next=%2Ftai-khoan%2Fdia-chi");
    expect(screen.queryByText("Nội dung riêng tư")).not.toBeInTheDocument();
  });

  it("authenticated -> nội dung + điều hướng, đánh dấu mục hiện tại, Đơn hàng không bấm được", () => {
    auth = { status: "authenticated", logout: async () => {} };
    pathname = "/tai-khoan/dia-chi";
    render(
      <AccountGuard>
        <p>Nội dung riêng tư</p>
      </AccountGuard>,
    );
    expect(screen.getByText("Nội dung riêng tư")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sổ địa chỉ" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Hồ sơ" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("link", { name: /Đơn hàng/ })).not.toBeInTheDocument();
    expect(screen.getByText("Sắp có")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("Đăng xuất: gọi logout rồi về trang chủ, không đẩy sang đăng nhập", async () => {
    const logout = vi.fn(async () => {});
    auth = { status: "authenticated", logout };
    render(
      <AccountGuard>
        <p>x</p>
      </AccountGuard>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Đăng xuất" }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/");
    expect(replace).not.toHaveBeenCalledWith(expect.stringContaining("/dang-nhap"));
  });
});
