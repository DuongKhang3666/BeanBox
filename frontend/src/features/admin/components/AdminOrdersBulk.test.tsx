import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { makeAdminListItem, makeAdminOrder, makeStatusCounts } from "../testing";
import { AdminOrders } from "./AdminOrders";
import { AdminOrdersBulkPrint, parsePrintCodes } from "./AdminOrdersBulkPrint";

let search = "";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace, push: vi.fn() }),
}));

function stubFetch(handler: (path: string) => Response) {
  const mock = vi.fn(async (input: string) => handler(input.replace("/api/v1", "")));
  vi.stubGlobal("fetch", mock);
  return mock;
}

const codeOf = (i: number) => `BB-261110-${String(i).padStart(4, "0")}`;
const META = (total: number) => ({
  page: 1,
  pageSize: 20,
  total,
  totalPages: 1,
  statusCounts: makeStatusCounts({ PENDING: total }),
});

beforeEach(() => {
  search = "";
  replace.mockReset();
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("parsePrintCodes", () => {
  it("tách, trim, bỏ rỗng và bỏ trùng giữ thứ tự", () => {
    expect(parsePrintCodes(" A, B ,,A,C ")).toEqual(["A", "B", "C"]);
    expect(parsePrintCodes(null)).toEqual([]);
    expect(parsePrintCodes("")).toEqual([]);
  });
});

describe("AdminOrders: chọn nhiều để in phiếu (D-072)", () => {
  const items = [codeOf(1), codeOf(2), codeOf(3)].map((code) => makeAdminListItem({ code }));

  function renderList(list = items) {
    stubFetch(() => jsonRes(200, { data: list, meta: META(list.length) }));
    render(<AdminOrders />);
  }
  const table = () => screen.getByRole("table", { name: "Danh sách đơn hàng" });

  it("mỗi hàng có checkbox có nhãn; thanh hành động chỉ hiện khi đã chọn", async () => {
    renderList();
    await screen.findByRole("table", { name: "Danh sách đơn hàng" });
    expect(screen.queryByRole("region", { name: "Thao tác với đơn đã chọn" })).toBeNull();
    for (const it of items) {
      expect(within(table()).getByRole("checkbox", { name: `Chọn đơn ${it.code}` })).toBeVisible();
    }
    await userEvent.click(within(table()).getByRole("checkbox", { name: `Chọn đơn ${codeOf(2)}` }));
    const bar = screen.getByRole("region", { name: "Thao tác với đơn đã chọn" });
    expect(within(bar).getByText("Đã chọn 1 đơn")).toBeInTheDocument();
    expect(within(bar).getByRole("link", { name: "In phiếu (1)" })).toHaveAttribute(
      "href",
      `/admin/don-hang/in-hang-loat?codes=${codeOf(2)}`,
    );
  });

  it("chọn tất cả trang này, trạng thái lưng chừng, bỏ chọn", async () => {
    renderList();
    await screen.findByRole("table", { name: "Danh sách đơn hàng" });
    const all = within(table()).getByRole("checkbox", { name: "Chọn tất cả đơn trên trang này" });
    await userEvent.click(within(table()).getByRole("checkbox", { name: `Chọn đơn ${codeOf(1)}` }));
    expect((all as HTMLInputElement).indeterminate).toBe(true);
    await userEvent.click(all);
    expect(all).toBeChecked();
    const bar = screen.getByRole("region", { name: "Thao tác với đơn đã chọn" });
    expect(within(bar).getByRole("link", { name: "In phiếu (3)" })).toHaveAttribute(
      "href",
      `/admin/don-hang/in-hang-loat?codes=${codeOf(1)},${codeOf(2)},${codeOf(3)}`,
    );
    await userEvent.click(all);
    expect(screen.queryByRole("region", { name: "Thao tác với đơn đã chọn" })).toBeNull();

    await userEvent.click(all);
    await userEvent.click(screen.getByRole("button", { name: "Bỏ chọn" }));
    expect(screen.queryByRole("region", { name: "Thao tác với đơn đã chọn" })).toBeNull();
  });

  it("chọn quá 50 đơn: thông báo và nút In bị khóa", async () => {
    const many = Array.from({ length: 51 }, (_, i) => makeAdminListItem({ code: codeOf(i) }));
    renderList(many);
    await screen.findByRole("table", { name: "Danh sách đơn hàng" });
    await userEvent.click(
      within(table()).getByRole("checkbox", { name: "Chọn tất cả đơn trên trang này" }),
    );
    const bar = screen.getByRole("region", { name: "Thao tác với đơn đã chọn" });
    expect(within(bar).getByRole("alert")).toHaveTextContent("Chỉ in tối đa 50 đơn mỗi lần");
    expect(within(bar).queryByRole("link")).toBeNull();
    expect(within(bar).getByRole("button", { name: "In phiếu (51)" })).toBeDisabled();
  });

  it("hiện chỉ báo số ghi chú nội bộ", async () => {
    renderList([makeAdminListItem({ code: codeOf(1), noteCount: 2 }), items[1]!]);
    expect((await screen.findAllByText("2 ghi chú")).length).toBeGreaterThan(0);
    expect(screen.queryByText("0 ghi chú")).toBeNull();
  });
});

describe("AdminOrdersBulkPrint", () => {
  const orders = [codeOf(1), codeOf(2)].map((code) => makeAdminOrder({ code }));

  it("tải 1 request, mỗi đơn một phiếu; mã không tìm thấy được báo; nút In có số phiếu", async () => {
    search = `codes=${codeOf(1)},${codeOf(2)},BB-000000-ZZZZ`;
    const mock = stubFetch(() =>
      jsonRes(200, { data: orders, meta: { missing: ["BB-000000-ZZZZ"] } }),
    );
    const print = vi.fn();
    vi.stubGlobal("print", print);
    render(<AdminOrdersBulkPrint />);

    expect(await screen.findByLabelText(`Phiếu giao hàng ${codeOf(1)}`)).toBeInTheDocument();
    expect(screen.getByLabelText(`Phiếu giao hàng ${codeOf(2)}`)).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent("Không tìm thấy 1 đơn: BB-000000-ZZZZ");
    // Ngắt trang giữa các phiếu, phiếu cuối không ngắt thêm.
    const [first, second] = screen.getAllByRole("article");
    expect(first!.className).toContain("print:break-after-page");
    expect(second!.className).not.toContain("break-after-page");
    expect(screen.getByRole("link", { name: /Quay lại danh sách đơn hàng/ })).toHaveAttribute(
      "href",
      "/admin/don-hang",
    );

    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0]![0]).toBe(
      `/api/v1/admin/orders/print?codes=${encodeURIComponent(`${codeOf(1)},${codeOf(2)},BB-000000-ZZZZ`)}`,
    );
    await userEvent.click(screen.getByRole("button", { name: "In 2 phiếu" }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("thanh điều khiển và cảnh báo ẩn khi in", async () => {
    search = `codes=${codeOf(1)},BB-000000-ZZZZ`;
    stubFetch(() => jsonRes(200, { data: [orders[0]], meta: { missing: ["BB-000000-ZZZZ"] } }));
    render(<AdminOrdersBulkPrint />);
    await screen.findByRole("article");
    expect(screen.getByRole("button", { name: "In 1 phiếu" }).parentElement!.className).toContain(
      "print:hidden",
    );
    expect(screen.getByRole("alert").className).toContain("print:hidden");
  });

  it("không có mã -> hướng dẫn, không gọi API", () => {
    search = "";
    const mock = stubFetch(() => jsonRes(200, { data: [] }));
    render(<AdminOrdersBulkPrint />);
    expect(screen.getByRole("heading", { name: "Chưa chọn đơn nào để in" })).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();
  });

  it("quá 50 mã -> thông báo, không gọi API", () => {
    search = `codes=${Array.from({ length: 51 }, (_, i) => codeOf(i)).join(",")}`;
    const mock = stubFetch(() => jsonRes(200, { data: [] }));
    render(<AdminOrdersBulkPrint />);
    expect(screen.getByRole("heading", { name: "Chọn quá nhiều đơn để in" })).toBeInTheDocument();
    expect(screen.getByText(/đang chọn 51/)).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();
  });

  it("tất cả mã không tồn tại -> không có phiếu, nút In bị khóa", async () => {
    search = "codes=BB-000000-ZZZZ";
    stubFetch(() => jsonRes(200, { data: [], meta: { missing: ["BB-000000-ZZZZ"] } }));
    render(<AdminOrdersBulkPrint />);
    expect(await screen.findByText("Không có phiếu nào để in.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "In 0 phiếu" })).toBeDisabled();
  });

  it("lỗi tải -> ErrorState có Thử lại", async () => {
    search = `codes=${codeOf(1)}`;
    let fail = true;
    stubFetch(() =>
      fail
        ? errRes(500, "INTERNAL_ERROR")
        : jsonRes(200, { data: [orders[0]], meta: { missing: [] } }),
    );
    render(<AdminOrdersBulkPrint />);
    expect(await screen.findByText("Không tải được phiếu giao")).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: /Thử lại/ }));
    expect(await screen.findByRole("article")).toBeInTheDocument();
  });
});
