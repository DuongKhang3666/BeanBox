import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import type {
  AnalyticsBreakdown,
  AnalyticsTopCustomers,
  AnalyticsTopProducts,
  BreakdownDimension,
} from "@/types/admin";
import { step3Response } from "../analyticsTesting";
import { AdminAnalytics } from "./AdminAnalytics";

let role: "ADMIN" | "STAFF" = "ADMIN";
let search = "";
const replace = vi.fn();
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ role }) }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/admin/phan-tich",
}));

const NOW = new Date("2026-11-20T05:00:00Z");
const RANGE = { from: "2026-10-22", to: "2026-11-20", days: 30, timezone: "Asia/Ho_Chi_Minh" };

function makeBreakdown(over: Partial<AnalyticsBreakdown> = {}): AnalyticsBreakdown {
  return {
    range: RANGE,
    previousRange: { from: "2026-09-22", to: "2026-10-21" },
    dimension: "category",
    basis: "item",
    total: { revenue: 1000000, orders: 6, quantity: 11 },
    previousTotal: { revenue: 800000, orders: 5, quantity: 9 },
    groups: [
      {
        key: "c1",
        label: "Máy pha cà phê",
        revenue: 600000,
        orders: 4,
        quantity: 6,
        share: 0.6,
        previousRevenue: 400000,
        changePct: 50,
      },
      {
        key: "c2",
        label: "Hạt cà phê",
        revenue: 400000,
        orders: 3,
        quantity: 5,
        share: 0.4,
        previousRevenue: 0,
        changePct: null,
      },
    ],
    generatedAt: "2026-11-20T05:00:00.000Z",
    ...over,
  };
}

const orderBreakdown = (): AnalyticsBreakdown =>
  makeBreakdown({
    dimension: "paymentMethod",
    basis: "order",
    total: { revenue: 1000000, orders: 6, quantity: null },
    previousTotal: { revenue: 800000, orders: 5, quantity: null },
    groups: [
      {
        key: "COD",
        label: "Thanh toán khi nhận hàng (COD)",
        revenue: 700000,
        orders: 4,
        quantity: null,
        share: 0.7,
        previousRevenue: 800000,
        changePct: -12.5,
      },
      {
        key: "VNPAY",
        label: "VNPay (ATM/QR/thẻ)",
        revenue: 300000,
        orders: 2,
        quantity: null,
        share: 0.3,
        previousRevenue: 0,
        changePct: null,
      },
    ],
  });

const products = (over: Partial<AnalyticsTopProducts> = {}): AnalyticsTopProducts => ({
  range: RANGE,
  sort: "revenue",
  limit: 10,
  items: [
    {
      productId: "p1",
      name: "Phin nhôm số 1",
      slug: "phin-nhom",
      deleted: false,
      categoryName: "Phin",
      revenue: 900000,
      quantity: 12,
      orders: 5,
    },
    {
      productId: "p2",
      name: "Bình giữ nhiệt cũ",
      slug: null,
      deleted: true,
      categoryName: null,
      revenue: 100000,
      quantity: 2,
      orders: 1,
    },
  ],
  generatedAt: "2026-11-20T05:00:00.000Z",
  ...over,
});

const LONG_EMAIL = "khach.hang.co.email.rat.dai.khong.khoang.trang@mien-rat-dai-example.test";
const customers = (over: Partial<AnalyticsTopCustomers> = {}): AnalyticsTopCustomers => ({
  range: RANGE,
  sort: "revenue",
  limit: 10,
  items: [
    {
      customerType: "registered",
      userId: "u1",
      name: "Nguyễn Văn An",
      email: "an@example.com",
      orders: 3,
      revenue: 1200000,
      aov: 400000,
      lastPaidAt: "2026-11-18T05:00:00.000Z",
    },
    {
      customerType: "guest",
      userId: null,
      name: "Trần Thị Bình",
      email: LONG_EMAIL,
      orders: 1,
      revenue: 300000,
      aov: 300000,
      lastPaidAt: null,
    },
  ],
  generatedAt: "2026-11-20T05:00:00.000Z",
  ...over,
});

interface Handlers {
  overview?: () => Response;
  breakdown?: (url: string) => Response;
  products?: (url: string) => Response;
  customers?: (url: string) => Response;
}

const zero = { current: 0, previous: 0, changePct: null };
const overviewBody = {
  range: { ...RANGE, granularity: "day", timezone: "Asia/Ho_Chi_Minh" },
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
};

function stub(h: Handlers = {}) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/analytics/breakdown")) {
      return h.breakdown ? h.breakdown(url) : jsonRes(200, { data: makeBreakdown() });
    }
    if (url.includes("/analytics/top-products")) {
      return h.products ? h.products(url) : jsonRes(200, { data: products() });
    }
    if (url.includes("/analytics/top-customers")) {
      return h.customers ? h.customers(url) : jsonRes(200, { data: customers() });
    }
    const s3 = step3Response(url);
    if (s3) return s3;
    return h.overview ? h.overview() : jsonRes(200, { data: overviewBody });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const callsTo = (fn: ReturnType<typeof stub>, part: string) =>
  fn.mock.calls.map((c) => String(c[0])).filter((u) => u.includes(part));

beforeEach(() => {
  tokenStore.clear();
  role = "ADMIN";
  search = "";
  replace.mockReset();
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

describe("Cơ cấu doanh thu", () => {
  it("mặc định chiều Danh mục: gọi API đúng, bảng có caption, th scope, thanh tỷ trọng kèm chữ số", async () => {
    const fn = stub();
    render(<AdminAnalytics />);
    const table = await screen.findByRole("table", { name: /Doanh thu theo danh mục/ });
    expect(callsTo(fn, "/analytics/breakdown")[0]).toContain(
      "dimension=category&from=2026-10-22&to=2026-11-20",
    );
    expect(within(table).getByText(/2 nhóm/)).toBeInTheDocument();
    for (const th of within(table).getAllByRole("columnheader")) {
      expect(th).toHaveAttribute("scope", "col");
    }
    const row = within(table).getByRole("row", { name: /Máy pha cà phê/ });
    expect(within(row).getByRole("rowheader")).toHaveTextContent("Máy pha cà phê");
    expect(within(row).getByText("600.000₫")).toBeInTheDocument();
    expect(within(row).getByText("60%")).toBeInTheDocument();
    expect(within(row).getByText(/▲ 50%/)).toBeInTheDocument();
    expect(within(row).getByText("Tăng 50%")).toBeInTheDocument();
    expect(row.querySelector('[style*="width: 60%"]')).not.toBeNull();
    // Chiều dòng hàng có cột số lượng
    expect(within(table).getByRole("columnheader", { name: "Số lượng" })).toBeInTheDocument();
    expect(within(row).getByText("6")).toBeInTheDocument();
    // Kỳ trước = 0 -> chữ, không phải mũi tên
    expect(
      within(within(table).getByRole("row", { name: /Hạt cà phê/ })).getByText(
        "Không có dữ liệu kỳ trước",
      ),
    ).toBeInTheDocument();
    // Dòng tổng
    const foot = within(table).getByRole("row", { name: /^Tổng/ });
    expect(within(foot).getByText("1.000.000₫")).toBeInTheDocument();
    expect(within(foot).getByText("100%")).toBeInTheDocument();
  });

  it("ghi chú chiều dòng hàng: doanh thu hàng hóa và phân loại hiện tại", async () => {
    stub();
    render(<AdminAnalytics />);
    await screen.findByRole("table", { name: /Doanh thu theo danh mục/ });
    expect(
      screen.getByText(/Doanh thu hàng hóa, chưa trừ giảm giá cấp đơn và phí vận chuyển/),
    ).toBeInTheDocument();
    expect(screen.getByText(/một đơn có thể thuộc nhiều nhóm/)).toBeInTheDocument();
    expect(screen.getByText(/danh mục hiện tại của sản phẩm/)).toBeInTheDocument();
  });

  it("nút chiều: mặc định Danh mục aria-pressed; bấm Thanh toán cập nhật URL dim=paymentMethod", async () => {
    stub();
    render(<AdminAnalytics />);
    await screen.findByRole("table", { name: /Doanh thu theo danh mục/ });
    const group = screen.getByRole("group", { name: "Chiều phân tích" });
    expect(within(group).getByRole("button", { name: "Danh mục" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user().click(within(group).getByRole("button", { name: "Thanh toán" }));
    expect(replace).toHaveBeenCalledWith(
      "/admin/phan-tich?from=2026-10-22&to=2026-11-20&dim=paymentMethod",
    );
  });

  it("URL có dim=paymentMethod: gọi API, không có cột số lượng, ghi chú chiều cấp đơn, không ghi chú phân loại", async () => {
    search = "dim=paymentMethod";
    const fn = stub({ breakdown: () => jsonRes(200, { data: orderBreakdown() }) });
    render(<AdminAnalytics />);
    const table = await screen.findByRole("table", { name: /Doanh thu theo thanh toán/ });
    expect(callsTo(fn, "/analytics/breakdown")[0]).toContain("dimension=paymentMethod");
    expect(screen.getByRole("button", { name: "Thanh toán" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(table).queryByRole("columnheader", { name: "Số lượng" })).toBeNull();
    expect(within(table).getByText("Thanh toán khi nhận hàng (COD)")).toBeInTheDocument();
    expect(within(table).getByText(/▼ 12,5%/)).toBeInTheDocument();
    expect(within(table).getByText("Giảm 12,5%")).toBeInTheDocument();
    expect(screen.queryByText(/Doanh thu hàng hóa, chưa trừ giảm giá/)).toBeNull();
    expect(screen.getByText(/bằng doanh thu ở phần tổng quan/)).toBeInTheDocument();
  });

  it("dim sai trong URL -> mặc định Danh mục; đổi khoảng ngày giữ dim hợp lệ", async () => {
    search = "dim=hack";
    stub();
    const { unmount } = render(<AdminAnalytics />);
    await screen.findByRole("table", { name: /Doanh thu theo danh mục/ });
    expect(screen.getByRole("button", { name: "Danh mục" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user().click(screen.getByRole("button", { name: "7 ngày" }));
    expect(replace).toHaveBeenLastCalledWith("/admin/phan-tich?from=2026-11-14&to=2026-11-20");
    unmount();

    search = "dim=brand";
    stub();
    render(<AdminAnalytics />);
    await screen.findByRole("table", { name: /Doanh thu theo thương hiệu/ });
    await user().click(screen.getByRole("button", { name: "7 ngày" }));
    expect(replace).toHaveBeenLastCalledWith(
      "/admin/phan-tich?from=2026-11-14&to=2026-11-20&dim=brand",
    );
  });

  it.each<[BreakdownDimension, string]>([
    ["brand", "Thương hiệu"],
    ["shippingMethod", "Giao hàng"],
    ["province", "Tỉnh/thành"],
  ])("chiều %s có nút %s", async (dim, label) => {
    search = `dim=${dim}`;
    const fn = stub();
    render(<AdminAnalytics />);
    await screen.findByRole("table", { name: new RegExp(label.toLowerCase()) });
    expect(callsTo(fn, "/analytics/breakdown")[0]).toContain(`dimension=${dim}`);
    expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
  });

  it("nhóm 'Khác' có chú thích", async () => {
    stub({
      breakdown: () =>
        jsonRes(200, {
          data: makeBreakdown({
            groups: [
              {
                key: "__other__",
                label: "Khác",
                revenue: 1000000,
                orders: 6,
                quantity: 11,
                share: 1,
                previousRevenue: 0,
                changePct: null,
              },
            ],
          }),
        }),
    });
    render(<AdminAnalytics />);
    expect(await screen.findByText(/gộp các nhóm nhỏ còn lại/)).toBeInTheDocument();
  });

  it("loading, rỗng, lỗi + thử lại là của riêng khối này", async () => {
    let n = 0;
    stub({
      breakdown: () =>
        ++n === 1
          ? errRes(500, "INTERNAL_ERROR")
          : jsonRes(200, { data: makeBreakdown({ groups: [] }) }),
    });
    render(<AdminAnalytics />);
    expect(screen.getByLabelText("Đang tải cơ cấu doanh thu")).toBeInTheDocument();
    expect(await screen.findByText("Không tải được cơ cấu doanh thu")).toBeInTheDocument();
    // Các khối khác vẫn hiển thị bình thường
    expect(await screen.findByRole("table", { name: /Top 2 sản phẩm/ })).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: /Top 2 khách hàng/ })).toBeInTheDocument();
    await user().click(screen.getByRole("button", { name: /thử lại/i }));
    expect(
      await screen.findByText("Chưa có doanh thu nào trong khoảng thời gian này."),
    ).toBeInTheDocument();
  });
});

describe("Top sản phẩm", () => {
  it("bảng, link tới sản phẩm; sản phẩm đã xóa có nhãn và không có link", async () => {
    const fn = stub();
    render(<AdminAnalytics />);
    const table = await screen.findByRole("table", { name: /Top 2 sản phẩm theo doanh thu/ });
    expect(callsTo(fn, "/analytics/top-products")[0]).toContain(
      "from=2026-10-22&to=2026-11-20&sort=revenue&limit=10",
    );
    const link = within(table).getByRole("link", { name: "Phin nhôm số 1" });
    expect(link).toHaveAttribute("href", "/admin/san-pham/p1");
    expect(within(table).getByText("900.000₫")).toBeInTheDocument();
    expect(within(table).queryByRole("link", { name: "Bình giữ nhiệt cũ" })).toBeNull();
    const row = within(table).getByRole("row", { name: /Bình giữ nhiệt cũ/ });
    expect(within(row).getByText("Đã xóa")).toBeInTheDocument();
    for (const th of within(table).getAllByRole("columnheader")) {
      expect(th).toHaveAttribute("scope", "col");
    }
  });

  it("đổi sắp xếp sang số lượng gọi lại với sort=quantity", async () => {
    const fn = stub({
      products: (url) =>
        jsonRes(200, {
          data: products({ sort: url.includes("sort=quantity") ? "quantity" : "revenue" }),
        }),
    });
    render(<AdminAnalytics />);
    await screen.findByRole("table", { name: /Top 2 sản phẩm theo doanh thu/ });
    const group = screen.getByRole("group", { name: "Sắp xếp top sản phẩm" });
    expect(within(group).getByRole("button", { name: "Theo doanh thu" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user().click(within(group).getByRole("button", { name: "Theo số lượng" }));
    expect(await screen.findByRole("table", { name: /theo số lượng bán/ })).toBeInTheDocument();
    expect(callsTo(fn, "/analytics/top-products").at(-1)).toContain("sort=quantity");
    expect(replace).not.toHaveBeenCalled();
  });

  it("rỗng và lỗi có thử lại, không ảnh hưởng khối khác", async () => {
    let fail = true;
    stub({
      products: () =>
        fail ? errRes(500, "INTERNAL_ERROR") : jsonRes(200, { data: products({ items: [] }) }),
    });
    render(<AdminAnalytics />);
    expect(await screen.findByText("Không tải được top sản phẩm")).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: /Top 2 khách hàng/ })).toBeInTheDocument();
    expect(
      await screen.findByRole("table", { name: /Doanh thu theo danh mục/ }),
    ).toBeInTheDocument();
    fail = false;
    await user().click(screen.getByRole("button", { name: /thử lại/i }));
    expect(
      await screen.findByText("Chưa có sản phẩm nào được bán trong khoảng thời gian này."),
    ).toBeInTheDocument();
  });

  it("skeleton khi đang tải", () => {
    stub({ products: () => new Promise<Response>(() => {}) as unknown as Response });
    render(<AdminAnalytics />);
    expect(screen.getByLabelText("Đang tải top sản phẩm")).toBeInTheDocument();
  });
});

describe("Top khách hàng", () => {
  it("khách có tài khoản có link, khách vãng lai có nhãn và email dài được phép ngắt dòng", async () => {
    const fn = stub();
    render(<AdminAnalytics />);
    const table = await screen.findByRole("table", { name: /Top 2 khách hàng theo doanh thu/ });
    expect(callsTo(fn, "/analytics/top-customers")[0]).toContain("sort=revenue&limit=10");
    expect(within(table).getByRole("link", { name: "Nguyễn Văn An" })).toHaveAttribute(
      "href",
      "/admin/nguoi-dung/u1",
    );
    const guest = within(table).getByRole("row", { name: /Trần Thị Bình/ });
    expect(within(guest).queryByRole("link")).toBeNull();
    expect(within(guest).getByText("Vãng lai")).toBeInTheDocument();
    expect(within(guest).getByText(LONG_EMAIL)).toHaveClass("break-all");
    expect(within(guest).getByText("—")).toBeInTheDocument(); // chưa có lần mua
    const reg = within(table).getByRole("row", { name: /Nguyễn Văn An/ });
    expect(within(reg).queryByText("Vãng lai")).toBeNull();
    expect(within(reg).getByText("1.200.000₫")).toBeInTheDocument();
    expect(within(reg).getByText("400.000₫")).toBeInTheDocument();
    expect(within(reg).getByText("18/11/2026")).toBeInTheDocument();
    expect(screen.getByText(/hai dòng/)).toBeInTheDocument();
  });

  it("đổi sắp xếp sang số đơn gọi lại với sort=orders", async () => {
    const fn = stub({
      customers: (url) =>
        jsonRes(200, {
          data: customers({ sort: url.includes("sort=orders") ? "orders" : "revenue" }),
        }),
    });
    render(<AdminAnalytics />);
    await screen.findByRole("table", { name: /Top 2 khách hàng theo doanh thu/ });
    await user().click(screen.getByRole("button", { name: "Theo số đơn" }));
    expect(await screen.findByRole("table", { name: /theo số đơn/ })).toBeInTheDocument();
    expect(callsTo(fn, "/analytics/top-customers").at(-1)).toContain("sort=orders");
  });

  it("rỗng và lỗi riêng", async () => {
    let fail = true;
    stub({
      customers: () =>
        fail ? errRes(500, "INTERNAL_ERROR") : jsonRes(200, { data: customers({ items: [] }) }),
    });
    render(<AdminAnalytics />);
    expect(await screen.findByText("Không tải được top khách hàng")).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: /Top 2 sản phẩm/ })).toBeInTheDocument();
    fail = false;
    await user().click(screen.getByRole("button", { name: /thử lại/i }));
    expect(
      await screen.findByText("Chưa có khách hàng nào mua trong khoảng thời gian này."),
    ).toBeInTheDocument();
  });

  it("skeleton khi đang tải", () => {
    stub({ customers: () => new Promise<Response>(() => {}) as unknown as Response });
    render(<AdminAnalytics />);
    expect(screen.getByLabelText("Đang tải top khách hàng")).toBeInTheDocument();
  });
});

describe("quyền", () => {
  it("STAFF vẫn thấy Forbidden và không gọi bất kỳ API nào (kể cả 3 khối mới)", () => {
    role = "STAFF";
    const fn = stub();
    render(<AdminAnalytics />);
    expect(screen.getByRole("alert")).toHaveTextContent(/không đủ quyền/i);
    expect(screen.queryByText("Cơ cấu doanh thu")).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });
});
