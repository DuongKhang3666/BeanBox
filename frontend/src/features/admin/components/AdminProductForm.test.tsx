import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import type { UserRole } from "@/types/auth";
import { jsonBody, stubProductApi, writes } from "../productTesting";
import { makeAdminProduct } from "../testing";
import { AdminProductEditor } from "./AdminProductEditor";
import { AdminProductNew } from "./AdminProductNew";

let role: UserRole = "ADMIN";
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ role }) }),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  role = "ADMIN";
  push.mockReset();
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("Tạo sản phẩm", () => {
  it("trạng thái mặc định Nháp, không cho chọn Đang bán, có ghi chú", async () => {
    stubProductApi();
    render(<AdminProductNew />);
    await screen.findByLabelText("Tên sản phẩm");
    expect(screen.queryByLabelText("Trạng thái")).not.toBeInTheDocument();
    expect(screen.getByText("Thêm biến thể trước khi chuyển sang Đang bán")).toBeInTheDocument();
    expect(screen.getByText("Để trống để tự tạo từ tên")).toBeInTheDocument();
    expect(screen.getByText(/gạch đầu dòng bằng -/)).toBeInTheDocument();
  });

  it("validate phía client: thiếu tên/danh mục, tags quá dài, không gọi API", async () => {
    const mock = stubProductApi();
    render(<AdminProductNew />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Tạo sản phẩm" }));
    expect(await screen.findByText("Vui lòng nhập tên sản phẩm.")).toBeInTheDocument();
    expect(screen.getByText("Vui lòng chọn danh mục.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Tên sản phẩm"), "Cà phê");
    await user.selectOptions(screen.getByLabelText("Danh mục"), "c1");
    await user.type(screen.getByLabelText("Thẻ (tags)"), "x".repeat(31));
    await user.click(screen.getByRole("button", { name: "Tạo sản phẩm" }));
    expect(await screen.findByText("Mỗi thẻ tối đa 30 ký tự.")).toBeInTheDocument();
    expect(writes(mock)).toHaveLength(0);
  });

  it("gửi đúng body (tags chuẩn hóa, coffee) rồi chuyển tới trang sửa", async () => {
    const mock = stubProductApi({
      onWrite: () => jsonRes(201, { data: makeAdminProduct({ id: "p9" }) }),
    });
    render(<AdminProductNew />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Tên sản phẩm"), "  Ethiopia Guji ");
    await screen.findByRole("option", { name: "Cà phê hạt / Specialty" });
    await user.selectOptions(screen.getByLabelText("Danh mục"), "c2");
    await user.selectOptions(screen.getByLabelText(/^Thương hiệu/), "b1");
    await user.type(screen.getByLabelText("Mô tả ngắn"), "Hương hoa");
    await user.type(screen.getByLabelText("Thẻ (tags)"), "Hoa, CAM chanh, hoa, ");
    await user.click(screen.getByRole("checkbox", { name: "Sản phẩm nổi bật" }));

    await user.click(screen.getByRole("checkbox", { name: /hồ sơ cà phê/ }));
    await user.type(screen.getByLabelText("Quốc gia xuất xứ"), "Ethiopia");
    await user.type(screen.getByLabelText("Độ cao (m)"), "1900");
    await user.selectOptions(screen.getByLabelText("Mức rang"), "LIGHT");
    await user.selectOptions(screen.getByLabelText("Sơ chế"), "WASHED");
    await user.type(screen.getByLabelText(/^Hương vị/), "Hoa nhài, Cam chanh");
    await user.click(screen.getByRole("checkbox", { name: "Pour-over" }));
    await user.click(screen.getByRole("checkbox", { name: "AeroPress" }));

    await user.click(screen.getByRole("button", { name: "Tạo sản phẩm" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/san-pham/p9"));
    const [call] = writes(mock);
    expect(call!.method).toBe("POST");
    expect(call!.path).toBe("/admin/products");
    expect(jsonBody(call!.init)).toEqual({
      name: "Ethiopia Guji",
      categoryId: "c2",
      brandId: "b1",
      status: "DRAFT",
      isFeatured: true,
      shortDesc: "Hương hoa",
      tags: ["hoa", "cam chanh"],
      coffee: {
        originCountry: "Ethiopia",
        originRegion: null,
        variety: null,
        process: "WASHED",
        roastLevel: "LIGHT",
        altitude: 1900,
        tastingNotes: ["Hoa nhài", "Cam chanh"],
        brewMethods: ["POUR_OVER", "AEROPRESS"],
      },
    });
  });

  it("SLUG_TAKEN hiện dưới ô slug", async () => {
    stubProductApi({
      onWrite: () => errRes(409, "SLUG_TAKEN", "Slug đã tồn tại", { field: "slug" }),
    });
    render(<AdminProductNew />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Tên sản phẩm"), "Cà phê");
    await screen.findByRole("option", { name: "Cà phê hạt" });
    await user.selectOptions(screen.getByLabelText("Danh mục"), "c1");
    await user.type(screen.getByLabelText(/^Slug/), "ca-phe");
    await user.click(screen.getByRole("button", { name: "Tạo sản phẩm" }));
    expect(await screen.findByText(/Slug này đã được dùng/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("Sửa sản phẩm", () => {
  it("PATCH chỉ gửi trường đã đổi", async () => {
    const mock = stubProductApi({
      onWrite: () => jsonRes(200, { data: makeAdminProduct({ name: "Tên mới" }) }),
    });
    render(<AdminProductEditor id="p1" />);
    const user = userEvent.setup();
    const name = await screen.findByLabelText("Tên sản phẩm");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByText("Chưa có thay đổi nào để lưu.")).toBeInTheDocument();
    expect(writes(mock)).toHaveLength(0);

    await user.clear(name);
    await user.type(name, "Tên mới");
    await user.click(screen.getByRole("checkbox", { name: "Sản phẩm nổi bật" }));
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByText("Đã lưu thay đổi.")).toBeInTheDocument();
    const [call] = writes(mock);
    expect(call!.method).toBe("PATCH");
    expect(call!.path).toBe("/admin/products/p1");
    expect(jsonBody(call!.init)).toEqual({ name: "Tên mới", isFeatured: true });
  });

  it("bỏ hồ sơ cà phê gửi coffee:null", async () => {
    const mock = stubProductApi({
      product: makeAdminProduct({
        coffee: {
          originCountry: "Ethiopia",
          originRegion: null,
          variety: null,
          process: "WASHED",
          roastLevel: "LIGHT",
          altitude: 1900,
          tastingNotes: ["Hoa nhài"],
          brewMethods: ["POUR_OVER"],
        },
      }),
      onWrite: () => jsonRes(200, { data: makeAdminProduct() }),
    });
    render(<AdminProductEditor id="p1" />);
    const user = userEvent.setup();
    expect(await screen.findByLabelText("Quốc gia xuất xứ")).toHaveValue("Ethiopia");
    await user.click(screen.getByRole("checkbox", { name: /hồ sơ cà phê/ }));
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await screen.findByText("Đã lưu thay đổi.");
    expect(jsonBody(writes(mock)[0]!.init)).toEqual({ coffee: null });
  });

  it("xóa trắng Vùng và Độ cao gửi null tường minh trong coffee", async () => {
    const mock = stubProductApi({
      product: makeAdminProduct({
        coffee: {
          originCountry: "Việt Nam",
          originRegion: "Cầu Đất",
          variety: null,
          process: "WASHED",
          roastLevel: "LIGHT",
          altitude: 1500,
          tastingNotes: ["Hoa nhài"],
          brewMethods: ["POUR_OVER"],
        },
      }),
      onWrite: () => jsonRes(200, { data: makeAdminProduct() }),
    });
    render(<AdminProductEditor id="p1" />);
    const user = userEvent.setup();
    expect(await screen.findByLabelText("Vùng")).toHaveValue("Cầu Đất");
    await user.clear(screen.getByLabelText("Vùng"));
    await user.clear(screen.getByLabelText("Độ cao (m)"));
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await screen.findByText("Đã lưu thay đổi.");
    const body = jsonBody(writes(mock)[0]!.init) as { coffee: Record<string, unknown> };
    expect(body.coffee.originRegion).toBeNull();
    expect(body.coffee.altitude).toBeNull();
    expect(body.coffee.originCountry).toBe("Việt Nam");
  });

  it("đổi slug hiện cảnh báo; chuyển Đang bán lỗi 400 hiện dưới ô trạng thái", async () => {
    stubProductApi({
      onWrite: () =>
        errRes(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", [
          { field: "status", message: "Cần ít nhất 1 biến thể đang bán để hiển thị sản phẩm" },
        ]),
    });
    render(<AdminProductEditor id="p1" />);
    const user = userEvent.setup();
    const slug = await screen.findByLabelText(/^Slug/);
    expect(screen.queryByText(/làm hỏng liên kết cũ/)).not.toBeInTheDocument();
    await user.clear(slug);
    await user.type(slug, "slug-moi");
    expect(screen.getByText(/làm hỏng liên kết cũ/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Trạng thái"), "ACTIVE");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(
      await screen.findByText("Cần ít nhất 1 biến thể đang bán để hiển thị sản phẩm"),
    ).toBeInTheDocument();
  });

  it("link Xem trên cửa hàng chỉ khi ACTIVE, mở tab mới", async () => {
    stubProductApi({ product: makeAdminProduct({ status: "ACTIVE" }) });
    render(<AdminProductEditor id="p1" />);
    const link = await screen.findByRole("link", { name: "Xem trên cửa hàng" });
    expect(link).toHaveAttribute("href", "/san-pham/ethiopia-yirgacheffe");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("sản phẩm đã xóa mềm: banner + chỉ đọc", async () => {
    stubProductApi({
      product: makeAdminProduct({ deletedAt: "2026-11-11T01:00:00.000Z", status: "ARCHIVED" }),
    });
    render(<AdminProductEditor id="p1" />);
    expect(await screen.findByText("Sản phẩm đã bị xóa")).toBeInTheDocument();
    expect(screen.getByLabelText("Tên sản phẩm")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Lưu thay đổi" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thêm biến thể" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xóa sản phẩm" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tải ảnh lên")).not.toBeInTheDocument();
  });

  it("404 -> Không tìm thấy sản phẩm", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) =>
        input.includes("/admin/products/")
          ? errRes(404, "NOT_FOUND", "Không tìm thấy")
          : jsonRes(200, { data: [] }),
      ),
    );
    render(<AdminProductEditor id="zzz" />);
    expect(await screen.findByText("Không tìm thấy sản phẩm")).toBeInTheDocument();
  });

  it("nút xóa sản phẩm chỉ cho ADMIN; xác nhận nêu xóa mềm rồi về danh sách", async () => {
    role = "STAFF";
    stubProductApi();
    const { unmount } = render(<AdminProductEditor id="p1" />);
    await screen.findByLabelText("Tên sản phẩm");
    expect(screen.queryByRole("button", { name: "Xóa sản phẩm" })).not.toBeInTheDocument();
    unmount();

    role = "ADMIN";
    const mock = stubProductApi();
    render(<AdminProductEditor id="p1" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Xóa sản phẩm" }));
    const dialog = screen.getByRole("dialog", { name: "Xóa sản phẩm" });
    expect(within(dialog).getByText(/xóa mềm.*không thể khôi phục/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Xóa sản phẩm" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/san-pham"));
    expect(writes(mock)[0]).toMatchObject({ method: "DELETE", path: "/admin/products/p1" });
  });
});
