import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { makeAdminOrder } from "../testing";
import { AdminOrderPrint, collectOnDelivery } from "./AdminOrderPrint";

function stubFetch(handler: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => handler()),
  );
}

beforeEach(() => tokenStore.clear());
afterEach(() => vi.unstubAllGlobals());

describe("collectOnDelivery", () => {
  it("chưa thanh toán thu đủ grandTotal, PAID thì 0", () => {
    expect(collectOnDelivery({ paymentStatus: "UNPAID", grandTotal: 350000 })).toBe(350000);
    expect(collectOnDelivery({ paymentStatus: "FAILED", grandTotal: 350000 })).toBe(350000);
    expect(collectOnDelivery({ paymentStatus: "PAID", grandTotal: 350000 })).toBe(0);
  });
});

describe("AdminOrderPrint", () => {
  it("đơn COD chưa thanh toán: hiện đủ thông tin và tiền thu hộ = tổng", async () => {
    stubFetch(() =>
      jsonRes(200, {
        data: makeAdminOrder({
          status: "SHIPPING",
          trackingNumber: "GHN-123",
          carrier: "GHN",
          note: "Gọi trước khi giao",
        }),
      }),
    );
    render(<AdminOrderPrint code="BB-261110-K7QP" />);
    expect(await screen.findByText("BB-261110-K7QP")).toBeInTheDocument();
    expect(screen.getByText(/Nguyễn Văn An · 0901234567/)).toBeInTheDocument();
    expect(
      screen.getByText(/12 Lê Lợi, Phường Sài Gòn, Thành phố Hồ Chí Minh/),
    ).toBeInTheDocument();
    expect(screen.getByText("ROB-500-PHIN")).toBeInTheDocument();
    expect(screen.getByText("Tiêu chuẩn")).toBeInTheDocument();
    expect(screen.getByText("GHN-123 (GHN)")).toBeInTheDocument();
    expect(screen.getByText("Gọi trước khi giao")).toBeInTheDocument();
    expect(screen.getByTestId("cod-amount")).toHaveTextContent("350.000₫");
  });

  it("đơn đã thanh toán: tiền thu hộ 0₫", async () => {
    stubFetch(() =>
      jsonRes(200, {
        data: makeAdminOrder({ paymentMethod: "VNPAY", paymentStatus: "PAID" }),
      }),
    );
    render(<AdminOrderPrint code="BB-261110-K7QP" />);
    expect(await screen.findByTestId("cod-amount")).toHaveTextContent("0₫");
  });

  it("nút In gọi window.print()", async () => {
    stubFetch(() => jsonRes(200, { data: makeAdminOrder() }));
    const print = vi.fn();
    vi.stubGlobal("print", print);
    render(<AdminOrderPrint code="BB-261110-K7QP" />);
    await userEvent.click(await screen.findByRole("button", { name: "In" }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("404 -> không tìm thấy đơn hàng", async () => {
    stubFetch(() => errRes(404, "NOT_FOUND"));
    render(<AdminOrderPrint code="BB-000000-XXXX" />);
    expect(await screen.findByText("Không tìm thấy đơn hàng")).toBeInTheDocument();
  });
});
