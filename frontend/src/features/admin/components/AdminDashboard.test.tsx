import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import type { AdminDashboard as Dashboard } from "@/types/admin";
import { ALL_ORDER_STATUSES } from "../api/orders";
import { makeStatusCounts } from "../testing";
import { AdminDashboard } from "./AdminDashboard";

function makeDashboard(over: Partial<Dashboard> = {}): Dashboard {
  const dailyRevenue = Array.from({ length: 30 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    revenue: i === 29 ? 1250000 : 0,
    orders: i === 29 ? 4 : 0,
  }));
  return {
    revenue: { today: 1250000, last7Days: 8420000, last30Days: 31200000 },
    orders: { today: 4, last7Days: 31, last30Days: 120 },
    dailyRevenue,
    ordersByStatus: makeStatusCounts({ PENDING: 3, DELIVERED: 40 }),
    topProducts: [
      {
        productId: "ckp1",
        name: "Ethiopia Yirgacheffe Washed",
        slug: "ethiopia",
        quantity: 12,
        revenue: 2220000,
      },
    ],
    lowStock: [
      {
        variantId: "ckv1",
        sku: "ETH-250-WB",
        productName: "Ethiopia Yirgacheffe Washed",
        variantName: "250 g / Nguyên hạt",
        stock: 2,
        lowStockThreshold: 5,
      },
    ],
    attention: { pendingOrders: 3, needsRefund: 1 },
    generatedAt: "2026-11-11T04:00:00.000Z",
    ...over,
  };
}

beforeEach(() => tokenStore.clear());
afterEach(() => vi.unstubAllGlobals());

describe("AdminDashboard", () => {
  it("hiển thị doanh thu và số đơn hôm nay / 7 / 30 ngày", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes(200, { data: makeDashboard() })),
    );
    render(<AdminDashboard />);
    const today = await screen.findByRole("region", { name: "Hôm nay" });
    expect(within(today).getByText(/1\.250\.000/)).toBeInTheDocument();
    expect(within(today).getByText("4 đơn")).toBeInTheDocument();
    const week = screen.getByRole("region", { name: "7 ngày qua" });
    expect(within(week).getByText(/8\.420\.000/)).toBeInTheDocument();
    expect(within(week).getByText("31 đơn")).toBeInTheDocument();
    const month = screen.getByRole("region", { name: "30 ngày qua" });
    expect(within(month).getByText(/31\.200\.000/)).toBeInTheDocument();
    expect(within(month).getByText("120 đơn")).toBeInTheDocument();
    expect(screen.getByText(/Cập nhật lúc 11:00 11\/11\/2026/)).toBeInTheDocument();
  });

  it("biểu đồ 30 cột, mỗi cột có nhãn đọc được cho trình đọc màn hình", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes(200, { data: makeDashboard() })),
    );
    render(<AdminDashboard />);
    const chart = await screen.findByRole("group", { name: /Biểu đồ doanh thu 30 ngày/ });
    const bars = within(chart).getAllByRole("listitem");
    expect(bars).toHaveLength(30);
    expect(bars[29]).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/30\/10: doanh thu .*1\.250\.000.*, 4 đơn/),
    );
    expect(bars[0]).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/01\/10: doanh thu .*0.*, 0 đơn/),
    );
  });

  it("link: đơn theo trạng thái, top sản phẩm, tồn kho thấp, cần chú ý", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes(200, { data: makeDashboard() })),
    );
    render(<AdminDashboard />);
    const status = await screen.findByRole("region", { name: "Đơn theo trạng thái" });
    expect(within(status).getAllByRole("listitem")).toHaveLength(ALL_ORDER_STATUSES.length);
    expect(within(status).getByRole("link", { name: "Chờ xác nhận" })).toHaveAttribute(
      "href",
      "/admin/don-hang?status=PENDING",
    );
    expect(screen.getByRole("link", { name: "Ethiopia Yirgacheffe Washed" })).toHaveAttribute(
      "href",
      "/admin/san-pham/ckp1",
    );
    expect(screen.getByRole("link", { name: "ETH-250-WB" })).toHaveAttribute(
      "href",
      "/admin/ton-kho?q=ETH-250-WB",
    );
    expect(screen.getByRole("link", { name: "3 đơn chờ xác nhận" })).toHaveAttribute(
      "href",
      "/admin/don-hang?status=PENDING",
    );
    expect(screen.getByRole("link", { name: "1 đơn cần hoàn tiền" })).toHaveAttribute(
      "href",
      "/admin/don-hang?needsRefund=true",
    );
  });

  it("danh sách rỗng hiện thông báo thay vì khung trống", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonRes(200, {
          data: makeDashboard({
            topProducts: [],
            lowStock: [],
            attention: { pendingOrders: 0, needsRefund: 0 },
          }),
        }),
      ),
    );
    render(<AdminDashboard />);
    expect(await screen.findByText("Không có mục nào cần xử lý.")).toBeInTheDocument();
    expect(screen.getByText("Không có biến thể nào sắp hết hàng.")).toBeInTheDocument();
    expect(screen.getByText("Chưa có đơn hàng trong 30 ngày qua.")).toBeInTheDocument();
  });

  it("lỗi -> thông báo và Thử lại tải lại thành công", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(errRes(500, "INTERNAL_ERROR", "Lỗi máy chủ"))
      .mockResolvedValue(jsonRes(200, { data: makeDashboard() }));
    vi.stubGlobal("fetch", mock);
    render(<AdminDashboard />);
    expect(await screen.findByText("Không tải được tổng quan")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("region", { name: "Hôm nay" })).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("Làm mới gọi lại API", async () => {
    const mock = vi.fn(async () => jsonRes(200, { data: makeDashboard() }));
    vi.stubGlobal("fetch", mock);
    render(<AdminDashboard />);
    await screen.findByRole("region", { name: "Hôm nay" });
    await userEvent.click(screen.getByRole("button", { name: "Làm mới" }));
    await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
  });
});
