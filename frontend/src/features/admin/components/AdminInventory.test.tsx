import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bodyOf, errRes, jsonRes } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { makeInventoryItem } from "../testing";
import { AdminInventory } from "./AdminInventory";

let search = "";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace, push: vi.fn() }),
}));

type Handler = (path: string, init: RequestInit) => Response;
function stubFetch(handler: Handler) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) =>
    handler(input.replace("/api/v1", ""), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

const META = { page: 1, pageSize: 20, total: 2, totalPages: 1 };
const ITEMS = [
  makeInventoryItem(),
  makeInventoryItem({
    variantId: "v2",
    sku: "HAR-V60-02",
    variantName: "Size 02",
    productName: "Phễu V60",
    productStatus: "DRAFT",
    stock: 0,
    stockStatus: "OUT_OF_STOCK",
    isActive: false,
  }),
];
const isPost = (init: RequestInit) => init.method === "POST";

beforeEach(() => {
  search = "";
  replace.mockReset();
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

async function openDialog(sku = "ETH-YIRG-250") {
  await userEvent.click(
    (await screen.findAllByRole("button", { name: `Điều chỉnh tồn kho ${sku}` }))[0]!,
  );
  return screen.getByRole("dialog", { name: "Điều chỉnh tồn kho" });
}

function adjustHandler(onPost: (init: RequestInit) => Response): Handler {
  return (path, init) => (isPost(init) ? onPost(init) : jsonRes(200, { data: ITEMS, meta: META }));
}

describe("AdminInventory", () => {
  it("skeleton -> danh sách: SKU, trạng thái sản phẩm, badge tồn, ngừng bán, link lịch sử", async () => {
    const mock = stubFetch(() => jsonRes(200, { data: ITEMS, meta: META }));
    render(<AdminInventory />);
    expect(screen.getByLabelText("Đang tải tồn kho")).toBeInTheDocument();

    expect((await screen.findAllByText("SKU ETH-YIRG-250")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Còn hàng").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hết hàng").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nháp").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ngừng bán").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Lịch sử tồn kho ETH-YIRG-250" })[0],
    ).toHaveAttribute("href", "/admin/ton-kho/lich-su?variantId=v1");
    expect(mock).toHaveBeenCalledWith("/api/v1/admin/inventory?pageSize=20", expect.anything());
  });

  it("bộ lọc: tích trạng thái và đổi sắp xếp cập nhật URL", async () => {
    stubFetch(() => jsonRes(200, { data: ITEMS, meta: META }));
    render(<AdminInventory />);
    await screen.findAllByText("SKU ETH-YIRG-250");
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Hết hàng" }));
    expect(replace).toHaveBeenLastCalledWith("/admin/ton-kho?stockStatus=OUT_OF_STOCK");
    await user.selectOptions(screen.getByLabelText("Sắp xếp"), "name");
    expect(replace).toHaveBeenLastCalledWith("/admin/ton-kho?sort=name");
  });

  it("bộ lọc trên URL được gửi lên API và hiển thị trạng thái đã chọn", async () => {
    search = "stockStatus=OUT_OF_STOCK,LOW_STOCK&sort=updated&q=v60&page=2";
    const mock = stubFetch(() =>
      jsonRes(200, { data: ITEMS, meta: { ...META, page: 2, total: 45, totalPages: 3 } }),
    );
    render(<AdminInventory />);
    await screen.findAllByText("SKU ETH-YIRG-250");
    const url = new URL(mock.mock.calls[0]![0] as string, "http://x");
    expect(url.searchParams.get("stockStatus")).toBe("OUT_OF_STOCK,LOW_STOCK");
    expect(url.searchParams.get("sort")).toBe("updated");
    expect(url.searchParams.get("q")).toBe("v60");
    expect(url.searchParams.get("page")).toBe("2");
    expect(screen.getByRole("checkbox", { name: "Sắp hết" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Còn hàng" })).not.toBeChecked();
    expect(screen.getByRole("link", { name: "Trang 3" })).toHaveAttribute(
      "href",
      "/admin/ton-kho?q=v60&stockStatus=OUT_OF_STOCK%2CLOW_STOCK&sort=updated&page=3",
    );
  });

  it("ô tìm: debounce rồi cập nhật URL", async () => {
    stubFetch(() => jsonRes(200, { data: ITEMS, meta: META }));
    render(<AdminInventory />);
    await screen.findAllByText("SKU ETH-YIRG-250");
    await userEvent.type(screen.getByLabelText(/Tìm theo SKU/), "eth");
    expect(replace).not.toHaveBeenCalled();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/ton-kho?q=eth"), {
      timeout: 2000,
    });
  });

  it("rỗng -> EmptyState; lỗi -> ErrorState có Thử lại", async () => {
    stubFetch(() => jsonRes(200, { data: [], meta: { ...META, total: 0, totalPages: 0 } }));
    const { unmount } = render(<AdminInventory />);
    expect(await screen.findByText("Không có biến thể nào")).toBeInTheDocument();
    unmount();

    let n = 0;
    stubFetch(() =>
      ++n === 1 ? errRes(500, "INTERNAL_ERROR") : jsonRes(200, { data: ITEMS, meta: META }),
    );
    render(<AdminInventory />);
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Thử lại" }));
    expect((await screen.findAllByText("SKU ETH-YIRG-250")).length).toBeGreaterThan(0);
  });

  it("DAMAGE: gửi change âm + expectedStock, ghi chú bắt buộc; thành công cập nhật dòng và thông báo", async () => {
    const mock = stubFetch(
      adjustHandler(() =>
        jsonRes(200, {
          data: {
            item: makeInventoryItem({ stock: 9 }),
            movement: null,
          },
        }),
      ),
    );
    render(<AdminInventory />);
    const dialog = await openDialog();
    const user = userEvent.setup();
    await user.selectOptions(within(dialog).getByLabelText("Lý do"), "DAMAGE");
    await user.type(within(dialog).getByLabelText(/Số lượng hư hỏng/), "3");
    expect(within(dialog).getByText("Tồn sau dự kiến").nextSibling).toHaveTextContent("9");

    await user.click(within(dialog).getByRole("button", { name: "Lưu điều chỉnh" }));
    expect(await within(dialog).findByText("Vui lòng nhập ghi chú.")).toBeInTheDocument();
    expect(mock.mock.calls.some(([, init]) => isPost(init as RequestInit))).toBe(false);

    await user.type(within(dialog).getByLabelText(/Ghi chú/), "Vỡ khi vận chuyển");
    await user.click(within(dialog).getByRole("button", { name: "Lưu điều chỉnh" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const call = mock.mock.calls.findIndex(([, init]) => isPost(init as RequestInit));
    expect(mock.mock.calls[call]![0]).toBe("/api/v1/admin/inventory/adjust");
    expect(bodyOf(mock, call)).toEqual({
      variantId: "v1",
      reason: "DAMAGE",
      change: -3,
      note: "Vỡ khi vận chuyển",
      expectedStock: 12,
    });
    expect(await screen.findByText(/Đã cập nhật tồn kho ETH-YIRG-250: 12 → 9/)).toBeInTheDocument();
    expect(screen.getAllByText("9").length).toBeGreaterThan(0);
  });

  it("STOCKTAKE gửi newStock (không có change); RESTOCK gửi change dương", async () => {
    const mock = stubFetch(
      adjustHandler(() =>
        jsonRes(200, { data: { item: makeInventoryItem({ stock: 20 }), movement: null } }),
      ),
    );
    render(<AdminInventory />);
    let dialog = await openDialog();
    const user = userEvent.setup();
    await user.selectOptions(within(dialog).getByLabelText("Lý do"), "STOCKTAKE");
    await user.type(within(dialog).getByLabelText("Tồn kho thực tế"), "20");
    await user.click(within(dialog).getByRole("button", { name: "Lưu điều chỉnh" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    let call = mock.mock.calls.findIndex(([, init]) => isPost(init as RequestInit));
    expect(bodyOf(mock, call)).toEqual({
      variantId: "v1",
      reason: "STOCKTAKE",
      newStock: 20,
      expectedStock: 12,
    });

    dialog = await openDialog();
    await user.type(within(dialog).getByLabelText("Số lượng nhập"), "5");
    await user.click(within(dialog).getByRole("button", { name: "Lưu điều chỉnh" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    call = mock.mock.calls.findLastIndex(([, init]) => isPost(init as RequestInit));
    expect(bodyOf(mock, call)).toEqual({
      variantId: "v1",
      reason: "RESTOCK",
      change: 5,
      expectedStock: 20,
    });
  });

  it("validate client: nhập hàng <= 0, điều chỉnh = 0, kiểm kê âm; không gọi API", async () => {
    const mock = stubFetch(() => jsonRes(200, { data: ITEMS, meta: META }));
    render(<AdminInventory />);
    const dialog = await openDialog();
    const user = userEvent.setup();
    const save = () => user.click(within(dialog).getByRole("button", { name: "Lưu điều chỉnh" }));

    await user.type(within(dialog).getByLabelText("Số lượng nhập"), "0");
    await save();
    expect(await within(dialog).findByText("Số lượng nhập phải lớn hơn 0.")).toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText("Lý do"), "ADJUSTMENT");
    await user.type(within(dialog).getByLabelText(/Thay đổi/), "0");
    await user.type(within(dialog).getByLabelText(/Ghi chú/), "Lệch sổ");
    await save();
    expect(await within(dialog).findByText("Thay đổi phải khác 0.")).toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText("Lý do"), "STOCKTAKE");
    await user.type(within(dialog).getByLabelText("Tồn kho thực tế"), "-1");
    await save();
    expect(await within(dialog).findByText("Tồn kho thực tế không được âm.")).toBeInTheDocument();
    expect(mock.mock.calls.some(([, init]) => isPost(init as RequestInit))).toBe(false);
  });

  it("409 CONFLICT: báo tồn vừa đổi (hiện còn N), cập nhật dòng, giữ hộp thoại", async () => {
    stubFetch(
      adjustHandler(() => errRes(409, "CONFLICT", "Tồn kho đã thay đổi", { currentStock: 7 })),
    );
    render(<AdminInventory />);
    const dialog = await openDialog();
    const user = userEvent.setup();
    await user.type(within(dialog).getByLabelText("Số lượng nhập"), "5");
    await user.click(within(dialog).getByRole("button", { name: "Lưu điều chỉnh" }));

    expect(
      await within(dialog).findByText(/Tồn kho vừa thay đổi \(hiện còn 7\)/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Tồn hiện tại").nextSibling).toHaveTextContent("7");
    expect(within(dialog).getByText("Tồn sau dự kiến").nextSibling).toHaveTextContent("12");
  });

  it("400 VALIDATION_ERROR: lỗi hiện dưới field", async () => {
    stubFetch(
      adjustHandler(() =>
        errRes(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", [
          { field: "change", message: "Số lượng nhập phải lớn hơn 0" },
        ]),
      ),
    );
    render(<AdminInventory />);
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText("Số lượng nhập"), "5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu điều chỉnh" }));
    expect(await within(dialog).findByText("Số lượng nhập phải lớn hơn 0")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Số lượng nhập")).toHaveAttribute("aria-invalid", "true");
  });
});
