import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/types/auth";
import { bodyOf, errRes, jsonRes, makeUser } from "../testing";
import { PersonalDataSection } from "./PersonalDataSection";

const replace = vi.fn();
const endSession = vi.fn();
const saveBlob = vi.fn();
let current: User = makeUser();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ user: current, endSession }),
}));
vi.mock("@/features/admin/download", () => ({
  saveBlob: (blob: unknown, name: string) => saveBlob(blob, name),
}));

beforeEach(() => {
  replace.mockReset();
  endSession.mockReset();
  saveBlob.mockReset();
  current = makeUser();
});
afterEach(() => vi.unstubAllGlobals());

function fileRes(): Response {
  return new Response('{"formatVersion":1}', {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="beanbox-du-lieu-ca-nhan-2026-11-22.json"',
    },
  });
}

describe("PersonalDataSection: xuất dữ liệu", () => {
  it("bấm tải: gọi /me/export, lưu file đúng tên, báo thành công", async () => {
    const fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>(async () => fileRes());
    vi.stubGlobal("fetch", fetchMock);
    const u = userEvent.setup();
    render(<PersonalDataSection />);
    await u.click(screen.getByRole("button", { name: "Tải dữ liệu của tôi (JSON)" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
    expect(saveBlob.mock.calls[0]![1]).toBe("beanbox-du-lieu-ca-nhan-2026-11-22.json");
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("/me/export");
    expect(await screen.findByText("Đã tạo file dữ liệu cá nhân của bạn.")).toBeInTheDocument();
  });

  it("429 hiện thông báo tiếng Việt, không lưu file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errRes(429, "RATE_LIMITED", "Quá nhanh", { retryAfterSec: 3000 })),
    );
    const u = userEvent.setup();
    render(<PersonalDataSection />);
    await u.click(screen.getByRole("button", { name: "Tải dữ liệu của tôi (JSON)" }));
    expect(await screen.findByText(/tối đa 5 lần mỗi giờ/)).toBeInTheDocument();
    expect(saveBlob).not.toHaveBeenCalled();
    // Nút hoạt động lại sau lỗi.
    expect(screen.getByRole("button", { name: "Tải dữ liệu của tôi (JSON)" })).toBeEnabled();
  });
});

describe("PersonalDataSection: xóa tài khoản", () => {
  it("STAFF/ADMIN không thấy nút xóa, vẫn thấy nút tải", () => {
    current = makeUser({ role: "STAFF" });
    render(<PersonalDataSection />);
    expect(screen.queryByRole("button", { name: "Xóa tài khoản" })).toBeNull();
    expect(screen.getByRole("button", { name: "Tải dữ liệu của tôi (JSON)" })).toBeInTheDocument();
  });

  it("nút xác nhận chỉ bật khi có mật khẩu và gõ đúng cụm; Hủy đóng hộp", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const u = userEvent.setup();
    render(<PersonalDataSection />);
    await u.click(screen.getByRole("button", { name: "Xóa tài khoản" }));
    const dialog = screen.getByRole("dialog", { name: "Xóa tài khoản" });
    expect(dialog).toHaveTextContent("Người dùng đã xóa");
    const confirm = screen.getByRole("button", { name: "Xóa tài khoản vĩnh viễn" });
    expect(confirm).toBeDisabled();
    await u.type(screen.getByLabelText("Mật khẩu hiện tại"), "Matkhau123");
    await u.type(screen.getByLabelText(/Gõ XOA TAI KHOAN/), "xoa tai khoan");
    expect(confirm).toBeDisabled();
    await u.clear(screen.getByLabelText(/Gõ XOA TAI KHOAN/));
    await u.type(screen.getByLabelText(/Gõ XOA TAI KHOAN/), "XOA TAI KHOAN");
    expect(confirm).toBeEnabled();
    await u.click(screen.getByRole("button", { name: "Hủy" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("thành công: gửi DELETE /me đúng body, đăng xuất cục bộ, về trang chủ kèm thông báo", async () => {
    const fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>(async () => jsonRes(204));
    vi.stubGlobal("fetch", fetchMock);
    const u = userEvent.setup();
    render(<PersonalDataSection />);
    await u.click(screen.getByRole("button", { name: "Xóa tài khoản" }));
    await u.type(screen.getByLabelText("Mật khẩu hiện tại"), "Matkhau123");
    await u.type(screen.getByLabelText(/Gõ XOA TAI KHOAN/), "XOA TAI KHOAN");
    await u.click(screen.getByRole("button", { name: "Xóa tài khoản vĩnh viễn" }));
    await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith("/?tai-khoan=da-xoa");
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toContain("/me");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
    expect(bodyOf(fetchMock, 0)).toEqual({ password: "Matkhau123", confirmText: "XOA TAI KHOAN" });
  });

  it("ACTIVE_ORDERS_EXIST liệt kê mã đơn có liên kết, không đăng xuất", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        errRes(409, "ACTIVE_ORDERS_EXIST", "Còn đơn", {
          orderCodes: ["BB-001", "BB-002"],
          total: 2,
        }),
      ),
    );
    const u = userEvent.setup();
    render(<PersonalDataSection />);
    await u.click(screen.getByRole("button", { name: "Xóa tài khoản" }));
    await u.type(screen.getByLabelText("Mật khẩu hiện tại"), "Matkhau123");
    await u.type(screen.getByLabelText(/Gõ XOA TAI KHOAN/), "XOA TAI KHOAN");
    await u.click(screen.getByRole("button", { name: "Xóa tài khoản vĩnh viễn" }));
    const link = await screen.findByRole("link", { name: "BB-001" });
    expect(link).toHaveAttribute("href", "/tai-khoan/don-hang/BB-001");
    expect(screen.getByRole("link", { name: "BB-002" })).toBeInTheDocument();
    expect(endSession).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sai mật khẩu hiện lỗi ở ô mật khẩu và giữ hộp thoại", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errRes(400, "INVALID_PASSWORD", "Mật khẩu không đúng")),
    );
    const u = userEvent.setup();
    render(<PersonalDataSection />);
    await u.click(screen.getByRole("button", { name: "Xóa tài khoản" }));
    await u.type(screen.getByLabelText("Mật khẩu hiện tại"), "Sai12345");
    await u.type(screen.getByLabelText(/Gõ XOA TAI KHOAN/), "XOA TAI KHOAN");
    await u.click(screen.getByRole("button", { name: "Xóa tài khoản vĩnh viễn" }));
    const pw = screen.getByLabelText("Mật khẩu hiện tại");
    await waitFor(() => expect(pw).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(endSession).not.toHaveBeenCalled();
  });
});
