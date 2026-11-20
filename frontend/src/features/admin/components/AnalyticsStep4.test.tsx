import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { couponItem, makeCoupons } from "../analyticsTesting";
import { saveBlob } from "../download";
import { AdminAnalytics } from "./AdminAnalytics";
import { CouponsBlock } from "./AnalyticsCoupons";
import { ExportCsvButton, exportErrorMessage } from "./ExportCsvButton";
import { ApiError } from "@/lib/api/errors";

let role: "ADMIN" | "STAFF" = "ADMIN";
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ role }) }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/phan-tich",
}));
vi.mock("../download", () => ({ saveBlob: vi.fn() }));

const csvRes = () =>
  new Response("﻿Hạng\r\n", {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="beanbox-top-customers-2026-10-22_2026-11-20.csv"',
    },
  });

const callsTo = (fn: ReturnType<typeof vi.fn>, part: string) =>
  fn.mock.calls.map((c) => String(c[0])).filter((u) => u.includes(part));

beforeEach(() => {
  role = "ADMIN";
  tokenStore.set("tok");
  vi.mocked(saveBlob).mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  tokenStore.clear();
});

describe("CouponsBlock", () => {
  const renderBlock = () => render(<CouponsBlock from="2026-10-22" to="2026-11-20" refresh={0} />);

  it("hiện thẻ tóm tắt, bảng theo mã, nhãn Đã xóa và link tới mã còn tồn tại", async () => {
    const fn = vi.fn(async () => jsonRes(200, { data: makeCoupons() }));
    vi.stubGlobal("fetch", fn);
    renderBlock();
    expect(screen.getByRole("status", { name: /Đang tải hiệu quả mã giảm giá/ })).toBeTruthy();
    const heading = await screen.findByRole("heading", { name: "Mã giảm giá" });
    expect(heading).toBeTruthy();
    expect(callsTo(fn, "/analytics/coupons")[0]).toContain(
      "from=2026-10-22&to=2026-11-20&sort=revenue&limit=10",
    );

    // Thẻ tóm tắt có so sánh kỳ trước.
    const rate = await screen.findByRole("region", { name: "Tỷ lệ đơn dùng mã" });
    expect(within(rate).getByText("40%")).toBeTruthy();
    expect(within(rate).getByText(/▲ 15 điểm %/)).toBeTruthy();
    const orders = screen.getByRole("region", { name: "Đơn dùng mã" });
    expect(within(orders).getByText("4")).toBeTruthy();
    expect(within(orders).getByText(/Trên tổng 10 đơn đã thanh toán/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Giá trị đơn TB có mã" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Giá trị đơn TB không mã" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Tổng tiền giảm" })).toBeTruthy();

    const table = screen.getByRole("table");
    const link = within(table).getByRole("link", { name: "MASALE" });
    expect(link.getAttribute("href")).toBe("/admin/ma-giam-gia/c-sale");
    // Mã đã xóa: nhãn "Đã xóa", không có link.
    const goneRow = within(table).getByText("MAGONE").closest("tr")!;
    expect(within(goneRow).getByText("Đã xóa")).toBeTruthy();
    expect(within(goneRow).queryByRole("link")).toBeNull();
    // Bảng nằm trong vùng cuộn ngang.
    expect(table.closest("[role=region]")!.className).toContain("overflow-x-auto");
    expect(table.closest("[role=region]")!.className).toContain("relative");
  });

  it("đổi sắp xếp gọi lại API với sort tương ứng", async () => {
    const fn = vi.fn(async () => jsonRes(200, { data: makeCoupons() }));
    vi.stubGlobal("fetch", fn);
    renderBlock();
    await screen.findByRole("table");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Theo lượt dùng" }));
    await waitFor(() => expect(callsTo(fn, "/analytics/coupons").at(-1)).toContain("sort=uses"));
    await user.click(screen.getByRole("button", { name: "Theo tiền giảm" }));
    await waitFor(() =>
      expect(callsTo(fn, "/analytics/coupons").at(-1)).toContain("sort=discount"),
    );
    expect(
      screen.getByRole("button", { name: "Theo tiền giảm" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("mã đã tắt có nhãn Đã tắt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonRes(200, { data: makeCoupons({ items: [couponItem("off", { isActive: false })] }) }),
      ),
    );
    renderBlock();
    expect(await screen.findByText("Đã tắt")).toBeTruthy();
  });

  it("trạng thái rỗng và lỗi riêng, có thử lại", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        n++;
        if (n === 1) return errRes(500, "INTERNAL_ERROR");
        return jsonRes(200, { data: makeCoupons({ items: [] }) });
      }),
    );
    renderBlock();
    expect(await screen.findByText("Không tải được hiệu quả mã giảm giá")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: /Thử lại/ }));
    expect(
      await screen.findByText("Chưa có đơn nào dùng mã giảm giá trong khoảng thời gian này."),
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("ExportCsvButton", () => {
  const params = {
    report: "top-customers",
    from: "2026-10-22",
    to: "2026-11-20",
    sort: "orders",
  } as const;

  it("nhãn có ngữ cảnh; bấm tải CSV bằng Bearer, không token trong URL, rồi lưu file", async () => {
    const fn = vi.fn(async () => csvRes());
    vi.stubGlobal("fetch", fn);
    render(<ExportCsvButton params={params} context="top khách hàng" />);
    const btn = screen.getByRole("button", { name: "Xuất CSV top khách hàng" });
    expect(btn.textContent).toContain("Xuất CSV");
    await userEvent.setup().click(btn);
    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
    const [blob, filename] = vi.mocked(saveBlob).mock.calls[0]!;
    expect(filename).toBe("beanbox-top-customers-2026-10-22_2026-11-20.csv");
    expect(blob).toBeInstanceOf(Blob);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "/api/v1/admin/analytics/export?report=top-customers&from=2026-10-22&to=2026-11-20&sort=orders",
    );
    expect(url).not.toContain("tok");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    // Xong: nút dùng lại được.
    await waitFor(() => expect(btn.hasAttribute("disabled")).toBe(false));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("đang xuất: disabled + aria-busy, không gửi trùng khi bấm lại", async () => {
    let release!: () => void;
    const fn = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(csvRes());
        }),
    );
    vi.stubGlobal("fetch", fn);
    render(<ExportCsvButton params={params} context="top khách hàng" />);
    const btn = screen.getByRole("button", { name: "Xuất CSV top khách hàng" });
    const user = userEvent.setup();
    await user.click(btn);
    await waitFor(() => expect(btn.getAttribute("aria-busy")).toBe("true"));
    expect(btn.hasAttribute("disabled")).toBe(true);
    await user.click(btn);
    expect(fn).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(btn.hasAttribute("disabled")).toBe(false));
    expect(btn.getAttribute("aria-busy")).toBeNull();
  });

  it("429: thông báo tiếng Việt kèm số giây chờ, không lưu file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errRes(429, "RATE_LIMITED", "Chậm lại", { retryAfterSec: 37 })),
    );
    render(<ExportCsvButton params={params} context="top khách hàng" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Xuất CSV top khách hàng" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Bạn xuất quá nhanh, thử lại sau 37 giây.");
    expect(saveBlob).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("button", { name: "Xuất CSV top khách hàng" })
        .getAttribute("aria-describedby"),
    ).toBe(alert.id);
  });

  it("lỗi khác (500, mạng) hiện thông báo tại chỗ; bấm lại xóa lỗi cũ", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        n++;
        if (n === 1) return errRes(500, "INTERNAL_ERROR");
        return csvRes();
      }),
    );
    render(<ExportCsvButton params={params} context="top khách hàng" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Xuất CSV top khách hàng" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Đã có lỗi xảy ra");
    await user.click(screen.getByRole("button", { name: "Xuất CSV top khách hàng" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("exportErrorMessage: 429 không có retryAfterSec, validate, lỗi lạ", () => {
    expect(exportErrorMessage(new ApiError(429, "RATE_LIMITED", "x"))).toBe(
      "Bạn xuất quá nhanh, thử lại sau ít phút.",
    );
    expect(exportErrorMessage(new ApiError(400, "VALIDATION_ERROR", "x"))).toContain("bộ lọc");
    expect(exportErrorMessage(new Error("boom"))).toContain("Đã có lỗi xảy ra");
  });
});

describe("AdminAnalytics - Bước 4", () => {
  it("STAFF thấy Forbidden và không gọi coupons/export", () => {
    role = "STAFF";
    const fn = vi.fn(async () => jsonRes(200, { data: {} }));
    vi.stubGlobal("fetch", fn);
    render(<AdminAnalytics />);
    expect(screen.getByText("Bạn không đủ quyền xem phân tích kinh doanh")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Xuất CSV/ })).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });
});
