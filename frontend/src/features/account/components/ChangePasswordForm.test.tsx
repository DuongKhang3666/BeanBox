import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bodyOf, errRes, jsonRes } from "../testing";
import { ChangePasswordForm } from "./ChangePasswordForm";

afterEach(() => vi.unstubAllGlobals());

async function fill(
  u: ReturnType<typeof userEvent.setup>,
  cur: string,
  next: string,
  confirm: string,
) {
  await u.type(screen.getByLabelText("Mật khẩu hiện tại"), cur);
  await u.type(screen.getByLabelText("Mật khẩu mới"), next);
  await u.type(screen.getByLabelText("Nhập lại mật khẩu mới"), confirm);
  await u.click(screen.getByRole("button", { name: "Đổi mật khẩu" }));
}

describe("ChangePasswordForm", () => {
  it("mật khẩu mới trùng hiện tại bị chặn ở client", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const u = userEvent.setup();
    render(<ChangePasswordForm />);
    await fill(u, "Matkhau123", "Matkhau123", "Matkhau123");
    expect(await screen.findByText("Mật khẩu mới phải khác mật khẩu hiện tại")).toBeInTheDocument();
    expect(screen.getByLabelText("Mật khẩu mới")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("nhập lại không khớp bị chặn ở client", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const u = userEvent.setup();
    render(<ChangePasswordForm />);
    await fill(u, "Matkhau123", "Matkhau456", "Matkhau789");
    expect(await screen.findByText("Mật khẩu nhập lại không khớp")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("INVALID_PASSWORD hiện ở ô mật khẩu hiện tại", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errRes(400, "INVALID_PASSWORD", "Mật khẩu hiện tại không đúng")),
    );
    const u = userEvent.setup();
    render(<ChangePasswordForm />);
    await fill(u, "Sai12345", "Matkhau456", "Matkhau456");
    const cur = screen.getByLabelText("Mật khẩu hiện tại");
    await waitFor(() => expect(cur).toHaveAttribute("aria-invalid", "true"));
    expect(cur).toHaveAccessibleDescription("Mật khẩu hiện tại không đúng");
    expect(screen.getByLabelText("Mật khẩu mới")).not.toHaveAttribute("aria-invalid");
  });

  it("429 hiện thông báo thử lại sau N giây", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errRes(429, "RATE_LIMITED", "Quá nhanh", { retryAfterSec: 42 })),
    );
    const u = userEvent.setup();
    render(<ChangePasswordForm />);
    await fill(u, "Matkhau123", "Matkhau456", "Matkhau456");
    expect(await screen.findByRole("alert")).toHaveTextContent("Thử lại sau 42 giây");
  });

  it("thành công: gửi đúng body, xóa form, hiện thông báo", async () => {
    const fetchMock = vi.fn(async () => jsonRes(204));
    vi.stubGlobal("fetch", fetchMock);
    const u = userEvent.setup();
    render(<ChangePasswordForm />);
    await fill(u, "Matkhau123", "Matkhau456", "Matkhau456");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.",
    );
    expect(bodyOf(fetchMock, 0)).toEqual({
      currentPassword: "Matkhau123",
      newPassword: "Matkhau456",
    });
    expect(screen.getByLabelText("Mật khẩu hiện tại")).toHaveValue("");
    expect(screen.getByLabelText("Mật khẩu mới")).toHaveValue("");
    expect(screen.getByLabelText("Nhập lại mật khẩu mới")).toHaveValue("");
  });
});
