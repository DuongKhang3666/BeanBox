import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionFlag, tokenStore } from "@/lib/api/client";
import { AuthProvider } from "../AuthProvider";
import { LoginForm } from "./LoginForm";

const replace = vi.fn();
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => search,
}));

const CHALLENGE = "chal-token-xyz-0123456789";
const user = {
  id: "u1",
  email: "nv@example.com",
  fullName: "Nhân viên",
  phone: null,
  birthDate: null,
  avatarUrl: null,
  role: "STAFF",
  emailVerified: true,
  twoFactorEnabled: true,
  createdAt: "2026-11-10T08:30:00.000Z",
};

function jsonRes(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
const challengeBody = (expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()) => ({
  data: { twoFactorRequired: true, challengeToken: CHALLENGE, expiresAt },
});
const session = { data: { user, accessToken: "tok2fa", expiresIn: 900 } };

type Route = (url: string, body: Record<string, unknown>) => Response;
function stubFetch(route: Route) {
  const mock = vi.fn(async (url: string, init: RequestInit = {}) =>
    route(url, init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {}),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}
const callsTo = (m: ReturnType<typeof stubFetch>, path: string) =>
  m.mock.calls.filter((c) => String(c[0]).endsWith(path));

function renderForm() {
  return render(
    <AuthProvider>
      <LoginForm />
    </AuthProvider>,
  );
}

async function toStep2(u: ReturnType<typeof userEvent.setup>) {
  await u.type(screen.getByLabelText("Email"), "nv@example.com");
  await u.type(screen.getByLabelText("Mật khẩu"), "Matkhau123");
  await u.click(screen.getByRole("button", { name: /^Đăng nhập$/ }));
  return screen.findByLabelText("Mã xác thực");
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  tokenStore.clear();
  replace.mockReset();
  search = new URLSearchParams();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("LoginForm: bước 2 (xác thực 2 lớp)", () => {
  it("nhận thử thách: sang bước 2, focus ô mã, không có phiên, không lưu token vào storage", async () => {
    stubFetch((url) =>
      url.endsWith("/auth/login") ? jsonRes(200, challengeBody()) : jsonRes(404, {}),
    );
    const u = userEvent.setup();
    renderForm();
    const input = await toStep2(u);

    expect(screen.getByRole("heading", { name: "Xác thực 2 lớp" })).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(screen.getByText(/hết hạn sau/)).toHaveTextContent("5:00");
    expect(screen.getByRole("button", { name: "Dùng mã dự phòng" })).toBeInTheDocument();

    expect(tokenStore.get()).toBeNull();
    expect(sessionFlag.has()).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    const dump =
      JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage });
    expect(dump).not.toContain(CHALLENGE);
    expect(window.localStorage.length).toBe(0);
  });

  it("nhập mã TOTP (có khoảng trắng): gửi đúng body, đặt phiên, chuyển trang theo next", async () => {
    search = new URLSearchParams({ next: "/gio-hang" });
    const mock = stubFetch((url) =>
      url.endsWith("/auth/login")
        ? jsonRes(200, challengeBody())
        : url.endsWith("/auth/login/2fa")
          ? jsonRes(200, session)
          : jsonRes(404, {}),
    );
    const u = userEvent.setup();
    renderForm();
    const input = await toStep2(u);
    await u.type(input, "123 456");
    await u.click(screen.getByRole("button", { name: "Xác nhận" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/gio-hang"));
    expect(replace).toHaveBeenCalledTimes(1);
    const [call] = callsTo(mock, "/auth/login/2fa");
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
      challengeToken: CHALLENGE,
      code: "123456",
    });
    expect(tokenStore.get()).toBe("tok2fa");
    expect(sessionFlag.has()).toBe(true);
  });

  it("Dùng mã dự phòng: đổi nhãn, focus ô mã, gửi backupCode", async () => {
    const mock = stubFetch((url) =>
      url.endsWith("/auth/login")
        ? jsonRes(200, challengeBody())
        : url.endsWith("/auth/login/2fa")
          ? jsonRes(200, session)
          : jsonRes(404, {}),
    );
    const u = userEvent.setup();
    renderForm();
    await toStep2(u);
    await u.click(screen.getByRole("button", { name: "Dùng mã dự phòng" }));
    const input = screen.getByLabelText("Mã dự phòng");
    expect(input).toHaveFocus();
    expect(input).not.toHaveAttribute("inputmode", "numeric");
    await u.type(input, "ABCDE-FGHJK");
    await u.click(screen.getByRole("button", { name: "Xác nhận" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/tai-khoan"));
    const [call] = callsTo(mock, "/auth/login/2fa");
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
      challengeToken: CHALLENGE,
      backupCode: "ABCDE-FGHJK",
    });
  });

  it("đổi qua lại giữa hai kiểu mã", async () => {
    stubFetch((url) =>
      url.endsWith("/auth/login") ? jsonRes(200, challengeBody()) : jsonRes(404, {}),
    );
    const u = userEvent.setup();
    renderForm();
    await toStep2(u);
    await u.click(screen.getByRole("button", { name: "Dùng mã dự phòng" }));
    await u.click(screen.getByRole("button", { name: "Dùng mã từ ứng dụng xác thực" }));
    expect(screen.getByLabelText("Mã xác thực")).toHaveFocus();
  });

  it("để trống / sai định dạng: báo lỗi field, không gọi mạng thêm", async () => {
    const mock = stubFetch((url) =>
      url.endsWith("/auth/login") ? jsonRes(200, challengeBody()) : jsonRes(404, {}),
    );
    const u = userEvent.setup();
    renderForm();
    const input = await toStep2(u);
    await u.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(await screen.findByText(/Vui lòng nhập mã 6 số/)).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    await u.type(input, "12ab");
    await u.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(await screen.findByText("Mã gồm đúng 6 chữ số")).toBeInTheDocument();
    expect(callsTo(mock, "/auth/login/2fa")).toHaveLength(0);
  });

  it("sai mã: thông báo tiếng Việt role=alert, xóa ô, giữ ở bước 2", async () => {
    stubFetch((url) =>
      url.endsWith("/auth/login")
        ? jsonRes(200, challengeBody())
        : jsonRes(401, { error: { code: "TWO_FACTOR_INVALID", message: "x" } }),
    );
    const u = userEvent.setup();
    renderForm();
    const input = await toStep2(u);
    await u.type(input, "000000");
    await u.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Mã xác thực không đúng hoặc đã được sử dụng.",
    );
    expect(screen.getByLabelText("Mã xác thực")).toHaveValue("");
    expect(replace).not.toHaveBeenCalled();
    expect(tokenStore.get()).toBeNull();
  });

  it("thử thách bị vô hiệu: báo phải đăng nhập lại, nút quay về form đăng nhập", async () => {
    stubFetch((url) =>
      url.endsWith("/auth/login")
        ? jsonRes(200, challengeBody())
        : jsonRes(401, { error: { code: "TWO_FACTOR_CHALLENGE_INVALID", message: "x" } }),
    );
    const u = userEvent.setup();
    renderForm();
    const input = await toStep2(u);
    await u.type(input, "111111");
    await u.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/đăng nhập lại/);
    await u.click(screen.getByRole("button", { name: "Đăng nhập lại" }));
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.queryByLabelText("Mã xác thực")).toBeNull();
  });

  it("đếm ngược thời hạn thử thách rồi báo hết hạn", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const expiresAt = new Date(Date.now() + 65_000).toISOString();
    stubFetch((url) =>
      url.endsWith("/auth/login") ? jsonRes(200, challengeBody(expiresAt)) : jsonRes(404, {}),
    );
    const u = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    renderForm();
    await toStep2(u);
    const initial = screen.getByText(/hết hạn sau/).textContent ?? "";
    expect(initial).toMatch(/1:0[0-5]|1:05/);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText(/hết hạn sau/)).toHaveTextContent(/0:5\d/);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Phiên xác thực đã hết hạn");
    expect(screen.getByRole("button", { name: "Đăng nhập lại" })).toBeInTheDocument();
  });

  it("503 TWO_FACTOR_UNAVAILABLE ở bước 1: thông báo lỗi, không sang bước 2", async () => {
    stubFetch(() => jsonRes(503, { error: { code: "TWO_FACTOR_UNAVAILABLE", message: "x" } }));
    const u = userEvent.setup();
    renderForm();
    await u.type(screen.getByLabelText("Email"), "nv@example.com");
    await u.type(screen.getByLabelText("Mật khẩu"), "Matkhau123");
    await u.click(screen.getByRole("button", { name: /^Đăng nhập$/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/tạm thời không khả dụng/);
    expect(screen.queryByLabelText("Mã xác thực")).toBeNull();
  });
});
