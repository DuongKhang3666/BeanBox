import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bodyOf, errRes, jsonRes } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import type { AnalyticsTopProducts } from "@/types/admin";
import { invItem, makeInventory } from "../analyticsTesting";
import { projectedAvgCost } from "../costing";
import { makeAdminVariant, makeInventoryItem } from "../testing";
import { InventoryBlock } from "./AnalyticsInventory";
import { TopProductsBlock } from "./AnalyticsTops";
import { StockAdjustDialog } from "./StockAdjustDialog";
import { VariantDialog } from "./VariantDialog";

type Handler = (path: string, init: RequestInit) => Response;
function stubFetch(handler: Handler) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) =>
    handler(input.replace("/api/v1", ""), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => tokenStore.clear());
afterEach(() => vi.unstubAllGlobals());

describe("projectedAvgCost (hiển thị dự kiến, D-078)", () => {
  it("chưa có giá vốn hoặc tồn <= 0 -> đúng đơn giá nhập", () => {
    expect(projectedAvgCost(10, null, 5, 70000)).toBe(70000);
    expect(projectedAvgCost(0, 50000, 5, 70000)).toBe(70000);
    expect(projectedAvgCost(-2, 50000, 5, 70000)).toBe(70000);
  });
  it("bình quân gia quyền, làm tròn nửa lên", () => {
    expect(projectedAvgCost(10, 60000, 30, 80000)).toBe(75000);
    expect(projectedAvgCost(1, 100, 1, 101)).toBe(101);
    expect(projectedAvgCost(2, 100, 1, 101)).toBe(100);
  });
});

describe("StockAdjustDialog: đơn giá nhập (D-078)", () => {
  const adminItem = makeInventoryItem({ stock: 10, avgCost: 60000 });
  const staffItem = makeInventoryItem({ stock: 10 }); // Staff: server không trả khóa avgCost

  function open(item = adminItem) {
    const onAdjusted = vi.fn();
    render(
      <StockAdjustDialog
        item={item}
        onAdjusted={onAdjusted}
        onStockChanged={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    return { onAdjusted, dialog: screen.getByRole("dialog", { name: "Điều chỉnh tồn kho" }) };
  }

  it("Admin + nhập hàng: bắt buộc đơn giá nhập, hiện giá vốn hiện tại và giá vốn mới dự kiến", async () => {
    const mock = stubFetch(() => jsonRes(200, { data: { item: adminItem, movement: null } }));
    const { dialog } = open();
    const user = userEvent.setup();
    await user.type(within(dialog).getByLabelText("Số lượng nhập"), "30");

    // Chưa nhập đơn giá: báo lỗi, không gọi API.
    await user.click(within(dialog).getByRole("button", { name: "Lưu điều chỉnh" }));
    expect(await within(dialog).findByText("Vui lòng nhập đơn giá nhập.")).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();

    expect(within(dialog).getByText("Giá vốn hiện tại").nextSibling).toHaveTextContent("60.000");
    await user.type(within(dialog).getByLabelText(/Đơn giá nhập/), "80000");
    // (10 x 60.000 + 30 x 80.000) / 40 = 75.000
    expect(within(dialog).getByText("Giá vốn mới dự kiến").nextSibling).toHaveTextContent("75.000");

    await user.click(within(dialog).getByRole("button", { name: "Lưu điều chỉnh" }));
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    expect(bodyOf(mock, 0)).toEqual({
      variantId: "v1",
      reason: "RESTOCK",
      change: 30,
      expectedStock: 10,
      unitCost: 80000,
    });
  });

  it("Admin: chưa có giá vốn hiển thị 'Chưa có'; đơn giá âm bị từ chối", async () => {
    const mock = stubFetch(() => jsonRes(200, {}));
    const { dialog } = open(makeInventoryItem({ stock: 0, avgCost: null }));
    const user = userEvent.setup();
    expect(within(dialog).getByText("Giá vốn hiện tại").nextSibling).toHaveTextContent("Chưa có");
    await user.type(within(dialog).getByLabelText("Số lượng nhập"), "5");
    await user.type(within(dialog).getByLabelText(/Đơn giá nhập/), "-3");
    await user.click(within(dialog).getByRole("button", { name: "Lưu điều chỉnh" }));
    expect(await within(dialog).findByText(/Đơn giá nhập phải là số nguyên/)).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();
  });

  it("chỉ lý do nhập hàng mới có ô đơn giá", async () => {
    stubFetch(() => jsonRes(200, {}));
    const { dialog } = open();
    const user = userEvent.setup();
    expect(within(dialog).getByLabelText(/Đơn giá nhập/)).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText("Lý do"), "DAMAGE");
    expect(within(dialog).queryByLabelText(/Đơn giá nhập/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Giá vốn hiện tại")).not.toBeInTheDocument();
  });

  it("Staff (không có khóa avgCost): không thấy ô đơn giá/giá vốn và không gửi unitCost", async () => {
    const mock = stubFetch(() => jsonRes(200, { data: { item: staffItem, movement: null } }));
    const { dialog } = open(staffItem);
    const user = userEvent.setup();
    expect(within(dialog).queryByLabelText(/Đơn giá nhập/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Giá vốn/)).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Số lượng nhập"), "4");
    await user.click(within(dialog).getByRole("button", { name: "Lưu điều chỉnh" }));
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    expect(bodyOf(mock, 0)).toEqual({
      variantId: "v1",
      reason: "RESTOCK",
      change: 4,
      expectedStock: 10,
    });
  });

  it("lỗi unitCost từ server hiện dưới ô", async () => {
    stubFetch(() =>
      errRes(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", [
        { field: "unitCost", message: "Đơn giá nhập quá lớn" },
      ]),
    );
    const { dialog } = open();
    const user = userEvent.setup();
    await user.type(within(dialog).getByLabelText("Số lượng nhập"), "1");
    await user.type(within(dialog).getByLabelText(/Đơn giá nhập/), "5");
    await user.click(within(dialog).getByRole("button", { name: "Lưu điều chỉnh" }));
    expect(await within(dialog).findByText("Đơn giá nhập quá lớn")).toBeInTheDocument();
  });
});

describe("VariantDialog: giá vốn bình quân (D-078)", () => {
  const variant = makeAdminVariant({ avgCost: 50000 });

  it("Staff (canSetCost = false): không có trường giá vốn", () => {
    render(
      <VariantDialog
        productId="p1"
        variant={makeAdminVariant()}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/Giá vốn bình quân/)).not.toBeInTheDocument();
  });

  it("Admin: hiện giá trị hiện có; sửa phải xác nhận rồi gửi avgCost", async () => {
    const mock = stubFetch(() => jsonRes(200, { data: makeAdminVariant({ avgCost: 55000 }) }));
    const onSaved = vi.fn();
    render(
      <VariantDialog
        productId="p1"
        variant={variant}
        canSetCost
        onSaved={onSaved}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const field = screen.getByLabelText(/Giá vốn bình quân/);
    expect(field).toHaveValue(50000);
    expect(screen.queryByLabelText(/Tôi xác nhận sửa giá vốn/)).not.toBeInTheDocument();

    await user.clear(field);
    await user.type(field, "55000");
    await user.click(screen.getByRole("button", { name: "Lưu biến thể" }));
    expect(await screen.findByText("Vui lòng xác nhận sửa giá vốn thủ công.")).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText(/Tôi xác nhận sửa giá vốn/));
    await user.click(screen.getByRole("button", { name: "Lưu biến thể" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(bodyOf(mock, 0)).toEqual({ avgCost: 55000 });
  });

  it("Admin: để trống = xóa giá vốn (null)", async () => {
    const mock = stubFetch(() => jsonRes(200, { data: makeAdminVariant({ avgCost: null }) }));
    render(
      <VariantDialog
        productId="p1"
        variant={variant}
        canSetCost
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/Giá vốn bình quân/));
    await user.click(screen.getByLabelText(/Tôi xác nhận sửa giá vốn/));
    await user.click(screen.getByRole("button", { name: "Lưu biến thể" }));
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    expect(bodyOf(mock, 0)).toEqual({ avgCost: null });
  });

  it("Admin: giá vốn không hợp lệ bị chặn ở client", async () => {
    const mock = stubFetch(() => jsonRes(200, {}));
    render(
      <VariantDialog
        productId="p1"
        variant={makeAdminVariant({ avgCost: null })}
        canSetCost
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Giá vốn bình quân/), "1.5");
    await user.click(screen.getByRole("button", { name: "Lưu biến thể" }));
    expect(await screen.findByText(/Giá vốn phải/)).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();
  });

  it("Admin tạo biến thể mới: có thể nhập giá vốn ban đầu", async () => {
    const mock = stubFetch(() => jsonRes(201, { data: makeAdminVariant({ avgCost: 30000 }) }));
    render(<VariantDialog productId="p1" canSetCost onSaved={vi.fn()} onClose={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("SKU"), "NEW-1");
    await user.type(screen.getByLabelText("Tên biến thể"), "Gói mới");
    await user.type(screen.getByLabelText("Giá (VND)"), "90000");
    await user.type(screen.getByLabelText(/Giá vốn bình quân/), "30000");
    await user.click(screen.getByRole("button", { name: "Thêm biến thể" }));
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    expect(bodyOf(mock, 0)).toMatchObject({ sku: "NEW-1", price: 90000, avgCost: 30000 });
  });
});

describe("Khối phân tích: lợi nhuận và giá vốn", () => {
  const RANGE = { from: "2026-10-22", to: "2026-11-20", days: 30, timezone: "Asia/Ho_Chi_Minh" };
  const base = (items: AnalyticsTopProducts["items"]): AnalyticsTopProducts => ({
    range: RANGE,
    sort: "revenue",
    limit: 10,
    items,
    generatedAt: "2026-11-20T05:00:00.000Z",
  });

  it("top sản phẩm: cột lợi nhuận gộp và biên; thiếu giá vốn hiện 'Chưa có giá vốn'", async () => {
    stubFetch(() =>
      jsonRes(200, {
        data: base([
          {
            productId: "p1",
            name: "Phin nhôm",
            slug: "phin",
            deleted: false,
            categoryName: null,
            revenue: 900000,
            quantity: 3,
            orders: 2,
            cogs: 600000,
            grossProfit: 300000,
            margin: 0.3333,
            costCoverage: 1,
          },
          {
            productId: "p2",
            name: "Bình giữ nhiệt",
            slug: "binh",
            deleted: false,
            categoryName: null,
            revenue: 100000,
            quantity: 1,
            orders: 1,
            cogs: null,
            grossProfit: null,
            margin: null,
            costCoverage: 0,
          },
        ]),
      }),
    );
    render(<TopProductsBlock from="2026-10-22" to="2026-11-20" refresh={0} />);
    expect(await screen.findByRole("columnheader", { name: "Lợi nhuận gộp" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Biên" })).toBeInTheDocument();
    const row1 = screen.getByRole("row", { name: /Phin nhôm/ });
    expect(within(row1).getByText(/300\.000/)).toBeInTheDocument();
    expect(within(row1).getByText("33,3%")).toBeInTheDocument();
    const row2 = screen.getByRole("row", { name: /Bình giữ nhiệt/ });
    expect(within(row2).getByText("Chưa có giá vốn")).toBeInTheDocument();
  });

  it("tồn kho: giá trị tồn theo giá vốn kèm số biến thể chưa có giá vốn; cột theo từng biến thể", async () => {
    stubFetch(() =>
      jsonRes(200, {
        data: makeInventory({
          outOfStock: [
            invItem("het1", { avgCost: 60000, stockCostValue: null }),
            invItem("het2", { stock: 0 }),
          ],
        }),
      }),
    );
    render(<InventoryBlock refresh={0} />);
    expect(await screen.findByText("Giá trị tồn theo giá vốn")).toBeInTheDocument();
    expect(screen.getByText(/23\.000\.000/)).toBeInTheDocument();
    expect(screen.getByText(/chưa tính 3 biến thể còn hàng chưa có giá vốn/)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Giá trị theo giá vốn" })).toBeInTheDocument();
    expect(screen.getAllByText("Chưa có").length).toBeGreaterThan(0);
  });
});
