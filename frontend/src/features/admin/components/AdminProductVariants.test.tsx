import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { jsonBody, stubProductApi, writes } from "../productTesting";
import { makeAdminProduct, makeAdminVariant } from "../testing";
import { AdminProductEditor } from "./AdminProductEditor";

vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ role: "ADMIN" }) }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => tokenStore.clear());
afterEach(() => vi.unstubAllGlobals());

async function openEditor() {
  render(<AdminProductEditor id="p1" />);
  await screen.findByText("Biến thể");
}

describe("Biến thể", () => {
  it("bảng hiển thị SKU, giá sale kèm khung giờ VN, giá hiệu lực, tồn", async () => {
    stubProductApi({
      product: makeAdminProduct({
        variants: [
          makeAdminVariant({
            salePrice: 180000,
            effectivePrice: 180000,
            isOnSale: true,
            saleStart: "2026-11-10T08:30:00.000Z",
            saleEnd: "2026-11-20T16:59:00.000Z",
            stock: 3,
            stockStatus: "LOW_STOCK",
          }),
        ],
      }),
    });
    await openEditor();
    expect(screen.getAllByText("ETH-250").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/15:30 10\/11\/2026/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/23:59 20\/11\/2026/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sắp hết").length).toBeGreaterThan(0);
  });

  it("tạo: validate giá sale < giá; gửi SKU hoa, stock, thời gian ISO UTC", async () => {
    const mock = stubProductApi({
      onWrite: () => jsonRes(201, { data: makeAdminVariant({ id: "v2", sku: "ETH-500" }) }),
    });
    await openEditor();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Thêm biến thể" }));
    const dialog = screen.getByRole("dialog", { name: "Thêm biến thể" });
    const d = within(dialog);

    await user.type(d.getByLabelText("SKU"), "eth-500");
    expect(d.getByLabelText("SKU")).toHaveValue("ETH-500");
    await user.type(d.getByLabelText("Tên biến thể"), "Gói 500 g");
    await user.type(d.getByLabelText("Tên thuộc tính 1"), "weight");
    await user.type(d.getByLabelText("Giá trị thuộc tính 1"), "500g");
    await user.type(d.getByLabelText("Giá (VND)"), "300000");
    await user.type(d.getByLabelText("Giá khuyến mãi (VND)"), "350000");
    await user.click(d.getByRole("button", { name: "Thêm biến thể" }));
    expect(await d.findByText("Giá khuyến mãi phải nhỏ hơn giá gốc.")).toBeInTheDocument();
    expect(writes(mock)).toHaveLength(0);

    await user.clear(d.getByLabelText("Giá khuyến mãi (VND)"));
    await user.type(d.getByLabelText("Giá khuyến mãi (VND)"), "250000");
    fireEvent.change(d.getByLabelText("Bắt đầu khuyến mãi"), {
      target: { value: "2026-11-10T15:30" },
    });
    fireEvent.change(d.getByLabelText("Kết thúc khuyến mãi"), {
      target: { value: "2026-11-20T23:59" },
    });
    await user.clear(d.getByLabelText("Tồn kho ban đầu"));
    await user.type(d.getByLabelText("Tồn kho ban đầu"), "8");
    await user.click(d.getByRole("button", { name: "Thêm biến thể" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const [call] = writes(mock);
    expect(call!.path).toBe("/admin/products/p1/variants");
    expect(jsonBody(call!.init)).toEqual({
      sku: "ETH-500",
      name: "Gói 500 g",
      attributes: { weight: "500g" },
      price: 300000,
      salePrice: 250000,
      saleStart: "2026-11-10T08:30:00.000Z",
      saleEnd: "2026-11-20T16:59:00.000Z",
      stock: 8,
      lowStockThreshold: 5,
      weightGram: 0,
      sortOrder: 0,
      isActive: true,
    });
    expect(await screen.findByText("Đã thêm biến thể ETH-500.")).toBeInTheDocument();
  });

  it("sửa: không có ô tồn kho ban đầu, PATCH chỉ gửi trường đổi và không gửi stock", async () => {
    const mock = stubProductApi({
      onWrite: () => jsonRes(200, { data: makeAdminVariant({ name: "Gói 250 g (mới)" }) }),
    });
    await openEditor();
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Sửa biến thể ETH-250" })[0]!);
    const dialog = screen.getByRole("dialog", { name: "Sửa biến thể" });
    const d = within(dialog);
    expect(d.queryByLabelText("Tồn kho ban đầu")).not.toBeInTheDocument();
    expect(d.getByText(/Tồn kho hiện tại/)).toBeInTheDocument();
    const name = d.getByLabelText("Tên biến thể");
    await user.clear(name);
    await user.type(name, "Gói 250 g (mới)");
    await user.click(d.getByRole("button", { name: "Lưu biến thể" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const [call] = writes(mock);
    expect(call!.method).toBe("PATCH");
    expect(call!.path).toBe("/admin/variants/v1");
    expect(jsonBody(call!.init)).toEqual({ name: "Gói 250 g (mới)" });
  });

  it("sửa: xóa trắng giá sale, thời gian sale, ngày rang gửi null", async () => {
    const mock = stubProductApi({
      product: makeAdminProduct({
        variants: [
          makeAdminVariant({
            salePrice: 180000,
            saleStart: "2026-11-10T08:30:00.000Z",
            saleEnd: "2026-11-20T16:59:00.000Z",
            roastDate: "2026-11-01",
          }),
        ],
      }),
      onWrite: () => jsonRes(200, { data: makeAdminVariant() }),
    });
    await openEditor();
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Sửa biến thể ETH-250" })[0]!);
    const d = within(screen.getByRole("dialog", { name: "Sửa biến thể" }));
    await user.clear(d.getByLabelText("Giá khuyến mãi (VND)"));
    fireEvent.change(d.getByLabelText("Bắt đầu khuyến mãi"), { target: { value: "" } });
    fireEvent.change(d.getByLabelText("Kết thúc khuyến mãi"), { target: { value: "" } });
    fireEvent.change(d.getByLabelText(/^Ngày rang/), { target: { value: "" } });
    await user.click(d.getByRole("button", { name: "Lưu biến thể" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(jsonBody(writes(mock)[0]!.init)).toEqual({
      salePrice: null,
      saleStart: null,
      saleEnd: null,
      roastDate: null,
    });
  });

  it("SKU_TAKEN hiện dưới ô SKU", async () => {
    stubProductApi({ onWrite: () => errRes(409, "SKU_TAKEN", "SKU đã tồn tại", { field: "sku" }) });
    await openEditor();
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Sửa biến thể ETH-250" })[0]!);
    const d = within(screen.getByRole("dialog"));
    await user.clear(d.getByLabelText("SKU"));
    await user.type(d.getByLabelText("SKU"), "DUP-1");
    await user.click(d.getByRole("button", { name: "Lưu biến thể" }));
    expect(await d.findByText(/SKU này đã được dùng/)).toBeInTheDocument();
  });

  it("xóa biến thể cuối của sản phẩm đang bán: 409 CONFLICT hiện message server", async () => {
    const msg = "Hãy chuyển sản phẩm sang Nháp trước khi ngừng bán biến thể cuối cùng";
    const mock = stubProductApi({ onWrite: () => errRes(409, "CONFLICT", msg) });
    await openEditor();
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Xóa biến thể ETH-250" })[0]!);
    const confirm = screen.getByRole("dialog", { name: "Xóa biến thể" });
    await user.click(within(confirm).getByRole("button", { name: "Xóa biến thể" }));
    expect(await screen.findByText(msg)).toBeInTheDocument();
    expect(writes(mock)[0]).toMatchObject({ method: "DELETE", path: "/admin/variants/v1" });
    // biến thể vẫn còn trong bảng
    expect(screen.getAllByText("ETH-250").length).toBeGreaterThan(0);
  });

  it("xóa biến thể thành công loại khỏi bảng; Điều chỉnh tồn mở hộp thoại có sẵn", async () => {
    stubProductApi({
      product: makeAdminProduct({
        variants: [
          makeAdminVariant(),
          makeAdminVariant({ id: "v2", sku: "ETH-500", sortOrder: 1 }),
        ],
      }),
    });
    await openEditor();
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Điều chỉnh tồn ETH-500" })[0]!);
    expect(screen.getByRole("dialog", { name: "Điều chỉnh tồn kho" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Đóng" }));

    await user.click(screen.getAllByRole("button", { name: "Xóa biến thể ETH-500" })[0]!);
    await user.click(
      within(screen.getByRole("dialog", { name: "Xóa biến thể" })).getByRole("button", {
        name: "Xóa biến thể",
      }),
    );
    expect(await screen.findByText("Đã xóa biến thể ETH-500.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sửa biến thể ETH-500" })).not.toBeInTheDocument();
  });
});
