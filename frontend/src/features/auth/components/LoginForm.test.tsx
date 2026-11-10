import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "@/lib/api/client";
import { AuthProvider } from "../AuthProvider";
import { LoginForm } from "./LoginForm";

const replace = vi.fn();
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => search,
}));

const user = {
  id: "u1",
  email: "an@example.com",
  fullName: "An",
  phone: null,
  birthDate: null,
  avatarUrl: null,
  role: "CUSTOMER",
  emailVerified: true,
  createdAt: "2026-11-10T08:30:00.000Z",
};

function jsonRes(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderForm() {
  return render(
    <AuthProvider>
      <LoginForm />
    </AuthProvider>,
  );
}

async function fillAndSubmit(u: ReturnType<typeof userEvent.setup>) {
  await u.type(screen.getByLabelText("Email"), "An@Example.com");
  await u.type(screen.getByLabelText("Mật khẩu"), "Matkhau123");
  await u.click(screen.getByRole("button", { name: /^Đăng nhập$/ }));
}

beforeEach(() => {
  window.localStorage.clear();
  tokenStore.clear();
  replace.mockReset();
  search = new URLSearchParams();
});
afterEach(() => vi.unstubAllGlobals());

describe("LoginForm", () => {
  it("báo lỗi field khi để trống, không gọi mạng", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const u = userEvent.setup();
    renderForm();
    await u.click(screen.getByRole("button", { name: /^Đăng nhập$/ }));
    expect(await screen.findByText("Vui lòng nhập email")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hiển thị lỗi INVALID_CREDENTIALS", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonRes(401, { error: { code: "INVALID_CREDENTIALS", message: "Sai thông tin" } }),
      ),
    );
    const u = userEvent.setup();
    renderForm();
    await fillAndSubmit(u);
    expect(await screen.findByRole("alert")).toHaveTextContent("Email hoặc mật khẩu không đúng");
    expect(replace).not.toHaveBeenCalled();
  });

  it("hiển thị lỗi ACCOUNT_LOCKED với giờ Việt Nam", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonRes(403, {
          error: {
            code: "ACCOUNT_LOCKED",
            message: "Khóa",
            details: { lockedUntil: "2026-11-10T08:30:00.000Z" },
          },
        }),
      ),
    );
    const u = userEvent.setup();
    renderForm();
    await fillAndSubmit(u);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tài khoản tạm khóa đến 15:30 10/11/2026",
    );
  });

  it("thành công: gọi API với email chuẩn hóa và router.replace theo next an toàn", async () => {
    search = new URLSearchParams({ next: "/gio-hang" });
    const fetchMock = vi.fn(async () =>
      jsonRes(200, { data: { user, accessToken: "tok", expiresIn: 900 } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const u = userEvent.setup();
    renderForm();
    await fillAndSubmit(u);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/gio-hang"));
    expect(replace).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      email: "an@example.com",
      password: "Matkhau123",
    });
    expect(tokenStore.get()).toBe("tok");
  });

  it("next độc hại bị thay bằng /tai-khoan", async () => {
    search = new URLSearchParams({ next: "//evil.com" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes(200, { data: { user, accessToken: "tok", expiresIn: 900 } })),
    );
    const u = userEvent.setup();
    renderForm();
    await fillAndSubmit(u);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/tai-khoan"));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("link đăng ký giữ ?next", () => {
    search = new URLSearchParams({ next: "/gio-hang" });
    vi.stubGlobal("fetch", vi.fn());
    renderForm();
    expect(screen.getByRole("link", { name: "Đăng ký" })).toHaveAttribute(
      "href",
      "/dang-ky?next=%2Fgio-hang",
    );
  });
});
