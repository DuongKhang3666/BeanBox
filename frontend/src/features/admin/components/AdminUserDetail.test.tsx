import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { makeAdminUserDetail } from "../usersTesting";
import { AdminUserDetail } from "./AdminUserDetail";

let role: "ADMIN" | "STAFF" = "ADMIN";
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ id: "me", role }) }),
}));

type Handler = (url: string, init: RequestInit) => Response;
function stub(patch?: Handler, detail = makeAdminUserDetail()) {
  const mock = vi.fn(async (url: string, init: RequestInit = {}) => {
    if (init.method === "PATCH") return patch ? patch(url, init) : jsonRes(200, { data: detail });
    return jsonRes(200, { data: detail });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}
const patchCalls = (m: ReturnType<typeof stub>) =>
  m.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "PATCH");

beforeEach(() => {
  role = "ADMIN";
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("AdminUserDetail", () => {
  it("hiển thị thông tin, tổng đơn, tổng đã thanh toán và đơn gần nhất", async () => {
    stub();
    render(<AdminUserDetail id="ckuser1" />);
    expect(await screen.findByRole("heading", { name: "Lê Khách Hàng" })).toBeInTheDocument();
    expect(screen.getByText("khach@example.com")).toBeInTheDocument();
    expect(screen.getByText(/1\.250\.000/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "BB-261110-K7QP" })).toHaveAttribute(
      "href",
      "/admin/don-hang/BB-261110-K7QP",
    );
  });

  it("STAFF thấy thông báo và không gọi API", () => {
    role = "STAFF";
    const mock = stub();
    render(<AdminUserDetail id="ckuser1" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Chỉ quản trị viên mới xem được trang này.",
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it("404 hiện Không tìm thấy người dùng", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errRes(404, "NOT_FOUND", "x")),
    );
    render(<AdminUserDetail id="nope" />);
    expect(await screen.findByText("Không tìm thấy người dùng")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Về danh sách/ })).toHaveAttribute(
      "href",
      "/admin/nguoi-dung",
    );
  });

  it("khóa có lý do gửi đúng body và cập nhật từ response", async () => {
    const mock = stub(() =>
      jsonRes(200, { data: makeAdminUserDetail({ status: "DISABLED", activeSessions: 0 }) }),
    );
    render(<AdminUserDetail id="ckuser1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Khóa tài khoản" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("đăng xuất khỏi mọi thiết bị");
    await userEvent.type(within(dialog).getByLabelText(/Lý do/), "  Spam  ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Khóa tài khoản" }));
    expect(await screen.findByText("Đã khóa tài khoản.")).toBeInTheDocument();
    const [call] = patchCalls(mock);
    expect(call![0]).toContain("/admin/users/ckuser1/status");
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
      status: "DISABLED",
      reason: "Spam",
    });
    expect(screen.getByRole("button", { name: "Mở khóa" })).toBeInTheDocument();
  });

  it("khóa không lý do thì không gửi reason", async () => {
    const mock = stub();
    render(<AdminUserDetail id="ckuser1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Khóa tài khoản" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Khóa tài khoản" }),
    );
    await screen.findByText("Đã khóa tài khoản.");
    expect(JSON.parse((patchCalls(mock)[0]![1] as RequestInit).body as string)).toEqual({
      status: "DISABLED",
    });
  });

  it("Escape đóng dialog, không gửi request", async () => {
    const mock = stub();
    render(<AdminUserDetail id="ckuser1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Khóa tài khoản" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(patchCalls(mock)).toHaveLength(0);
  });

  it("mở khóa gửi status ACTIVE", async () => {
    const mock = stub(undefined, makeAdminUserDetail({ status: "DISABLED" }));
    render(<AdminUserDetail id="ckuser1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Mở khóa" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Mở khóa" }),
    );
    await screen.findByText("Đã mở khóa tài khoản.");
    expect(JSON.parse((patchCalls(mock)[0]![1] as RequestInit).body as string)).toEqual({
      status: "ACTIVE",
    });
  });

  it("gỡ khóa tạm gửi status ACTIVE khi user ACTIVE còn lockedUntil", async () => {
    const mock = stub(undefined, makeAdminUserDetail({ lockedUntil: "2099-01-01T00:00:00.000Z" }));
    render(<AdminUserDetail id="ckuser1" />);
    expect(await screen.findByText("Khóa tạm")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Gỡ khóa tạm" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Gỡ khóa tạm" }),
    );
    await screen.findByText("Đã gỡ khóa tạm của tài khoản.");
    expect(JSON.parse((patchCalls(mock)[0]![1] as RequestInit).body as string)).toEqual({
      status: "ACTIVE",
    });
  });

  it("đổi vai trò: nút tắt khi chưa đổi, dialog nêu hệ quả, gửi đúng body", async () => {
    const mock = stub(() => jsonRes(200, { data: makeAdminUserDetail({ role: "ADMIN" }) }));
    render(<AdminUserDetail id="ckuser1" />);
    const btn = await screen.findByRole("button", { name: "Đổi vai trò" });
    expect(btn).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText("Vai trò"), "ADMIN");
    await userEvent.click(btn);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("đăng xuất khỏi mọi thiết bị");
    expect(dialog).toHaveTextContent("quyền cao nhất");
    await userEvent.click(within(dialog).getByRole("button", { name: "Đổi vai trò" }));
    await screen.findByText("Đã đổi vai trò thành Quản trị viên.");
    expect(patchCalls(mock)[0]![0]).toContain("/admin/users/ckuser1/role");
    expect(JSON.parse((patchCalls(mock)[0]![1] as RequestInit).body as string)).toEqual({
      role: "ADMIN",
    });
  });

  it("xem chính mình: không có nút hành động, có ghi chú", async () => {
    stub(undefined, makeAdminUserDetail({ id: "me" }));
    render(<AdminUserDetail id="me" />);
    expect(
      await screen.findByText("Bạn không thể khóa hoặc đổi vai trò của chính mình."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Khóa tài khoản" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đổi vai trò" })).not.toBeInTheDocument();
  });

  it.each([
    ["LAST_ADMIN", "Không thể giữ", "Không thể giữ"],
    ["CANNOT_MODIFY_SELF", "Không được tự khóa", "Không được tự khóa"],
  ])("lỗi 409 %s hiện thông báo", async (code, serverMsg, shown) => {
    stub(() => errRes(409, code, serverMsg));
    render(<AdminUserDetail id="ckuser1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Khóa tài khoản" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Khóa tài khoản" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(shown);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lỗi 409 không có message dùng câu mặc định tiếng Việt", async () => {
    stub(() => errRes(409, "LAST_ADMIN", ""));
    render(<AdminUserDetail id="ckuser1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Khóa tài khoản" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Khóa tài khoản" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("ít nhất một quản trị viên");
  });
  describe("xác thực 2 lớp (D-063)", () => {
    const postCalls = (m: ReturnType<typeof stub>) =>
      m.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST");

    it("hiện trạng thái Chưa bật và không có nút đặt lại", async () => {
      stub();
      render(<AdminUserDetail id="ckuser1" />);
      const label = await screen.findByText("Xác thực 2 lớp");
      expect(label.nextElementSibling).toHaveTextContent("Chưa bật");
      expect(screen.queryByRole("button", { name: "Đặt lại xác thực 2 lớp" })).toBeNull();
    });

    it("đã bật: hiện Đã bật + nút đặt lại; hộp xác nhận nêu hệ quả; POST đúng route và cập nhật trạng thái", async () => {
      const on = makeAdminUserDetail({ role: "STAFF", twoFactorEnabled: true, activeSessions: 2 });
      const off = makeAdminUserDetail({
        role: "STAFF",
        twoFactorEnabled: false,
        activeSessions: 0,
      });
      const mock = vi.fn(async (_url: string, init: RequestInit = {}) =>
        jsonRes(200, { data: init.method === "POST" ? off : on }),
      );
      vi.stubGlobal("fetch", mock);
      render(<AdminUserDetail id="ckuser1" />);
      const label = await screen.findByText("Xác thực 2 lớp");
      expect(label.nextElementSibling).toHaveTextContent("Đã bật");

      await userEvent.click(screen.getByRole("button", { name: "Đặt lại xác thực 2 lớp" }));
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("đăng xuất khỏi mọi thiết bị");
      // Hủy: không gửi gì
      await userEvent.click(within(dialog).getByRole("button", { name: "Hủy" }));
      expect(postCalls(mock)).toHaveLength(0);

      await userEvent.click(screen.getByRole("button", { name: "Đặt lại xác thực 2 lớp" }));
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Đặt lại 2FA" }),
      );
      expect(await screen.findByText(/Đã đặt lại xác thực 2 lớp/)).toBeInTheDocument();
      const [call] = postCalls(mock);
      expect(String(call![0])).toContain("/admin/users/ckuser1/2fa/reset");
      expect(screen.getByText("Xác thực 2 lớp").nextElementSibling).toHaveTextContent("Chưa bật");
      expect(screen.queryByRole("button", { name: "Đặt lại xác thực 2 lớp" })).toBeNull();
    });

    it("xem chính mình: không có nút đặt lại", async () => {
      stub(undefined, makeAdminUserDetail({ id: "me", twoFactorEnabled: true }));
      render(<AdminUserDetail id="me" />);
      const label = await screen.findByText("Xác thực 2 lớp");
      expect(label.nextElementSibling).toHaveTextContent("Đã bật");
      expect(screen.queryByRole("button", { name: "Đặt lại xác thực 2 lớp" })).toBeNull();
    });

    it("lỗi 409 TWO_FACTOR_NOT_ENABLED hiện thông báo tiếng Việt", async () => {
      const on = makeAdminUserDetail({ twoFactorEnabled: true });
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_u: string, init: RequestInit = {}) =>
          init.method === "POST"
            ? errRes(409, "TWO_FACTOR_NOT_ENABLED", "")
            : jsonRes(200, { data: on }),
        ),
      );
      render(<AdminUserDetail id="ckuser1" />);
      await userEvent.click(await screen.findByRole("button", { name: "Đặt lại xác thực 2 lớp" }));
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Đặt lại 2FA" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent("chưa bật xác thực 2 lớp");
    });
  });
});
