import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes, makeUser } from "@/features/account/testing";
import { makeAdminOrder } from "../testing";
import { OrderPayments, TransferClaimedBadge } from "./OrderPayments";

vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ role: "STAFF" }) }),
}));

afterEach(() => vi.unstubAllGlobals());

const bank = (over = {}) =>
  makeAdminOrder({
    paymentMethod: "BANK_TRANSFER",
    paymentStatus: "UNPAID",
    status: "PENDING_PAYMENT",
    ...over,
  });

describe("OrderPayments: xác nhận chuyển khoản (D-061)", () => {
  it("hiện hộp xác nhận kèm thời điểm khách báo; cần bước xác nhận thứ hai", async () => {
    const paid = bank({ paymentStatus: "PAID", status: "CONFIRMED" });
    const fetchMock = vi.fn(async () => jsonRes(200, { data: paid }));
    vi.stubGlobal("fetch", fetchMock);
    const onConfirmed = vi.fn();
    const u = userEvent.setup();
    render(
      <OrderPayments
        order={bank({ transferClaimedAt: "2026-11-10T09:00:00.000Z" })}
        onRefunded={vi.fn()}
        onConfirmed={onConfirmed}
      />,
    );
    expect(screen.getByText(/Khách báo đã chuyển khoản lúc/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Xác nhận đã nhận tiền" }));
    expect(fetchMock).not.toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: "Đồng ý" }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith(paid));
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toContain("/admin/orders/BB-261110-K7QP/bank-transfer/confirm");
    expect(call[1].method).toBe("POST");
  });

  it("'Không' hủy bước xác nhận mà không gọi API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const u = userEvent.setup();
    render(<OrderPayments order={bank()} onRefunded={vi.fn()} onConfirmed={vi.fn()} />);
    expect(screen.getByText(/Khách chưa báo đã chuyển khoản/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Xác nhận đã nhận tiền" }));
    await u.click(screen.getByRole("button", { name: "Không" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Xác nhận đã nhận tiền" })).toBeInTheDocument();
  });

  it("lỗi từ API hiện thông báo, không gọi onConfirmed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errRes(409, "CONFLICT", "x")),
    );
    const onConfirmed = vi.fn();
    const u = userEvent.setup();
    render(<OrderPayments order={bank()} onRefunded={vi.fn()} onConfirmed={onConfirmed} />);
    await u.click(screen.getByRole("button", { name: "Xác nhận đã nhận tiền" }));
    await u.click(screen.getByRole("button", { name: "Đồng ý" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("đơn đã hủy: cảnh báo sẽ đánh dấu cần hoàn tiền", () => {
    render(
      <OrderPayments
        order={bank({ status: "CANCELLED" })}
        onRefunded={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );
    expect(screen.getByText(/đánh dấu cần hoàn tiền/)).toBeInTheDocument();
  });

  it("không hiện hộp khi đã PAID, khi là COD, hoặc khi không có onConfirmed", () => {
    const { rerender } = render(
      <OrderPayments
        order={bank({ paymentStatus: "PAID" })}
        onRefunded={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Xác nhận đã nhận tiền" })).not.toBeInTheDocument();
    rerender(
      <OrderPayments
        order={makeAdminOrder({ paymentMethod: "COD" })}
        onRefunded={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Xác nhận đã nhận tiền" })).not.toBeInTheDocument();
    rerender(<OrderPayments order={bank()} onRefunded={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Xác nhận đã nhận tiền" })).not.toBeInTheDocument();
  });

  it("TransferClaimedBadge", () => {
    render(<TransferClaimedBadge />);
    expect(screen.getByText("Khách báo đã chuyển khoản")).toBeInTheDocument();
  });
});
