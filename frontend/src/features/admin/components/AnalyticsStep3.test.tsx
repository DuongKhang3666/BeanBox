import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import {
  invItem,
  makeCoupons,
  makeCustomers,
  makeInventory,
  makeOperations,
  T_RANGE,
} from "../analyticsTesting";
import { AdminAnalytics } from "./AdminAnalytics";

let role: "ADMIN" | "STAFF" = "ADMIN";
const replace = vi.fn();
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ role }) }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/admin/phan-tich",
}));

const NOW = new Date("2026-11-20T05:00:00Z");
const zero = { current: 0, previous: 0, changePct: null };

interface Handlers {
  customers?: () => Response;
  operations?: () => Response;
  inventory?: (url: string) => Response;
}

function stub(h: Handlers = {}) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/analytics/customers")) {
      return h.customers ? h.customers() : jsonRes(200, { data: makeCustomers() });
    }
    if (url.includes("/analytics/operations")) {
      return h.operations ? h.operations() : jsonRes(200, { data: makeOperations() });
    }
    if (url.includes("/analytics/inventory")) {
      return h.inventory ? h.inventory(url) : jsonRes(200, { data: makeInventory() });
    }
    if (url.includes("/analytics/breakdown")) {
      return jsonRes(200, {
        data: {
          range: T_RANGE,
          previousRange: { from: "2026-09-22", to: "2026-10-21" },
          groups: [],
          total: { revenue: 0, orders: 0, quantity: null },
          basis: "order",
        },
      });
    }
    if (url.includes("/analytics/coupons")) return jsonRes(200, { data: makeCoupons() });
    if (url.includes("/analytics/top-")) return jsonRes(200, { data: { items: [] } });
    return jsonRes(200, {
      data: {
        range: { ...T_RANGE, granularity: "day" },
        previousRange: { from: "2026-09-22", to: "2026-10-21" },
        kpis: {
          revenue: zero,
          paidOrders: zero,
          aov: zero,
          ordersPlaced: zero,
          cancelledOrders: zero,
          cancelRate: { current: 0, previous: 0, changePts: null },
          discountTotal: zero,
          refundedAmount: zero,
          newCustomers: zero,
        },
        series: [],
        previousSeries: [],
        generatedAt: "2026-11-20T05:00:00.000Z",
      },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const callsTo = (fn: ReturnType<typeof stub>, part: string) =>
  fn.mock.calls.map((c) => String(c[0])).filter((u) => u.includes(part));

beforeEach(() => {
  tokenStore.clear();
  role = "ADMIN";
  replace.mockReset();
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

describe("mục lục neo", () => {
  it("có nav với 7 liên kết neo trỏ tới heading có id", async () => {
    stub();
    render(<AdminAnalytics />);
    const nav = screen.getByRole("navigation", { name: "Mục lục phân tích" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([
      "Tổng quan",
      "Cơ cấu doanh thu",
      "Top",
      "Mã giảm giá",
      "Khách hàng",
      "Vận hành",
      "Tồn kho",
    ]);
    await screen.findByRole("heading", { name: "Tồn kho" });
    for (const a of links) {
      const id = a.getAttribute("href")!.slice(1);
      expect(document.getElementById(id), `#${id}`).not.toBeNull();
      expect(document.getElementById(id)!.tagName).toBe("H2");
    }
  });
});

describe("Khách hàng", () => {
  it("thẻ KPI với so sánh kỳ trước; gọi API đúng khoảng ngày", async () => {
    const fn = stub();
    render(<AdminAnalytics />);
    const block = (await screen.findByRole("heading", { name: "Khách hàng" })).closest("section")!;
    await within(block).findByLabelText("Khách mua hàng");
    expect(callsTo(fn, "/analytics/customers")[0]).toContain("from=2026-10-22&to=2026-11-20");
    const buyers = within(block).getByLabelText("Khách mua hàng");
    expect(within(buyers).getByText("40")).toBeInTheDocument();
    expect(within(buyers).getByText(/▲ 25%/)).toBeInTheDocument();
    expect(within(buyers).getByText("Tăng 25%")).toBeInTheDocument();
    expect(within(block).getByLabelText("Khách mua lần đầu")).toHaveTextContent("25");
    expect(within(block).getByLabelText("Khách quay lại")).toHaveTextContent("15");
    const rate = within(block).getByLabelText("Tỷ lệ mua lại");
    expect(within(rate).getByText("17,5%")).toBeInTheDocument();
    expect(within(rate).getByText(/▲ 2,5 điểm %/)).toBeInTheDocument();
    const first = within(block).getByLabelText("Doanh thu khách mới");
    expect(within(first).getByText("9.000.000₫")).toBeInTheDocument();
    expect(within(first).getByText("Không có dữ liệu kỳ trước")).toBeInTheDocument();
    expect(within(block).getByLabelText("Doanh thu khách quay lại")).toHaveTextContent(
      "6.000.000₫",
    );
  });

  it("loading, rỗng, lỗi + thử lại riêng của khối", async () => {
    let n = 0;
    stub({
      customers: () =>
        ++n === 1
          ? errRes(500, "INTERNAL_ERROR")
          : jsonRes(200, {
              data: makeCustomers({
                buyers: zero,
                firstTime: zero,
                returning: zero,
                repeatRate: { current: 0, previous: 0, changePts: null },
              }),
            }),
    });
    render(<AdminAnalytics />);
    expect(screen.getByLabelText("Đang tải số liệu khách hàng")).toBeInTheDocument();
    expect(await screen.findByText("Không tải được số liệu khách hàng")).toBeInTheDocument();
    // Khối vận hành vẫn hiển thị
    expect(await screen.findByText("Đơn hủy theo loại")).toBeInTheDocument();
    await user().click(screen.getByRole("button", { name: /thử lại/i }));
    expect(
      await screen.findByText("Chưa có khách nào mua hàng trong khoảng thời gian này."),
    ).toBeInTheDocument();
  });
});

describe("Vận hành", () => {
  const section = async () =>
    (await screen.findByRole("heading", { name: "Vận hành" })).closest("section")!;

  it("đơn hủy theo loại: nhãn tiếng Việt, số, %, thanh CSS, tổng", async () => {
    stub();
    render(<AdminAnalytics />);
    const table = await screen.findByRole("table", {
      name: /Đơn tạo trong kỳ đang ở trạng thái đã hủy/,
    });
    for (const th of within(table).getAllByRole("columnheader")) {
      expect(th).toHaveAttribute("scope", "col");
    }
    const row = (label: string) =>
      within(table).getByRole("row", { name: new RegExp(`^${label}`) });
    expect(within(row("Khách hủy")).getByText("40%")).toBeInTheDocument();
    expect(within(row("Khách hủy")).getByText("4")).toBeInTheDocument();
    expect(row("Khách hủy").querySelector('[style*="width: 40%"]')).not.toBeNull();
    expect(within(row("Cửa hàng hủy")).getByText("30%")).toBeInTheDocument();
    expect(within(row("Hết hạn thanh toán")).getByText("20%")).toBeInTheDocument();
    expect(within(row("Không rõ")).getByText("10%")).toBeInTheDocument();
    const foot = within(table).getByRole("row", { name: /^Tổng/ });
    expect(within(foot).getByText("10")).toBeInTheDocument();
    expect(within(foot).getByText("100%")).toBeInTheDocument();
  });

  it("không có đơn hủy -> trạng thái rỗng", async () => {
    stub({
      operations: () =>
        jsonRes(200, {
          data: makeOperations({
            cancellations: {
              total: zero,
              byType: [
                { type: "customer", label: "Khách hủy", current: 0, previous: 0 },
                { type: "store", label: "Cửa hàng hủy", current: 0, previous: 0 },
                { type: "expired", label: "Hết hạn thanh toán", current: 0, previous: 0 },
                { type: "unknown", label: "Không rõ", current: 0, previous: 0 },
              ],
            },
          }),
        }),
    });
    render(<AdminAnalytics />);
    expect(
      await screen.findByText("Không có đơn hủy nào trong khoảng thời gian này."),
    ).toBeInTheDocument();
  });

  it("tỷ lệ trả hàng, hoàn tiền với so sánh kỳ trước", async () => {
    stub();
    render(<AdminAnalytics />);
    const s = await section();
    const rate = await within(s).findByLabelText("Tỷ lệ trả hàng");
    expect(within(rate).getByText("10%")).toBeInTheDocument();
    expect(within(rate).getByText("2 / 20 đơn đã giao")).toBeInTheDocument();
    expect(within(rate).getByText(/▲ 10 điểm %/)).toBeInTheDocument();
    expect(
      within(within(s).getByLabelText("Số lần hoàn tiền")).getByText(/▲ 200%/),
    ).toBeInTheDocument();
    expect(within(s).getByLabelText("Số tiền hoàn")).toHaveTextContent("450.000₫");
  });

  it("thời gian xử lý: giờ thập phân, ngày + giờ, null -> Chưa có dữ liệu", async () => {
    stub();
    render(<AdminAnalytics />);
    const s = await section();
    const confirm = await within(s).findByLabelText("Từ lúc đặt đến lúc xác nhận");
    expect(within(confirm).getByText("3,5 giờ")).toBeInTheDocument();
    expect(within(confirm).getByText("Trung vị 2 giờ · 12 đơn")).toBeInTheDocument();
    // previousAvg null
    expect(within(confirm).getByText(/Kỳ trước \(.*\): Chưa có dữ liệu/)).toBeInTheDocument();
    const delivery = within(s).getByLabelText("Từ lúc xác nhận đến lúc giao");
    expect(within(delivery).getByText("2 ngày 6 giờ")).toBeInTheDocument();
    expect(within(delivery).getByText("Trung vị 2 ngày · 8 đơn")).toBeInTheDocument();
    expect(within(delivery).getByText(/Kỳ trước \(.*\): 1 ngày 6,5 giờ/)).toBeInTheDocument();
  });

  it("n = 0: Chưa có dữ liệu cho giá trị chính", async () => {
    stub({
      operations: () =>
        jsonRes(200, {
          data: makeOperations({
            fulfillment: {
              confirmHours: { avg: null, median: null, n: 0, previousAvg: null },
              deliveryHours: { avg: null, median: null, n: 0, previousAvg: null },
            },
          }),
        }),
    });
    render(<AdminAnalytics />);
    const s = await section();
    const confirm = await within(s).findByLabelText("Từ lúc đặt đến lúc xác nhận");
    expect(within(confirm).getByText("Chưa có dữ liệu")).toBeInTheDocument();
    expect(within(confirm).getByText(/Kỳ trước \(.*\): Chưa có dữ liệu/)).toBeInTheDocument();
    expect(within(confirm).getByText("Chưa có đơn trong kỳ")).toBeInTheDocument();
  });

  it("cần xử lý ngay: link lọc đơn có sẵn + link tới từng đơn, ghi chú ảnh chụp hiện tại", async () => {
    stub();
    render(<AdminAnalytics />);
    const s = await section();
    const h = await within(s).findByRole("heading", { name: "Cần xử lý ngay" });
    expect(h).toBeInTheDocument();
    expect(within(s).getByText("Số liệu hiện tại, không theo khoảng ngày.")).toBeInTheDocument();
    expect(within(s).getByRole("link", { name: /Đơn chờ xác nhận quá 24 giờ/ })).toHaveAttribute(
      "href",
      "/admin/don-hang?status=PENDING&sort=oldest",
    );
    expect(within(s).getByRole("link", { name: /Đơn cần hoàn tiền/ })).toHaveAttribute(
      "href",
      "/admin/don-hang?needsRefund=true",
    );
    expect(within(s).getByRole("link", { name: /yêu cầu trả hàng/ })).toHaveAttribute(
      "href",
      "/admin/don-hang?status=RETURN_REQUESTED",
    );
    expect(within(s).getByRole("link", { name: /giao hàng thất bại/ })).toHaveAttribute(
      "href",
      "/admin/don-hang?status=FAILED_DELIVERY",
    );
    const table = within(s).getByRole("table", { name: /Đơn chờ xác nhận lâu nhất/ });
    expect(within(table).getByRole("link", { name: "BB-261101-AAAA" })).toHaveAttribute(
      "href",
      "/admin/don-hang/BB-261101-AAAA",
    );
    expect(within(table).getByText("2 ngày 2 giờ")).toBeInTheDocument(); // 50 giờ
    expect(within(table).getByText("1 ngày 2 giờ")).toBeInTheDocument(); // 26 giờ
    expect(within(table).getByText("320.000₫")).toBeInTheDocument();
  });

  it("không có đơn cần xử lý -> ghi chú rỗng, không có bảng", async () => {
    stub({
      operations: () =>
        jsonRes(200, {
          data: makeOperations({
            attention: {
              pendingOver24h: { count: 0, oldest: [] },
              needsRefund: 0,
              returnRequested: 0,
              failedDelivery: 0,
            },
          }),
        }),
    });
    render(<AdminAnalytics />);
    expect(await screen.findByText("Hiện không có đơn nào cần xử lý ngay.")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /Đơn chờ xác nhận lâu nhất/ })).toBeNull();
  });

  it("lỗi + thử lại riêng của khối vận hành", async () => {
    let n = 0;
    stub({
      operations: () =>
        ++n === 1 ? errRes(500, "INTERNAL_ERROR") : jsonRes(200, { data: makeOperations() }),
    });
    render(<AdminAnalytics />);
    expect(screen.getByLabelText("Đang tải số liệu vận hành")).toBeInTheDocument();
    expect(await screen.findByText("Không tải được số liệu vận hành")).toBeInTheDocument();
    await user().click(screen.getByRole("button", { name: /thử lại/i }));
    expect(await screen.findByText("Đơn hủy theo loại")).toBeInTheDocument();
  });
});

describe("Tồn kho", () => {
  const section = async () =>
    (await screen.findByRole("heading", { name: "Tồn kho" })).closest("section")!;

  it("ghi rõ số liệu hiện tại; thẻ tóm tắt; mặc định tab Hết hàng, gọi slowDays=30", async () => {
    const fn = stub();
    render(<AdminAnalytics />);
    const s = await section();
    expect(within(s).getByText("Số liệu hiện tại, không theo khoảng ngày.")).toBeInTheDocument();
    await within(s).findByLabelText("Giá trị tồn kho");
    expect(callsTo(fn, "/analytics/inventory")[0]).toContain("slowDays=30");
    expect(within(s).getByLabelText("Giá trị tồn kho")).toHaveTextContent("38.000.000₫");
    expect(within(s).getByLabelText("Tổng số lượng tồn")).toHaveTextContent("400");
    expect(within(s).getByLabelText("Bán chậm (30 ngày)")).toHaveTextContent("1 biến thể");
    expect(within(s).getByLabelText("Bán chậm (30 ngày)")).toHaveTextContent("2.000.000₫");
    expect(within(s).getByRole("button", { name: "Hết hàng (2)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const table = within(s).getByRole("table", { name: /Biến thể hết hàng/ });
    expect(within(table).getByRole("link", { name: "Sản phẩm het1" })).toHaveAttribute(
      "href",
      "/admin/san-pham/p-het1",
    );
    for (const th of within(table).getAllByRole("columnheader")) {
      expect(th).toHaveAttribute("scope", "col");
    }
  });

  it("đổi tab Sắp hết / Bán chậm: bảng, 'Chưa từng bán', ngày bán gần nhất", async () => {
    stub({
      inventory: () =>
        jsonRes(200, {
          data: makeInventory({
            slowMovers: [
              invItem("cham1", {
                stock: 20,
                stockValue: 2000000,
                lastSoldAt: "2026-08-01T05:00:00.000Z",
              }),
              invItem("cham2", { stock: 5, stockValue: 500000 }),
            ],
          }),
        }),
    });
    render(<AdminAnalytics />);
    const s = await section();
    await within(s).findByLabelText("Giá trị tồn kho");
    await user().click(within(s).getByRole("button", { name: "Sắp hết (1)" }));
    expect(within(s).getByRole("button", { name: "Sắp hết (1)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(s).getByRole("button", { name: "Hết hàng (2)" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(s).getByRole("table", { name: /Biến thể sắp hết hàng/ })).toBeInTheDocument();
    await user().click(within(s).getByRole("button", { name: "Bán chậm (1)" }));
    const slow = within(s).getByRole("table", { name: /không bán được trong 30 ngày/ });
    const row1 = within(slow).getByRole("row", { name: /Sản phẩm cham1/ });
    expect(within(row1).getByText("01/08/2026")).toBeInTheDocument();
    expect(within(row1).getByText("2.000.000₫")).toBeInTheDocument();
    expect(
      within(within(slow).getByRole("row", { name: /Sản phẩm cham2/ })).getByText("Chưa từng bán"),
    ).toBeInTheDocument();
  });

  it("chọn slowDays 60/90 gọi lại API và giữ tab Bán chậm", async () => {
    const fn = stub({
      inventory: (url) =>
        jsonRes(200, {
          data: makeInventory({
            slowDays: Number(new URL(url, "http://x").searchParams.get("slowDays")),
          }),
        }),
    });
    render(<AdminAnalytics />);
    const s = await section();
    await within(s).findByLabelText("Giá trị tồn kho");
    await user().click(within(s).getByRole("button", { name: "Bán chậm (1)" }));
    const group = within(s).getByRole("group", { name: "Số ngày không bán" });
    expect(within(group).getByRole("button", { name: "30 ngày" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user().click(within(group).getByRole("button", { name: "60 ngày" }));
    await within(s).findByLabelText("Bán chậm (60 ngày)");
    expect(callsTo(fn, "/analytics/inventory").at(-1)).toContain("slowDays=60");
    expect(
      within(within(s).getByRole("group", { name: "Số ngày không bán" })).getByRole("button", {
        name: "60 ngày",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(within(s).getByRole("button", { name: "Bán chậm (1)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user().click(within(s).getByRole("button", { name: "90 ngày" }));
    await within(s).findByLabelText("Bán chậm (90 ngày)");
    expect(callsTo(fn, "/analytics/inventory").at(-1)).toContain("slowDays=90");
  });

  it("danh sách rỗng theo tab; 'Hiển thị x trên y' khi vượt giới hạn", async () => {
    stub({
      inventory: () =>
        jsonRes(200, {
          data: makeInventory({
            summary: { ...makeInventory().summary, outOfStock: 45, lowStock: 0 },
            lowStock: [],
          }),
        }),
    });
    render(<AdminAnalytics />);
    const s = await section();
    expect(await within(s).findByText("Hiển thị 2 trên 45 biến thể.")).toBeInTheDocument();
    await user().click(within(s).getByRole("button", { name: "Sắp hết (0)" }));
    expect(within(s).getByText("Không có biến thể nào sắp hết hàng.")).toBeInTheDocument();
  });

  it("lỗi + thử lại riêng của khối tồn kho", async () => {
    let n = 0;
    stub({
      inventory: () =>
        ++n === 1 ? errRes(500, "INTERNAL_ERROR") : jsonRes(200, { data: makeInventory() }),
    });
    render(<AdminAnalytics />);
    expect(screen.getByLabelText("Đang tải số liệu tồn kho")).toBeInTheDocument();
    expect(await screen.findByText("Không tải được số liệu tồn kho")).toBeInTheDocument();
    await user().click(screen.getByRole("button", { name: /thử lại/i }));
    expect(await screen.findByLabelText("Giá trị tồn kho")).toBeInTheDocument();
  });
});

describe("Làm mới và quyền", () => {
  it("nút Làm mới tải lại cả ba khối mới", async () => {
    const fn = stub();
    render(<AdminAnalytics />);
    await screen.findByLabelText("Giá trị tồn kho");
    await screen.findByLabelText("Khách mua hàng");
    await screen.findByLabelText("Tỷ lệ trả hàng");
    await user().click(screen.getByRole("button", { name: "Làm mới" }));
    await vi.waitFor(() => {
      expect(callsTo(fn, "/analytics/customers")).toHaveLength(2);
      expect(callsTo(fn, "/analytics/operations")).toHaveLength(2);
      expect(callsTo(fn, "/analytics/inventory")).toHaveLength(2);
    });
  });

  it("STAFF: Forbidden, không gọi API nào", () => {
    role = "STAFF";
    const fn = stub();
    render(<AdminAnalytics />);
    expect(screen.getByRole("alert")).toHaveTextContent(/không đủ quyền/i);
    expect(fn).not.toHaveBeenCalled();
  });
});
