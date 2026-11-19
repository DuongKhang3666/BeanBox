import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import type { AuditLogItem } from "@/types/admin";
import { AdminAuditLog } from "./AdminAuditLog";
import { AdminNav } from "./AdminNav";

let role: "ADMIN" | "STAFF" = "ADMIN";
let search = "";
const replace = vi.fn();
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ role }) }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/admin/nhat-ky",
}));

const META = { page: 1, pageSize: 20, total: 2, totalPages: 1 };
const ITEMS: AuditLogItem[] = [
  {
    id: "a1",
    action: "order.status",
    entity: "Order",
    entityId: "BB-261110-A2B3",
    diff: { status: ["PENDING", "CONFIRMED"], note: [null, "<img src=x onerror=alert(1)>"] },
    ip: "127.0.0.1",
    createdAt: "2026-11-11T03:00:00.000Z",
    actor: { id: "cku1", fullName: "Trần Nhân Viên", email: "s@beanbox.local", role: "STAFF" },
  },
  {
    id: "a2",
    action: "payment.late",
    entity: "Payment",
    entityId: "ckpay1",
    diff: null,
    ip: null,
    createdAt: "2026-11-11T02:00:00.000Z",
    actor: null,
  },
];

function stub() {
  const mock = vi.fn(async () => jsonRes(200, { data: ITEMS, meta: META }));
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

describe("Nav nhật ký", () => {
  it("chỉ ADMIN thấy mục Nhật ký; Tổng quan đứng đầu", () => {
    const { unmount } = render(<AdminNav />);
    const links = screen.getAllByRole("link").map((l) => l.textContent);
    expect(links[0]).toBe("Tổng quan");
    expect(links).toContain("Nhật ký");
    expect(links).toContain("Đánh giá");
    unmount();
    role = "STAFF";
    render(<AdminNav />);
    expect(screen.queryByRole("link", { name: "Nhật ký" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đánh giá" })).toBeInTheDocument();
  });
});

describe("AdminAuditLog", () => {
  it("STAFF vào trực tiếp thấy thông báo không đủ quyền và không gọi API", async () => {
    role = "STAFF";
    const mock = stub();
    render(<AdminAuditLog />);
    expect(screen.getByRole("alert")).toHaveTextContent("Bạn không đủ quyền xem nhật ký thao tác");
    expect(mock).not.toHaveBeenCalled();
  });

  it("bảng: thời gian, người thao tác / Hệ thống, nhãn tiếng Việt + nguyên văn, link đối tượng, IP", async () => {
    stub();
    render(<AdminAuditLog />);
    await screen.findAllByText("Trần Nhân Viên");
    const table = screen.getByRole("table");
    expect(within(table).getByText("Đổi trạng thái đơn")).toBeInTheDocument();
    expect(within(table).getByText("order.status")).toBeInTheDocument();
    expect(within(table).getByText("Hệ thống")).toBeInTheDocument();
    expect(within(table).getByText("127.0.0.1")).toBeInTheDocument();
    expect(within(table).getByText("10:00 11/11/2026")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "BB-261110-A2B3" })).toHaveAttribute(
      "href",
      "/admin/don-hang/BB-261110-A2B3",
    );
    // Payment không có trang riêng -> không phải link.
    expect(within(table).queryByRole("link", { name: "ckpay1" })).not.toBeInTheDocument();
  });

  it("bộ lọc trên URL được chuyển thành query gửi API", async () => {
    search = "actionPrefix=order.&entity=Order&actorId=cku1&from=2026-11-01&to=2026-11-10&page=2";
    const mock = stub();
    render(<AdminAuditLog />);
    await screen.findAllByText("Trần Nhân Viên");
    const url = (mock.mock.calls as unknown as [string][])[0]![0];
    const qs = new URL(url, "http://x").searchParams;
    expect(url).toContain("/admin/audit-logs");
    expect(qs.get("actionPrefix")).toBe("order.");
    expect(qs.get("entity")).toBe("Order");
    expect(qs.get("actorId")).toBe("cku1");
    expect(qs.get("from")).toBe("2026-11-01");
    expect(qs.get("to")).toBe("2026-11-10");
    expect(qs.get("page")).toBe("2");
  });

  it("chọn nhóm hành động và ngày -> cập nhật URL", async () => {
    stub();
    render(<AdminAuditLog />);
    await screen.findAllByText("Trần Nhân Viên");
    await userEvent.selectOptions(screen.getByLabelText("Nhóm hành động"), "order.");
    expect(replace).toHaveBeenLastCalledWith("/admin/nhat-ky?actionPrefix=order.");
    const from = screen.getByLabelText("Từ ngày");
    await userEvent.type(from, "2026-11-01");
    await waitFor(() => expect(replace).toHaveBeenLastCalledWith("/admin/nhat-ky?from=2026-11-01"));
  });

  it("dialog chi tiết: bảng Trường | Trước | Sau, nội dung dạng text an toàn", async () => {
    stub();
    render(<AdminAuditLog />);
    await screen.findAllByText("Trần Nhân Viên");
    await userEvent.click(
      screen.getAllByRole("button", { name: /^Chi tiết: Đổi trạng thái đơn/ })[0]!,
    );
    const dialog = screen.getByRole("dialog", { name: "Đổi trạng thái đơn" });
    const rows = within(dialog).getAllByRole("row");
    expect(rows).toHaveLength(3); // header + 2 trường
    expect(within(rows[1]!).getByText("status")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("PENDING")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("CONFIRMED")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("(trống)")).toBeInTheDocument();
    // HTML không được diễn giải.
    expect(within(dialog).getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(dialog.querySelector("img")).toBeNull();
  });
});
