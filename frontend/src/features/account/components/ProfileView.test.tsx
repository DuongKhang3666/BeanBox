import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/types/auth";
import { errRes, jsonRes, makeUser } from "../testing";
import { ProfileView } from "./ProfileView";

const replace = vi.fn();
const setUser = vi.fn();
const reloadUser = vi.fn(async () => {});
let search = new URLSearchParams();
let current: User = makeUser();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => search,
}));
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ user: current, setUser, reloadUser, status: "authenticated" }),
}));

beforeEach(() => {
  replace.mockReset();
  setUser.mockReset();
  reloadUser.mockClear();
  search = new URLSearchParams();
  current = makeUser({ emailVerified: false });
});
afterEach(() => vi.unstubAllGlobals());

describe("ProfileView", () => {
  it("?registered=1 -> hiện thông báo đăng ký và xóa query", async () => {
    search = new URLSearchParams({ registered: "1" });
    vi.stubGlobal("fetch", vi.fn());
    render(<ProfileView />);
    expect(
      screen.getByText(/Đăng ký thành công\. Chúng tôi đã gửi email xác thực/),
    ).toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/tai-khoan"));
  });

  it("không có query -> không có thông báo, không replace", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<ProfileView />);
    expect(screen.queryByText(/Đăng ký thành công/)).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("email đã xác thực -> nhãn Đã xác thực, không có nút gửi lại", () => {
    current = makeUser({ emailVerified: true });
    vi.stubGlobal("fetch", vi.fn());
    render(<ProfileView />);
    expect(screen.getByText("Đã xác thực")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gửi lại email xác thực" })).toBeNull();
  });

  it("gửi lại email xác thực: 204 -> thông báo đã gửi", async () => {
    const fetchMock = vi.fn(async () => jsonRes(204));
    vi.stubGlobal("fetch", fetchMock);
    const u = userEvent.setup();
    render(<ProfileView />);
    expect(screen.getByText("Chưa xác thực")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Gửi lại email xác thực" }));
    expect(await screen.findByText(/Đã gửi lại email xác thực/)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/auth/resend-verification");
    expect(init.method).toBe("POST");
  });

  it("gửi lại: 409 -> báo đã xác thực và reloadUser", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errRes(409, "CONFLICT", "Đã xác thực")),
    );
    const u = userEvent.setup();
    render(<ProfileView />);
    await u.click(screen.getByRole("button", { name: "Gửi lại email xác thực" }));
    expect(await screen.findByText("Email của bạn đã được xác thực.")).toBeInTheDocument();
    expect(reloadUser).toHaveBeenCalledTimes(1);
  });

  it("gửi lại: 429 -> Thử lại sau N giây", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errRes(429, "RATE_LIMITED", "Quá nhanh", { retryAfterSec: 37 })),
    );
    const u = userEvent.setup();
    render(<ProfileView />);
    await u.click(screen.getByRole("button", { name: "Gửi lại email xác thực" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Thử lại sau 37 giây");
  });
});
