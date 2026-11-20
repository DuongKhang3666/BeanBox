import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import type { AnalyticsOverview, AnalyticsPoint } from "@/types/admin";
import { AdminAnalytics } from "./AdminAnalytics";
import { ADMIN_NAV, AdminNav } from "./AdminNav";

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

const NOW = new Date("2026-11-20T05:00:00Z"); // 12:00 ngày 20/11 giờ VN

function point(start: string, revenue = 0, paid = 0, placed = 0, end = start): AnalyticsPoint {
  return { start, end, revenue, paidOrders: paid, ordersPlaced: placed };
}

function days(from: string, n: number, revenueAt: Record<number, number> = {}): AnalyticsPoint[] {
  const base = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base + i * 86400000).toISOString().slice(0, 10);
    return point(d, revenueAt[i] ?? 0, revenueAt[i] ? 1 : 0, revenueAt[i] ? 1 : 0);
  });
}

function makeOverview(over: Partial<AnalyticsOverview> = {}): AnalyticsOverview {
  const c = (current: number, previous: number, changePct: number | null) => ({
    current,
    previous,
    changePct,
  });
  return {
    range: {
      from: "2026-10-22",
      to: "2026-11-20",
      days: 30,
      granularity: "day",
      timezone: "Asia/Ho_Chi_Minh",
    },
    previousRange: { from: "2026-09-22", to: "2026-10-21" },
    kpis: {
      revenue: c(5000000, 4444444, 12.5),
      paidOrders: c(10, 8, 25),
      aov: c(500000, 555555, -10),
      ordersPlaced: c(14, 14, 0),
      cancelledOrders: c(2, 1, 100),
      cancelRate: { current: 0.1429, previous: 0.0714, changePts: 7.1 },
      discountTotal: c(150000, 0, null),
      refundedAmount: c(40000, 0, null),
      newCustomers: c(3, 2, 50),
    },
    series: days("2026-10-22", 30, { 29: 5000000, 10: 1000000 }),
    previousSeries: days("2026-09-22", 30, { 5: 4444444 }),
    generatedAt: "2026-11-20T05:00:00.000Z",
    ...over,
  };
}

/** Các khối Bước 2 (cơ cấu, top) trả dữ liệu rỗng; chúng có test riêng ở AnalyticsBreakdown.test.tsx. */
function stub(handler: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/analytics/breakdown")) {
      return jsonRes(200, {
        data: {
          range: { from: "2026-10-22", to: "2026-11-20", days: 30, timezone: "Asia/Ho_Chi_Minh" },
          previousRange: { from: "2026-09-22", to: "2026-10-21" },
          groups: [],
          total: { revenue: 0, orders: 0, quantity: null },
          basis: "order",
        },
      });
    }
    if (url.includes("/analytics/top-")) return jsonRes(200, { data: { items: [] } });
    return handler(url);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const overviewCalls = (fn: ReturnType<typeof stub>) =>
  fn.mock.calls.filter((c) => String(c[0]).includes("/analytics/overview"));

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

describe("điều hướng", () => {
  it("ADMIN_NAV có Phân tích adminOnly ngay sau Tổng quan; STAFF không thấy", () => {
    expect(ADMIN_NAV[0]).toMatchObject({ href: "/admin", label: "Tổng quan" });
    expect(ADMIN_NAV[1]).toMatchObject({
      href: "/admin/phan-tich",
      label: "Phân tích",
      adminOnly: true,
    });
    role = "STAFF";
    const { unmount } = render(<AdminNav />);
    expect(screen.queryByRole("link", { name: "Phân tích" })).not.toBeInTheDocument();
    unmount();
    role = "ADMIN";
    render(<AdminNav />);
    expect(screen.getByRole("link", { name: "Phân tích" })).toHaveAttribute(
      "href",
      "/admin/phan-tich",
    );
  });
});

describe("AdminAnalytics - quyền", () => {
  it("STAFF thấy thông báo không đủ quyền và không gọi API", () => {
    role = "STAFF";
    const fetchFn = stub(() => jsonRes(200, { data: makeOverview() }));
    render(<AdminAnalytics />);
    expect(screen.getByRole("alert")).toHaveTextContent(/không đủ quyền/i);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("API trả 403 -> cũng hiện thông báo không đủ quyền", async () => {
    stub(() => errRes(403, "FORBIDDEN"));
    render(<AdminAnalytics />);
    expect(await screen.findByText(/không đủ quyền xem phân tích/i)).toBeInTheDocument();
  });
});

describe("AdminAnalytics - trạng thái", () => {
  it("skeleton khi tải, rồi 9 thẻ KPI với số liệu và so sánh kỳ trước", async () => {
    const fetchFn = stub(() => jsonRes(200, { data: makeOverview() }));
    render(<AdminAnalytics />);
    expect(screen.getByLabelText("Đang tải phân tích")).toBeInTheDocument();
    const revenue = await screen.findByRole("region", { name: "Doanh thu" });
    expect(within(revenue).getByText("5.000.000₫")).toBeInTheDocument();
    expect(within(revenue).getByText(/▲ 12,5%/)).toBeInTheDocument();
    expect(within(revenue).getByText("Tăng 12,5%")).toBeInTheDocument(); // cho trình đọc màn hình
    expect(within(revenue).getByText(/so với kỳ trước \(22\/09–21\/10\)/)).toBeInTheDocument();
    expect(overviewCalls(fetchFn)[0]![0]).toContain(
      "/admin/analytics/overview?from=2026-10-22&to=2026-11-20&granularity=day",
    );

    for (const name of [
      "Đơn đã thanh toán",
      "Giá trị đơn trung bình",
      "Đơn đã đặt",
      "Đơn hủy",
      "Tỷ lệ hủy",
      "Giảm giá",
      "Hoàn tiền",
      "Khách mới",
    ]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    const rate = screen.getByRole("region", { name: "Tỷ lệ hủy" });
    expect(within(rate).getByText("14,3%")).toBeInTheDocument();
    expect(within(rate).getByText(/▲ 7,1 điểm %/)).toBeInTheDocument();
    const aov = screen.getByRole("region", { name: "Giá trị đơn trung bình" });
    expect(within(aov).getByText("Giảm 10%")).toBeInTheDocument();
    const same = screen.getByRole("region", { name: "Đơn đã đặt" });
    expect(within(same).getByText("Không đổi")).toBeInTheDocument();
  });

  it("changePct null -> 'Không có dữ liệu kỳ trước'", async () => {
    stub(() => jsonRes(200, { data: makeOverview() }));
    render(<AdminAnalytics />);
    const discount = await screen.findByRole("region", { name: "Giảm giá" });
    expect(within(discount).getByText("Không có dữ liệu kỳ trước")).toBeInTheDocument();
  });

  it("tăng ở chỉ số xấu (tỷ lệ hủy, hoàn tiền) tô màu cảnh báo nhưng vẫn có mũi tên và chữ", async () => {
    stub(() =>
      jsonRes(200, {
        data: makeOverview({
          kpis: {
            ...makeOverview().kpis,
            refundedAmount: { current: 90000, previous: 40000, changePct: 125 },
          },
        }),
      }),
    );
    render(<AdminAnalytics />);
    const refund = await screen.findByRole("region", { name: "Hoàn tiền" });
    const arrow = within(refund).getByText(/▲ 125%/);
    expect(arrow.parentElement).toHaveClass("text-danger-600");
    const good = screen.getByRole("region", { name: "Doanh thu" });
    expect(within(good).getByText(/▲ 12,5%/).parentElement).toHaveClass("text-moss-800");
  });

  it("lỗi -> ErrorState có thử lại", async () => {
    let fail = true;
    const fetchFn = stub(() =>
      fail ? errRes(500, "INTERNAL_ERROR") : jsonRes(200, { data: makeOverview() }),
    );
    render(<AdminAnalytics />);
    expect(await screen.findByText("Không tải được số liệu phân tích")).toBeInTheDocument();
    fail = false;
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(screen.getByRole("button", { name: /thử lại/i }));
    expect(await screen.findByRole("region", { name: "Doanh thu" })).toBeInTheDocument();
    expect(overviewCalls(fetchFn)).toHaveLength(2);
  });

  it("kỳ không có dữ liệu: vẫn hiện 0 và ghi chú", async () => {
    const zero = { current: 0, previous: 0, changePct: null };
    stub(() =>
      jsonRes(200, {
        data: makeOverview({
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
          series: days("2026-10-22", 30),
          previousSeries: days("2026-09-22", 30),
        }),
      }),
    );
    render(<AdminAnalytics />);
    expect(
      await screen.findByText(/Chưa có đơn hàng nào trong khoảng thời gian này/),
    ).toBeInTheDocument();
    const revenue = screen.getByRole("region", { name: "Doanh thu" });
    expect(within(revenue).getByText("0₫")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Tỷ lệ hủy" })).getByText("0%"),
    ).toBeInTheDocument();
  });
});

describe("AdminAnalytics - biểu đồ và bảng thay thế", () => {
  it("biểu đồ có role img + aria-label tóm tắt; bảng đủ số bucket, có caption và th scope", async () => {
    stub(() => jsonRes(200, { data: makeOverview() }));
    render(<AdminAnalytics />);
    const img = await screen.findByRole("img", { name: /Doanh thu theo ngày, 22\/10–20\/11/ });
    expect(img).toHaveAccessibleName(/tổng 5\.000\.000₫ từ 10 đơn đã thanh toán/);
    const summary = screen.getByText("Xem dạng bảng");
    expect(summary.tagName).toBe("SUMMARY");
    const table = screen.getByRole("table", { hidden: true });
    expect(within(table).getByText(/30 dòng/)).toBeInTheDocument();
    const rows = within(table).getAllByRole("row", { hidden: true });
    expect(rows).toHaveLength(31); // 1 hàng tiêu đề + 30 bucket
    for (const th of within(table).getAllByRole("columnheader", { hidden: true })) {
      expect(th).toHaveAttribute("scope", "col");
    }
    expect(within(table).getAllByRole("rowheader", { hidden: true })).toHaveLength(30);
  });

  it("bảng theo tuần dùng nhãn khoảng ngày và số bucket của series", async () => {
    stub(() =>
      jsonRes(200, {
        data: makeOverview({
          range: {
            from: "2026-10-22",
            to: "2026-11-20",
            days: 30,
            granularity: "week",
            timezone: "Asia/Ho_Chi_Minh",
          },
          series: [
            point("2026-10-22", 100, 1, 1, "2026-10-25"),
            point("2026-10-26", 0, 0, 0, "2026-11-01"),
            point("2026-11-02", 300, 2, 3, "2026-11-08"),
          ],
          previousSeries: [point("2026-09-22", 50, 1, 1, "2026-09-27")],
        }),
      }),
    );
    render(<AdminAnalytics />);
    const table = await screen.findByRole("table", { hidden: true });
    expect(within(table).getAllByRole("rowheader", { hidden: true })).toHaveLength(3);
    expect(within(table).getByText("22/10–25/10")).toBeInTheDocument();
    expect(within(table).getByText("02/11–08/11")).toBeInTheDocument();
    expect(within(table).getAllByText("—")).toHaveLength(2); // kỳ trước ngắn hơn
  });

  it("phím mũi tên đổi cột đang xem và hiện chi tiết", async () => {
    stub(() => jsonRes(200, { data: makeOverview() }));
    render(<AdminAnalytics />);
    await screen.findByRole("img", { name: /Doanh thu theo ngày/ });
    const group = screen.getByRole("group", { name: /Biểu đồ doanh thu theo ngày/ });
    group.focus();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.keyboard("{End}");
    expect(screen.getByTestId("analytics-tooltip")).toHaveTextContent(
      /20\/11: doanh thu 5\.000\.000₫, 1 đơn đã thanh toán/,
    );
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByTestId("analytics-tooltip")).toHaveTextContent(/19\/11: doanh thu 0₫/);
  });
});

describe("AdminAnalytics - bộ lọc và URL", () => {
  it("mặc định: preset 30 ngày và nhóm Ngày đang chọn (aria-pressed)", async () => {
    stub(() => jsonRes(200, { data: makeOverview() }));
    render(<AdminAnalytics />);
    expect(screen.getByRole("button", { name: "30 ngày" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "7 ngày" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Ngày" })).toHaveAttribute("aria-pressed", "true");
    await screen.findByRole("region", { name: "Doanh thu" });
  });

  it("đổi preset cập nhật URL bằng router.replace (không giữ g khi chưa chọn)", async () => {
    stub(() => jsonRes(200, { data: makeOverview() }));
    render(<AdminAnalytics />);
    await screen.findByRole("region", { name: "Doanh thu" });
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(screen.getByRole("button", { name: "7 ngày" }));
    expect(replace).toHaveBeenCalledWith("/admin/phan-tich?from=2026-11-14&to=2026-11-20");
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(screen.getByRole("button", { name: "Tháng trước" }));
    expect(replace).toHaveBeenLastCalledWith("/admin/phan-tich?from=2026-10-01&to=2026-10-31");
  });

  it("chọn nhóm Tuần ghi g=week vào URL, giữ khoảng ngày", async () => {
    search = "from=2026-10-01&to=2026-10-31";
    stub(() => jsonRes(200, { data: makeOverview() }));
    render(<AdminAnalytics />);
    await screen.findByRole("region", { name: "Doanh thu" });
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(screen.getByRole("button", { name: "Tuần" }));
    expect(replace).toHaveBeenCalledWith("/admin/phan-tich?from=2026-10-01&to=2026-10-31&g=week");
  });

  it("URL có from/to/g hợp lệ thì gọi API đúng tham số; sai thì về mặc định", async () => {
    search = "from=2026-01-01&to=2026-06-30&g=month";
    const fetchFn = stub(() => jsonRes(200, { data: makeOverview() }));
    const { unmount } = render(<AdminAnalytics />);
    await screen.findByRole("region", { name: "Doanh thu" });
    expect(overviewCalls(fetchFn)[0]![0]).toContain(
      "from=2026-01-01&to=2026-06-30&granularity=month",
    );
    expect(screen.getByRole("button", { name: "Tháng" })).toHaveAttribute("aria-pressed", "true");
    unmount();

    search = "from=hello&to=2099-01-01&g=year";
    const fetch2 = stub(() => jsonRes(200, { data: makeOverview() }));
    render(<AdminAnalytics />);
    await screen.findByRole("region", { name: "Doanh thu" });
    expect(overviewCalls(fetch2)[0]![0]).toContain("from=2026-10-22&to=2026-11-20&granularity=day");
  });

  it("khoảng tùy chọn: báo lỗi tiếng Việt cho ngày tương lai / đảo ngược / quá 366 ngày, không đổi URL", async () => {
    stub(() => jsonRes(200, { data: makeOverview() }));
    render(<AdminAnalytics />);
    await screen.findByRole("region", { name: "Doanh thu" });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const from = screen.getByLabelText("Từ ngày");
    const to = screen.getByLabelText("Đến ngày");
    expect(to).toHaveAttribute("max", "2026-11-20");

    await user.clear(to);
    await user.type(to, "2026-11-25");
    await user.click(screen.getByRole("button", { name: "Áp dụng" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Không chọn ngày trong tương lai.");

    await user.clear(to);
    await user.type(to, "2026-10-01");
    await user.click(screen.getByRole("button", { name: "Áp dụng" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/trước hoặc bằng/);

    await user.clear(from);
    await user.type(from, "2024-01-01");
    await user.clear(to);
    await user.type(to, "2026-11-20");
    await user.click(screen.getByRole("button", { name: "Áp dụng" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/tối đa 366/);
    expect(replace).not.toHaveBeenCalled();
  });

  it("khoảng tùy chọn hợp lệ -> router.replace", async () => {
    stub(() => jsonRes(200, { data: makeOverview() }));
    render(<AdminAnalytics />);
    await screen.findByRole("region", { name: "Doanh thu" });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const from = screen.getByLabelText("Từ ngày");
    await user.clear(from);
    await user.type(from, "2026-11-01");
    await user.click(screen.getByRole("button", { name: "Áp dụng" }));
    expect(replace).toHaveBeenCalledWith("/admin/phan-tich?from=2026-11-01&to=2026-11-20");
  });
});
