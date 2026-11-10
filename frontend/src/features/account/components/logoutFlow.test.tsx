import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HeaderAccount } from "@/components/layout/HeaderAccount";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { AUTH_LOGOUT_EVENT, SESSION_FLAG_KEY, tokenStore } from "@/lib/api/client";
import { AccountGuard } from "./AccountGuard";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/tai-khoan",
}));
vi.mock("@/features/auth/api", () => ({ logout: vi.fn(async () => {}) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const user = {
  id: "u1",
  email: "an@example.com",
  fullName: "Nguyễn Văn An",
  phone: null,
  birthDate: null,
  avatarUrl: null,
  role: "CUSTOMER",
  emailVerified: false,
  createdAt: "2026-11-10T08:30:00.000Z",
};

async function renderAuthenticated() {
  window.localStorage.setItem(SESSION_FLAG_KEY, "1");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { user, accessToken: "tok", expiresIn: 900 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
  render(
    <AuthProvider>
      <HeaderAccount />
      <AccountGuard>
        <p>Nội dung riêng tư</p>
      </AccountGuard>
    </AuthProvider>,
  );
  await screen.findByText("Nội dung riêng tư");
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  window.localStorage.clear();
  tokenStore.clear();
});

describe("đăng xuất ở khu tài khoản", () => {
  it("đăng xuất từ Header: chỉ về '/', không replace sang /dang-nhap", async () => {
    await renderAuthenticated();
    const buttons = screen.getAllByRole("button", { name: "Đăng xuất" });
    await userEvent.setup().click(buttons[0]!);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    await waitFor(() => expect(screen.queryByText("Nội dung riêng tư")).not.toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });

  it("hết phiên (AUTH_LOGOUT_EVENT): sang /dang-nhap?next=%2Ftai-khoan", async () => {
    await renderAuthenticated();
    act(() => {
      window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dang-nhap?next=%2Ftai-khoan"));
    expect(push).not.toHaveBeenCalled();
  });
});
