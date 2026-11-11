import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bodyOf, errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import type { UserRole } from "@/types/auth";
import { makeAdminListItem, makeAdminOrder, makeAdminPayment, makeStatusCounts } from "../testing";
import { AdminOrderDetail } from "./AdminOrderDetail";
import { AdminOrders } from "./AdminOrders";

let role: UserRole = "ADMIN";
let search = "";
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ role }) }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

type Handler = (path: string, init: RequestInit) => Response;
function stubFetch(handler: Handler) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) =>
    handler(input.replace("/api/v1", ""), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

const CODE = "BB-261110-K7QP";
const isPost = (init: RequestInit) => init.method === "POST";

beforeEach(() => {
  role = "ADMIN";
  search = "";
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

const META = { page: 1, pageSize: 20, total: 1, totalPages: 1, statusCounts: makeStatusCounts() };

describe("AdminOrders: cần hoàn tiền", () => {
  it("tab Cần hoàn tiền có href needsRefund=true; URL needsRefund=true gửi lên API; badge trên dòng", async () => {
    search = "needsRefund=true&status=CANCELLED";
    const mock = stubFetch(() =>
      jsonRes(200, {
        data: [makeAdminListItem({ status: "CANCELLED", needsRefund: true })],
        meta: META,
      }),
    );
    render(<AdminOrders />);
    await screen.findAllByRole("link", { name: /BB-261110-K7QP/ });
    expect(mock).toHaveBeenCalledWith(
      "/api/v1/admin/orders?status=CANCELLED&needsRefund=true&pageSize=20",
      expect.anything(),
    );
    expect(screen.getAllByText("Cần hoàn tiền").length).toBeGreaterThan(1);
    const tab = screen.getByRole("link", { name: "Cần hoàn tiền" });
    expect(tab).toHaveAttribute("aria-current", "page");
    // Bấm lại để bỏ lọc, vẫn giữ status.
    expect(tab).toHaveAttribute("href", "/admin/don-hang?status=CANCELLED");
  });

  it("tab chưa bật -> href bật needsRefund", async () => {
    stubFetch(() => jsonRes(200, { data: [makeAdminListItem()], meta: META }));
    render(<AdminOrders />);
    const tab = await screen.findByRole("link", { name: "Cần hoàn tiền" });
    expect(tab).toHaveAttribute("href", "/admin/don-hang?needsRefund=true");
    expect(tab).not.toHaveAttribute("aria-current");
  });
});

const paidOrder = (over = {}) =>
  makeAdminOrder({
    status: "CANCELLED",
    paymentMethod: "VNPAY",
    paymentStatus: "PAID",
    allowedTransitions: [],
    needsRefund: true,
    payments: [
      makeAdminPayment({ needsRefund: true }),
      makeAdminPayment({
        id: "ckpay0",
        provider: "STRIPE",
        status: "FAILED",
        providerTxnId: null,
        amount: 100000,
      }),
    ],
    ...over,
  });

describe("AdminOrderDetail: thanh toán và hoàn tiền", () => {
  it("liệt kê payments với nhãn tiếng Việt, banner và badge khi needsRefund", async () => {
    stubFetch(() => jsonRes(200, { data: paidOrder() }));
    render(<AdminOrderDetail code={CODE} />);
    const list = await screen.findByRole("list", { name: "Giao dịch thanh toán" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Thành công")).toBeInTheDocument();
    expect(within(items[0]!).getByText("14012345")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Cần hoàn tiền")).toBeInTheDocument();
    expect(within(items[1]!).getByText("Thất bại")).toBeInTheDocument();
    expect(within(items[1]!).getByText(/Stripe/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/Đơn đã hủy nhưng khách đã thanh toán/);
  });

  it("thanh toán trùng (đơn chưa hủy): banner nêu thanh toán trùng", async () => {
    stubFetch(() =>
      jsonRes(200, {
        data: paidOrder({ status: "CONFIRMED", allowedTransitions: ["PROCESSING"] }),
      }),
    );
    render(<AdminOrderDetail code={CODE} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/thanh toán trùng/);
  });

  it("không needsRefund -> không có banner; hiển thị ghi chú hoàn tiền của payment đã hoàn", async () => {
    stubFetch(() =>
      jsonRes(200, {
        data: makeAdminOrder({
          paymentStatus: "REFUNDED",
          payments: [
            makeAdminPayment({
              status: "REFUNDED",
              refundedAt: "2026-11-11T02:00:00.000Z",
              refundNote: "Hoàn qua VNPay mã 998877",
            }),
          ],
        }),
      }),
    );
    render(<AdminOrderDetail code={CODE} />);
    expect(await screen.findByText("Đã hoàn tiền")).toBeInTheDocument();
    expect(screen.getByText("Hoàn qua VNPay mã 998877")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ghi nhận đã hoàn tiền" })).not.toBeInTheDocument();
  });

  it("đơn PENDING_PAYMENT hiển thị hạn thanh toán và ghi chú tự hủy", async () => {
    stubFetch(() =>
      jsonRes(200, {
        data: makeAdminOrder({
          status: "PENDING_PAYMENT",
          paymentMethod: "VNPAY",
          expiresAt: "2026-11-10T08:45:00.000Z",
          allowedTransitions: ["CANCELLED"],
        }),
      }),
    );
    render(<AdminOrderDetail code={CODE} />);
    expect(await screen.findByText(/Hạn thanh toán/)).toHaveTextContent("15:45");
    expect(screen.getByText(/Sẽ tự hủy khi quá hạn/)).toBeInTheDocument();
  });

  it("STAFF không thấy nút Ghi nhận đã hoàn tiền", async () => {
    role = "STAFF";
    stubFetch(() => jsonRes(200, { data: paidOrder() }));
    render(<AdminOrderDetail code={CODE} />);
    await screen.findByRole("list", { name: "Giao dịch thanh toán" });
    expect(screen.queryByRole("button", { name: "Ghi nhận đã hoàn tiền" })).not.toBeInTheDocument();
  });

  it("ADMIN: nút chỉ ở payment SUCCEEDED; ghi chú bắt buộc 5-500; gửi đúng body; cập nhật từ response", async () => {
    const mock = stubFetch((_p, init) =>
      isPost(init)
        ? jsonRes(200, {
            data: paidOrder({
              paymentStatus: "REFUNDED",
              needsRefund: false,
              payments: [
                makeAdminPayment({
                  status: "REFUNDED",
                  refundNote: "Đã hoàn qua cổng VNPay sandbox",
                  refundedAt: "2026-11-11T02:00:00.000Z",
                }),
              ],
            }),
          })
        : jsonRes(200, { data: paidOrder() }),
    );
    render(<AdminOrderDetail code={CODE} />);
    await screen.findByRole("list", { name: "Giao dịch thanh toán" });
    const buttons = screen.getAllByRole("button", { name: "Ghi nhận đã hoàn tiền" });
    expect(buttons).toHaveLength(1);

    const user = userEvent.setup();
    await user.click(buttons[0]!);
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/Hãy hoàn tiền trên cổng thanh toán trước/),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Ghi nhận đã hoàn tiền" }));
    expect(await within(dialog).findByText(/bắt buộc, từ 5 đến 500 ký tự/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Ghi chú hoàn tiền/), "abc");
    await user.click(within(dialog).getByRole("button", { name: "Ghi nhận đã hoàn tiền" }));
    expect(await within(dialog).findByText(/bắt buộc, từ 5 đến 500 ký tự/)).toBeInTheDocument();
    expect(mock.mock.calls.some(([, i]) => isPost(i as RequestInit))).toBe(false);

    await user.clear(within(dialog).getByLabelText(/Ghi chú hoàn tiền/));
    await user.type(
      within(dialog).getByLabelText(/Ghi chú hoàn tiền/),
      "  Đã hoàn qua cổng VNPay sandbox ",
    );
    await user.click(within(dialog).getByRole("button", { name: "Ghi nhận đã hoàn tiền" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const idx = mock.mock.calls.findIndex(([, i]) => isPost(i as RequestInit));
    expect(mock.mock.calls[idx]![0]).toBe(`/api/v1/admin/orders/${CODE}/refunds`);
    expect(bodyOf(mock, idx)).toEqual({
      paymentId: "ckpay1",
      note: "Đã hoàn qua cổng VNPay sandbox",
    });
    expect(await screen.findByText("Đã ghi nhận hoàn tiền.")).toBeInTheDocument();
    expect(screen.getByText("Đã hoàn qua cổng VNPay sandbox")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ghi nhận đã hoàn tiền" })).not.toBeInTheDocument();
  });

  it("409 CONFLICT hiển thị message của server và giữ hộp thoại", async () => {
    stubFetch((_p, init) =>
      isPost(init)
        ? errRes(409, "CONFLICT", "Hãy hủy đơn trước khi hoàn tiền")
        : jsonRes(200, { data: paidOrder({ status: "CONFIRMED", allowedTransitions: [] }) }),
    );
    render(<AdminOrderDetail code={CODE} />);
    await screen.findByRole("list", { name: "Giao dịch thanh toán" });
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Ghi nhận đã hoàn tiền" })[0]!);
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Ghi chú hoàn tiền/), "Đã hoàn trên cổng");
    await user.click(within(dialog).getByRole("button", { name: "Ghi nhận đã hoàn tiền" }));
    expect(await within(dialog).findByText("Hãy hủy đơn trước khi hoàn tiền")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
