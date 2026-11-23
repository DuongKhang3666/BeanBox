import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import type { AdminOrderNote } from "@/types/admin";
import { OrderNotes } from "./OrderNotes";

let role: "STAFF" | "ADMIN" = "STAFF";
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ role }) }),
}));

const CODE = "BB-261110-K7QP";

const NOTE: AdminOrderNote = {
  id: "n1",
  body: "Đã gọi khách\nxác nhận địa chỉ <b>x</b>",
  createdAt: "2026-11-10T08:30:00.000Z",
  author: { id: "s1", fullName: "Trần Thu", role: "STAFF" },
};

type Handler = (path: string, init: RequestInit) => Response;
function stubFetch(handler: Handler) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) =>
    handler(input.replace("/api/v1", ""), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  role = "STAFF";
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("OrderNotes", () => {
  it("hiển thị ghi chú (tác giả, giờ VN, nội dung là văn bản thuần) và trạng thái rỗng", async () => {
    stubFetch(() => jsonRes(200, { data: [NOTE] }));
    const { unmount } = render(<OrderNotes code={CODE} />);
    const list = await screen.findByRole("list", { name: "Danh sách ghi chú nội bộ" });
    expect(within(list).getByText(/Đã gọi khách/)).toBeInTheDocument();
    // HTML trong ghi chú không được render thành phần tử.
    expect(within(list).getByText(/<b>x<\/b>/)).toBeInTheDocument();
    expect(list.querySelector("b")).toBeNull();
    expect(within(list).getByText(/Trần Thu \(Nhân viên\)/)).toBeInTheDocument();
    expect(within(list).getByText(/10\/11\/2026/)).toBeInTheDocument();
    unmount();

    stubFetch(() => jsonRes(200, { data: [] }));
    render(<OrderNotes code={CODE} />);
    expect(await screen.findByText("Chưa có ghi chú nội bộ nào.")).toBeInTheDocument();
  });

  it("tải lỗi -> thông báo và Thử lại", async () => {
    let fail = true;
    stubFetch(() => (fail ? errRes(500, "INTERNAL_ERROR") : jsonRes(200, { data: [] })));
    render(<OrderNotes code={CODE} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Đã có lỗi xảy ra");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Chưa có ghi chú nội bộ nào.")).toBeInTheDocument();
  });

  it("thêm ghi chú: kiểm rỗng, gửi body đã trim, thêm vào danh sách và xóa ô nhập", async () => {
    const created: AdminOrderNote = { ...NOTE, id: "n2", body: "Khách hẹn giao sau 18h" };
    const mock = stubFetch((path, init) => {
      if (init.method === "POST") return jsonRes(201, { data: created });
      return jsonRes(200, { data: [] });
    });
    render(<OrderNotes code={CODE} />);
    await screen.findByText("Chưa có ghi chú nội bộ nào.");

    await userEvent.click(screen.getByRole("button", { name: "Thêm ghi chú" }));
    expect(await screen.findByText("Vui lòng nhập nội dung ghi chú.")).toBeInTheDocument();
    expect(mock.mock.calls.filter(([, i]) => (i as RequestInit)?.method === "POST")).toHaveLength(
      0,
    );

    await userEvent.type(screen.getByLabelText("Thêm ghi chú"), "  Khách hẹn giao sau 18h  ");
    await userEvent.click(screen.getByRole("button", { name: "Thêm ghi chú" }));
    expect(await screen.findByText("Khách hẹn giao sau 18h")).toBeInTheDocument();
    const post = mock.mock.calls.find(([, i]) => (i as RequestInit)?.method === "POST")!;
    expect(post[0]).toBe(`/api/v1/admin/orders/${CODE}/notes`);
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({
      body: "Khách hẹn giao sau 18h",
    });
    expect(screen.getByLabelText("Thêm ghi chú")).toHaveValue("");
  });

  it("lỗi 400 từ server hiện dưới ô nhập; lỗi khác hiện chung", async () => {
    let mode: "field" | "net" = "field";
    stubFetch((_p, init) => {
      if (init.method !== "POST") return jsonRes(200, { data: [] });
      return mode === "field"
        ? errRes(400, "VALIDATION_ERROR", "x", [
            { field: "body", message: "Ghi chú chứa ký tự không hợp lệ" },
          ])
        : errRes(500, "INTERNAL_ERROR");
    });
    render(<OrderNotes code={CODE} />);
    await screen.findByText("Chưa có ghi chú nội bộ nào.");
    await userEvent.type(screen.getByLabelText("Thêm ghi chú"), "abc");
    await userEvent.click(screen.getByRole("button", { name: "Thêm ghi chú" }));
    expect(await screen.findByText("Ghi chú chứa ký tự không hợp lệ")).toBeInTheDocument();
    mode = "net";
    await userEvent.click(screen.getByRole("button", { name: "Thêm ghi chú" }));
    expect(await screen.findByText(/Đã có lỗi xảy ra/)).toBeInTheDocument();
  });

  it("nhân viên không thấy nút xóa", async () => {
    stubFetch(() => jsonRes(200, { data: [NOTE] }));
    render(<OrderNotes code={CODE} />);
    await screen.findByRole("list", { name: "Danh sách ghi chú nội bộ" });
    expect(screen.queryByRole("button", { name: /Xóa ghi chú/ })).not.toBeInTheDocument();
  });

  it("Admin: xóa cần xác nhận, gọi DELETE rồi gỡ khỏi danh sách; hủy thì giữ nguyên", async () => {
    role = "ADMIN";
    const mock = stubFetch((_p, init) =>
      init.method === "DELETE" ? jsonRes(204) : jsonRes(200, { data: [NOTE] }),
    );
    render(<OrderNotes code={CODE} />);
    await userEvent.click(await screen.findByRole("button", { name: /Xóa ghi chú của Trần Thu/ }));
    await userEvent.click(screen.getByRole("button", { name: "Hủy" }));
    expect(screen.getByText(/Đã gọi khách/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Xóa ghi chú của Trần Thu/ }));
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận xóa ghi chú" }));
    await waitFor(() => expect(screen.queryByText(/Đã gọi khách/)).not.toBeInTheDocument());
    const del = mock.mock.calls.find(([, i]) => (i as RequestInit)?.method === "DELETE")!;
    expect(del[0]).toBe(`/api/v1/admin/orders/${CODE}/notes/n1`);
  });

  it("Admin: xóa lỗi hiển thị thông báo và giữ ghi chú", async () => {
    role = "ADMIN";
    stubFetch((_p, init) =>
      init.method === "DELETE" ? errRes(500, "INTERNAL_ERROR") : jsonRes(200, { data: [NOTE] }),
    );
    render(<OrderNotes code={CODE} />);
    await userEvent.click(await screen.findByRole("button", { name: /Xóa ghi chú của/ }));
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận xóa ghi chú" }));
    expect(await screen.findByText(/Đã có lỗi xảy ra/)).toBeInTheDocument();
    expect(screen.getByText(/Đã gọi khách/)).toBeInTheDocument();
  });

  it("tác giả đã bị xóa hiển thị nhãn thay thế", async () => {
    stubFetch(() => jsonRes(200, { data: [{ ...NOTE, author: null }] }));
    render(<OrderNotes code={CODE} />);
    expect(await screen.findByText(/Tài khoản đã xóa/)).toBeInTheDocument();
  });
});
