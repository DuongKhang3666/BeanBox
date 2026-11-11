import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bodyOf, errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import type { UserRole } from "@/types/auth";
import { makeCategory } from "../testing";
import { AdminCategories } from "./AdminCategories";

let role: UserRole = "ADMIN";
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ role }) }),
}));

type Handler = (path: string, init: RequestInit) => Response;
function stubFetch(handler: Handler) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) =>
    handler(input.replace("/api/v1", ""), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

const TREE = [
  makeCategory({
    id: "c1",
    productCount: 0,
    children: [
      makeCategory({
        id: "c2",
        parentId: "c1",
        name: "Phễu V60",
        slug: "pheu-v60",
        productCount: 7,
        isActive: false,
      }),
    ],
  }),
  makeCategory({ id: "c3", name: "Cà phê hạt", slug: "ca-phe-hat", sortOrder: 1 }),
];

const method = (init: RequestInit) => init.method ?? "GET";

function treeHandler(onWrite: (path: string, init: RequestInit) => Response): Handler {
  return (path, init) =>
    method(init) === "GET" ? jsonRes(200, { data: TREE }) : onWrite(path, init);
}

const writeIndex = (mock: ReturnType<typeof stubFetch>) =>
  mock.mock.calls.findIndex(([, init]) => method(init as RequestInit) !== "GET");

beforeEach(() => {
  role = "ADMIN";
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("AdminCategories", () => {
  it("render cây 2 cấp, đánh dấu danh mục ẩn và số sản phẩm", async () => {
    stubFetch(() => jsonRes(200, { data: TREE }));
    render(<AdminCategories />);
    expect(screen.getByLabelText("Đang tải danh mục")).toBeInTheDocument();
    expect(await screen.findByText("Dụng cụ pha chế")).toBeInTheDocument();
    expect(screen.getByText("Phễu V60")).toBeInTheDocument();
    expect(screen.getByText("Cà phê hạt")).toBeInTheDocument();
    expect(screen.getByText("Đang ẩn")).toBeInTheDocument();
    expect(screen.getByText(/7 sản phẩm/)).toBeInTheDocument();
  });

  it("lỗi tải -> ErrorState, Thử lại", async () => {
    let n = 0;
    stubFetch(() => (++n === 1 ? errRes(500, "INTERNAL_ERROR") : jsonRes(200, { data: TREE })));
    render(<AdminCategories />);
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Dụng cụ pha chế")).toBeInTheDocument();
  });

  it("rỗng -> EmptyState", async () => {
    stubFetch(() => jsonRes(200, { data: [] }));
    render(<AdminCategories />);
    expect(await screen.findByText("Chưa có danh mục nào")).toBeInTheDocument();
  });

  it("tạo danh mục: gửi đúng body (slug trống thì không gửi), có ghi chú slug, chỉ liệt kê danh mục gốc", async () => {
    const mock = stubFetch(
      treeHandler(() => jsonRes(201, { data: makeCategory({ id: "c9", name: "Máy xay" }) })),
    );
    render(<AdminCategories />);
    await screen.findByText("Dụng cụ pha chế");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Thêm danh mục" }));
    const dialog = screen.getByRole("dialog", { name: "Thêm danh mục" });
    expect(within(dialog).getByText("Để trống để tự tạo từ tên")).toBeInTheDocument();

    const parent = within(dialog).getByLabelText("Danh mục cha");
    expect(within(parent).queryByRole("option", { name: "Phễu V60" })).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Tên danh mục"), "Máy xay");
    await user.selectOptions(parent, "c1");
    await user.type(within(dialog).getByLabelText(/Mô tả/), "Máy xay cà phê");
    await user.clear(within(dialog).getByLabelText("Thứ tự hiển thị"));
    await user.type(within(dialog).getByLabelText("Thứ tự hiển thị"), "3");
    await user.click(within(dialog).getByRole("button", { name: "Tạo danh mục" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const i = writeIndex(mock);
    expect(mock.mock.calls[i]![0]).toBe("/api/v1/admin/categories");
    expect(bodyOf(mock, i)).toEqual({
      name: "Máy xay",
      parentId: "c1",
      description: "Máy xay cà phê",
      sortOrder: 3,
      isActive: true,
    });
    expect(await screen.findByText("Đã tạo danh mục Máy xay.")).toBeInTheDocument();
  });

  it("validate client: tên ngắn, slug sai định dạng, URL ảnh không phải https -> không gọi API", async () => {
    const mock = stubFetch(treeHandler(() => jsonRes(201, { data: makeCategory() })));
    render(<AdminCategories />);
    await screen.findByText("Dụng cụ pha chế");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Thêm danh mục" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Tên danh mục"), "A");
    await user.type(within(dialog).getByLabelText(/^Slug/), "Sai Slug");
    await user.type(within(dialog).getByLabelText(/URL ảnh/), "http://x.vn/a.png");
    await user.click(within(dialog).getByRole("button", { name: "Tạo danh mục" }));
    expect(await within(dialog).findByText("Tên tối thiểu 2 ký tự.")).toBeInTheDocument();
    expect(within(dialog).getByText(/Slug chỉ gồm chữ thường/)).toBeInTheDocument();
    expect(within(dialog).getByText(/URL ảnh phải bắt đầu bằng https/)).toBeInTheDocument();
    expect(writeIndex(mock)).toBe(-1);
  });

  it("409 SLUG_TAKEN hiện lỗi dưới ô slug", async () => {
    stubFetch(treeHandler(() => errRes(409, "SLUG_TAKEN", "Slug đã tồn tại", { field: "slug" })));
    render(<AdminCategories />);
    await screen.findByText("Dụng cụ pha chế");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Thêm danh mục" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Tên danh mục"), "Máy xay");
    await user.type(within(dialog).getByLabelText(/^Slug/), "ca-phe-hat");
    await user.click(within(dialog).getByRole("button", { name: "Tạo danh mục" }));
    const msg = await within(dialog).findByText(/Slug này đã được dùng/);
    expect(msg).toHaveAttribute("id", "cf-slug-err");
    expect(within(dialog).getByLabelText(/^Slug/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("sửa: cảnh báo khi đổi slug; chỉ gửi trường thay đổi; khóa ô cha khi có con", async () => {
    const mock = stubFetch(
      treeHandler(() => jsonRes(200, { data: makeCategory({ id: "c1", slug: "dung-cu" }) })),
    );
    render(<AdminCategories />);
    await screen.findByText("Dụng cụ pha chế");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Sửa Dụng cụ pha chế" }));
    const dialog = screen.getByRole("dialog", { name: "Sửa danh mục" });
    expect(within(dialog).getByLabelText("Danh mục cha")).toBeDisabled();
    expect(
      within(dialog).queryByText("Đổi slug sẽ làm hỏng liên kết cũ tới danh mục này"),
    ).not.toBeInTheDocument();

    const slug = within(dialog).getByLabelText(/^Slug/);
    await user.clear(slug);
    await user.type(slug, "dung-cu");
    expect(
      within(dialog).getByText("Đổi slug sẽ làm hỏng liên kết cũ tới danh mục này"),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const i = writeIndex(mock);
    expect(mock.mock.calls[i]![0]).toBe("/api/v1/admin/categories/c1");
    expect((mock.mock.calls[i]![1] as RequestInit).method).toBe("PATCH");
    expect(bodyOf(mock, i)).toEqual({ slug: "dung-cu" });
  });

  it("sửa danh mục không có con: chọn được cha, không chọn chính nó", async () => {
    stubFetch(treeHandler(() => jsonRes(200, { data: makeCategory({ id: "c3" }) })));
    render(<AdminCategories />);
    await screen.findByText("Cà phê hạt");
    await userEvent.click(screen.getByRole("button", { name: "Sửa Cà phê hạt" }));
    const parent = within(screen.getByRole("dialog")).getByLabelText("Danh mục cha");
    expect(parent).toBeEnabled();
    expect(within(parent).getByRole("option", { name: "Dụng cụ pha chế" })).toBeInTheDocument();
    expect(within(parent).queryByRole("option", { name: "Cà phê hạt" })).not.toBeInTheDocument();
  });

  it("nút Xóa chỉ hiện với ADMIN", async () => {
    role = "STAFF";
    stubFetch(() => jsonRes(200, { data: TREE }));
    const { unmount } = render(<AdminCategories />);
    await screen.findByText("Dụng cụ pha chế");
    expect(screen.queryByRole("button", { name: /^Xóa/ })).not.toBeInTheDocument();
    unmount();

    role = "ADMIN";
    render(<AdminCategories />);
    expect(await screen.findByRole("button", { name: "Xóa Cà phê hạt" })).toBeInTheDocument();
  });

  it("xóa 409 CONFLICT hiển thị số con/sản phẩm; xóa thành công tải lại", async () => {
    let conflict = true;
    const mock = stubFetch(
      treeHandler(() =>
        conflict
          ? errRes(409, "CONFLICT", "Danh mục còn tham chiếu", { childCount: 1, productCount: 3 })
          : jsonRes(204),
      ),
    );
    render(<AdminCategories />);
    await screen.findByText("Dụng cụ pha chế");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Xóa Dụng cụ pha chế" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa danh mục" }),
    );
    expect(
      await screen.findByText("Danh mục còn 1 danh mục con / 3 sản phẩm, hãy ẩn thay vì xóa"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    conflict = false;
    await user.click(screen.getByRole("button", { name: "Xóa Cà phê hạt" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa danh mục" }),
    );
    expect(await screen.findByText("Đã xóa danh mục Cà phê hạt.")).toBeInTheDocument();
    const deletes = mock.mock.calls.filter(([, init]) => method(init as RequestInit) === "DELETE");
    expect(deletes.map(([u]) => u)).toEqual([
      "/api/v1/admin/categories/c1",
      "/api/v1/admin/categories/c3",
    ]);
  });
});
