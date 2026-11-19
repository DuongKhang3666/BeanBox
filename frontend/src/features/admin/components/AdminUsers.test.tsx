import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { makeAdminUserItem } from "../usersTesting";
import { AdminNav, ADMIN_NAV } from "./AdminNav";
import { AdminUsers } from "./AdminUsers";

let role: "ADMIN" | "STAFF" = "ADMIN";
let search = "";
const replace = vi.fn();
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ id: "me", role }) }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/admin/nguoi-dung",
}));

const META = { page: 1, pageSize: 20, total: 2, totalPages: 1 };
const ITEMS = [
  makeAdminUserItem(),
  makeAdminUserItem({
    id: "ckuser2",
    fullName: "Phạm Bị Khóa",
    email: "khoa@example.com",
    phone: null,
    role: "STAFF",
    lastLoginAt: null,
    lockedUntil: "2099-01-01T00:00:00.000Z",
  }),
];

function stub(res: () => Response = () => jsonRes(200, { data: ITEMS, meta: META })) {
  const mock = vi.fn(async () => res());
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  role = "ADMIN";
  search = "";
  replace.mockReset();
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("Nav người dùng", () => {
  it("ADMIN_NAV có Người dùng adminOnly, đứng trước Nhật ký", () => {
    const i = ADMIN_NAV.findIndex((n) => n.href === "/admin/nguoi-dung");
    expect(ADMIN_NAV[i]).toMatchObject({ label: "Người dùng", adminOnly: true });
    expect(ADMIN_NAV[i + 1]!.label).toBe("Nhật ký");
  });

  it("STAFF không thấy mục Người dùng", () => {
    role = "STAFF";
    render(<AdminNav />);
    expect(screen.queryByRole("link", { name: "Người dùng" })).not.toBeInTheDocument();
  });
});

describe("AdminUsers", () => {
  it("STAFF thấy thông báo chỉ quản trị viên và không gọi API", () => {
    role = "STAFF";
    const mock = stub();
    render(<AdminUsers />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Chỉ quản trị viên mới xem được trang này.",
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it("render bảng, badge vai trò/trạng thái, khóa tạm, link chi tiết", async () => {
    stub();
    render(<AdminUsers />);
    await screen.findAllByText("Lê Khách Hàng");
    const table = screen.getByRole("table");
    expect(within(table).getByRole("link", { name: "Lê Khách Hàng" })).toHaveAttribute(
      "href",
      "/admin/nguoi-dung/ckuser1",
    );
    expect(within(table).getByText("Khóa tạm")).toBeInTheDocument();
    expect(within(table).getByText("Nhân viên")).toBeInTheDocument();
    expect(within(table).getByText("Chưa đăng nhập")).toBeInTheDocument();
    expect(within(table).getByText("10:00 11/11/2026")).toBeInTheDocument();
    expect(within(table).getAllByText("Đang hoạt động")).toHaveLength(2);
  });

  it("bộ lọc trên URL thành query gửi API", async () => {
    search = "q=khach&role=STAFF&status=DISABLED&sort=lastLogin&page=2";
    const mock = stub();
    render(<AdminUsers />);
    await screen.findAllByText("Lê Khách Hàng");
    const url = (mock.mock.calls as unknown as [string][])[0]![0];
    const qs = new URL(url, "http://x").searchParams;
    expect(url).toContain("/admin/users");
    expect(qs.get("q")).toBe("khach");
    expect(qs.get("role")).toBe("STAFF");
    expect(qs.get("status")).toBe("DISABLED");
    expect(qs.get("sort")).toBe("lastLogin");
    expect(qs.get("page")).toBe("2");
  });

  it("chọn lọc cập nhật URL", async () => {
    stub();
    render(<AdminUsers />);
    await screen.findAllByText("Lê Khách Hàng");
    await userEvent.selectOptions(screen.getByLabelText("Vai trò"), "ADMIN");
    expect(replace).toHaveBeenLastCalledWith("/admin/nguoi-dung?role=ADMIN");
    await userEvent.selectOptions(screen.getByLabelText("Trạng thái"), "DISABLED");
    expect(replace).toHaveBeenLastCalledWith("/admin/nguoi-dung?status=DISABLED");
    await userEvent.selectOptions(screen.getByLabelText("Sắp xếp"), "oldest");
    expect(replace).toHaveBeenLastCalledWith("/admin/nguoi-dung?sort=oldest");
  });

  it("gõ tìm kiếm -> URL cập nhật sau debounce", async () => {
    stub();
    render(<AdminUsers />);
    await screen.findAllByText("Lê Khách Hàng");
    await userEvent.type(screen.getByLabelText("Tìm theo email, họ tên hoặc SĐT"), "an");
    await waitFor(() => expect(replace).toHaveBeenLastCalledWith("/admin/nguoi-dung?q=an"));
  });

  it("q 1 ký tự: hiện gợi ý và không gọi API", async () => {
    search = "q=a";
    const mock = stub();
    render(<AdminUsers />);
    expect(screen.getByRole("status")).toHaveTextContent("Nhập ít nhất 2 ký tự");
    await act(async () => {});
    expect(mock).not.toHaveBeenCalled();
  });

  it("rỗng và lỗi có nút thử lại", async () => {
    search = "q=zzz";
    stub(() => jsonRes(200, { data: [], meta: { ...META, total: 0 } }));
    const { unmount } = render(<AdminUsers />);
    expect(await screen.findByText("Không có người dùng nào")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xóa bộ lọc" })).toHaveAttribute(
      "href",
      "/admin/nguoi-dung",
    );
    unmount();

    const mock = stub(() => errRes(500, "INTERNAL", "boom"));
    render(<AdminUsers />);
    const retry = await screen.findByRole("button", { name: /thử lại/i });
    mock.mockImplementation(async () => jsonRes(200, { data: ITEMS, meta: META }));
    await userEvent.click(retry);
    await screen.findAllByText("Lê Khách Hàng");
  });

  it("API trả 403 hiện thông báo chỉ quản trị viên", async () => {
    stub(() => errRes(403, "FORBIDDEN", "no"));
    render(<AdminUsers />);
    expect(await screen.findByText("Chỉ quản trị viên mới xem được trang này.")).toBeVisible();
  });
});
