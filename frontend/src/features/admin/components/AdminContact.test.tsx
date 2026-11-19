import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { makeContactMessage } from "../contactTesting";
import { AdminContactDetail } from "./AdminContactDetail";
import { AdminContactMessages } from "./AdminContactMessages";
import { ADMIN_NAV, AdminNav } from "./AdminNav";

let search = "";
const replace = vi.fn();
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ id: "me", role: "STAFF" }) }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/admin/lien-he",
}));

const META = { page: 1, pageSize: 20, total: 2, totalPages: 1 };

function stub(res: (url: string, init?: RequestInit) => Response) {
  const mock = vi.fn(async (url: unknown, init?: RequestInit) => res(String(url), init));
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  search = "";
  replace.mockReset();
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("Nav liên hệ", () => {
  it("ADMIN_NAV có Liên hệ không adminOnly, ngay sau Đánh giá", () => {
    const i = ADMIN_NAV.findIndex((n) => n.href === "/admin/lien-he");
    expect(ADMIN_NAV[i]).toMatchObject({ label: "Liên hệ" });
    expect(ADMIN_NAV[i]!.adminOnly).toBeFalsy();
    expect(ADMIN_NAV[i - 1]!.label).toBe("Đánh giá");
  });

  it("STAFF thấy mục Liên hệ", () => {
    render(<AdminNav />);
    expect(screen.getByRole("link", { name: "Liên hệ" })).toBeInTheDocument();
  });
});

describe("AdminContactMessages", () => {
  const items = [
    makeContactMessage(),
    makeContactMessage({
      id: "ckct2",
      subject: null,
      message: "x".repeat(150),
      status: "IN_PROGRESS",
      handledBy: { id: "s1", fullName: "Nhân Viên A" },
    }),
  ];

  it("render danh sách: giờ VN, tiêu đề/không tiêu đề, trích 100 ký tự, badge, người xử lý", async () => {
    stub(() => jsonRes(200, { data: items, meta: META }));
    render(<AdminContactMessages />);
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Mới")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Hỏi về máy xay" })).toHaveAttribute(
      "href",
      "/admin/lien-he/ckct1",
    );
    expect(within(table).getByRole("link", { name: "(không tiêu đề)" })).toBeInTheDocument();
    expect(within(table).getByText(`${"x".repeat(100)}…`)).toBeInTheDocument();
    expect(within(table).getByText("Mới")).toBeInTheDocument();
    expect(within(table).getByText("Đang xử lý")).toBeInTheDocument();
    expect(within(table).getByText("Nhân Viên A")).toBeInTheDocument();
  });

  it("đổi bộ lọc trạng thái cập nhật URL", async () => {
    stub(() => jsonRes(200, { data: items, meta: META }));
    const user = userEvent.setup();
    render(<AdminContactMessages />);
    await screen.findByRole("table");
    await user.selectOptions(screen.getByLabelText("Trạng thái"), "RESOLVED");
    expect(replace).toHaveBeenCalledWith("/admin/lien-he?status=RESOLVED");
  });

  it("URL có status và q hợp lệ thì gọi API với query đó; q ngắn không gọi", async () => {
    search = "status=SPAM&q=abc";
    const mock = stub(() => jsonRes(200, { data: [], meta: { ...META, total: 0 } }));
    render(<AdminContactMessages />);
    await screen.findByText("Không có tin nhắn nào");
    const url = String(mock.mock.calls[0]![0]);
    expect(url).toContain("status=SPAM");
    expect(url).toContain("q=abc");
  });

  it("q 1 ký tự: không gọi API", () => {
    search = "q=a";
    const mock = stub(() => jsonRes(200, { data: [], meta: META }));
    render(<AdminContactMessages />);
    expect(screen.getByText("Nhập ít nhất 2 ký tự để tìm kiếm.")).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();
  });

  it("lỗi: hiện trạng thái lỗi", async () => {
    stub(() => errRes(500, "INTERNAL_ERROR"));
    render(<AdminContactMessages />);
    expect(await screen.findByText("Không tải được tin nhắn liên hệ")).toBeInTheDocument();
  });
});

describe("AdminContactDetail", () => {
  it("hiển thị nội dung <script> như text thuần, giữ xuống dòng, không tạo phần tử script", async () => {
    const msg = "<script>alert(1)</script>\n<b>đậm</b>";
    stub(() => jsonRes(200, { data: makeContactMessage({ message: msg }) }));
    const { container } = render(<AdminContactDetail id="ckct1" />);
    const p = await screen.findByText((_, el) => el?.textContent === msg && el.tagName === "P");
    expect(p.className).toContain("whitespace-pre-wrap");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("mailto có subject Re: được encode; hiển thị SĐT và có tài khoản", async () => {
    stub(() => jsonRes(200, { data: makeContactMessage({ userId: "u1" }) }));
    render(<AdminContactDetail id="ckct1" />);
    const link = await screen.findByRole("link", { name: "binh@example.com" });
    expect(link).toHaveAttribute(
      "href",
      `mailto:binh@example.com?subject=${encodeURIComponent("Re: Hỏi về máy xay")}`,
    );
    expect(screen.getByText("0901234567")).toBeInTheDocument();
    expect(screen.getByText("Có tài khoản")).toBeInTheDocument();
  });

  it("đổi trạng thái chỉ gửi status", async () => {
    const mock = stub((_u, init) =>
      init?.method === "PATCH"
        ? jsonRes(200, {
            data: makeContactMessage({
              status: "RESOLVED",
              handledBy: { id: "me", fullName: "Tôi" },
            }),
          })
        : jsonRes(200, { data: makeContactMessage() }),
    );
    const user = userEvent.setup();
    render(<AdminContactDetail id="ckct1" />);
    await screen.findByLabelText("Trạng thái");
    await user.selectOptions(screen.getByLabelText("Trạng thái"), "RESOLVED");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await screen.findByText("Đã lưu thay đổi.");
    const patch = mock.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === "PATCH",
    )!;
    expect(String(patch[0])).toBe("/api/v1/admin/contact-messages/ckct1");
    expect(JSON.parse((patch[1] as RequestInit).body as string)).toEqual({ status: "RESOLVED" });
  });

  it("sửa ghi chú chỉ gửi adminNote (đã trim)", async () => {
    const mock = stub((_u, init) =>
      init?.method === "PATCH"
        ? jsonRes(200, { data: makeContactMessage({ adminNote: "Đã gọi lại" }) })
        : jsonRes(200, { data: makeContactMessage() }),
    );
    const user = userEvent.setup();
    render(<AdminContactDetail id="ckct1" />);
    await user.type(await screen.findByLabelText("Ghi chú nội bộ"), " Đã gọi lại ");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await screen.findByText("Đã lưu thay đổi.");
    const patch = mock.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === "PATCH",
    )!;
    expect(JSON.parse((patch[1] as RequestInit).body as string)).toEqual({
      adminNote: "Đã gọi lại",
    });
  });

  it("không đổi gì thì không gọi PATCH", async () => {
    const mock = stub(() => jsonRes(200, { data: makeContactMessage() }));
    const user = userEvent.setup();
    render(<AdminContactDetail id="ckct1" />);
    await screen.findByLabelText("Trạng thái");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Chưa có thay đổi nào để lưu.")).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("ghi chú quá 1000 ký tự bị chặn, không gọi PATCH", async () => {
    const mock = stub(() => jsonRes(200, { data: makeContactMessage() }));
    const user = userEvent.setup();
    render(<AdminContactDetail id="ckct1" />);
    const note = await screen.findByLabelText("Ghi chú nội bộ");
    await user.click(note);
    await user.paste("a".repeat(1001));
    expect(screen.getByText("1001/1000 ký tự")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    expect(screen.getByText("Ghi chú tối đa 1000 ký tự")).toBeInTheDocument();
    expect(note).toHaveAttribute("aria-invalid", "true");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("404: hiện Không tìm thấy tin nhắn", async () => {
    stub(() => errRes(404, "NOT_FOUND"));
    render(<AdminContactDetail id="nope" />);
    expect(await screen.findByText("Không tìm thấy tin nhắn")).toBeInTheDocument();
  });

  it("lỗi lưu: hiện cảnh báo, giữ dữ liệu đã chọn", async () => {
    stub((_u, init) =>
      init?.method === "PATCH"
        ? errRes(500, "INTERNAL_ERROR")
        : jsonRes(200, { data: makeContactMessage() }),
    );
    const user = userEvent.setup();
    render(<AdminContactDetail id="ckct1" />);
    await screen.findByLabelText("Trạng thái");
    await user.selectOptions(screen.getByLabelText("Trạng thái"), "SPAM");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByLabelText("Trạng thái")).toHaveValue("SPAM");
  });
});
