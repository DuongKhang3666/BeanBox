import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bodyOf, errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { makeAdminOrder } from "../testing";
import { AdminOrderDetail } from "./AdminOrderDetail";

vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ role: "STAFF" }) }),
}));

function stubFetch(handler: (path: string, init: RequestInit) => Response) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) =>
    handler(input.replace("/api/v1", ""), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

const CODE = "BB-261110-K7QP";
const isPatch = (init: RequestInit) => init.method === "PATCH";

beforeEach(() => tokenStore.clear());
afterEach(() => vi.unstubAllGlobals());

async function openAction(name: string) {
  await userEvent.click(await screen.findByRole("button", { name }));
  return screen.getByRole("dialog");
}

describe("AdminOrderDetail", () => {
  it("hiển thị thông tin đơn, khách, sản phẩm kèm SKU, lịch sử có người thao tác", async () => {
    stubFetch(() =>
      jsonRes(200, {
        data: makeAdminOrder({
          status: "CONFIRMED",
          couponCode: "WELCOME10",
          note: "Gọi trước khi giao",
          history: [
            {
              fromStatus: null,
              toStatus: "PENDING",
              note: null,
              createdAt: "2026-11-10T08:30:00.000Z",
              actor: null,
            },
            {
              fromStatus: "PENDING",
              toStatus: "CONFIRMED",
              note: null,
              createdAt: "2026-11-10T09:00:00.000Z",
              actor: { id: "s1", fullName: "Trần Thu", role: "STAFF" },
            },
          ],
        }),
      }),
    );
    render(<AdminOrderDetail code={CODE} />);
    expect(await screen.findByRole("heading", { name: `Đơn hàng ${CODE}` })).toBeInTheDocument();
    expect(screen.getByText("WELCOME10")).toBeInTheDocument();
    expect(screen.getByText("Gọi trước khi giao")).toBeInTheDocument();
    expect(screen.getByText(/SKU ROB-500-PHIN/)).toBeInTheDocument();
    expect(screen.getByText(/Trần Thu \(Nhân viên\)/)).toBeInTheDocument();
    expect(screen.getByText(/Hệ thống/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "In phiếu giao" })).toHaveAttribute(
      "href",
      `/admin/don-hang/${CODE}/in`,
    );
  });

  it("chỉ hiện nút cho đích trong allowedTransitions", async () => {
    stubFetch(() =>
      jsonRes(200, {
        data: makeAdminOrder({
          status: "SHIPPING",
          allowedTransitions: ["DELIVERED", "FAILED_DELIVERY"],
        }),
      }),
    );
    render(<AdminOrderDetail code={CODE} />);
    expect(await screen.findByRole("button", { name: "Đã giao" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Giao thất bại" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hủy đơn" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xác nhận đơn" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bắt đầu đóng gói" })).not.toBeInTheDocument();
  });

  it("đơn trạng thái cuối không có nút hành động", async () => {
    stubFetch(() =>
      jsonRes(200, { data: makeAdminOrder({ status: "CANCELLED", allowedTransitions: [] }) }),
    );
    render(<AdminOrderDetail code={CODE} />);
    expect(await screen.findByText(/Không còn thao tác nào khả dụng/)).toBeInTheDocument();
  });

  it("PROCESSING -> SHIPPING bắt buộc mã vận đơn; gửi kèm fromStatus; thành công dùng response", async () => {
    const processing = makeAdminOrder({
      status: "PROCESSING",
      allowedTransitions: ["SHIPPING", "CANCELLED"],
    });
    const mock = stubFetch((_p, init) =>
      isPatch(init)
        ? jsonRes(200, {
            data: makeAdminOrder({
              status: "SHIPPING",
              trackingNumber: "GHN-123",
              carrier: "GHN",
              allowedTransitions: ["DELIVERED", "FAILED_DELIVERY"],
            }),
          })
        : jsonRes(200, { data: processing }),
    );
    render(<AdminOrderDetail code={CODE} />);
    const dialog = await openAction("Giao cho vận chuyển");
    const user = userEvent.setup();

    await user.click(within(dialog).getByRole("button", { name: "Giao cho vận chuyển" }));
    expect(await within(dialog).findByText("Vui lòng nhập mã vận đơn.")).toBeInTheDocument();
    expect(mock.mock.calls.filter(([, i]) => isPatch(i as RequestInit))).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/Mã vận đơn/), "GHN 123");
    await user.click(within(dialog).getByRole("button", { name: "Giao cho vận chuyển" }));
    expect(
      await within(dialog).findByText("Mã vận đơn chỉ gồm chữ, số và dấu gạch ngang."),
    ).toBeInTheDocument();

    const tracking = within(dialog).getByLabelText(/Mã vận đơn/);
    await user.clear(tracking);
    await user.type(tracking, "GHN-123");
    await user.type(within(dialog).getByLabelText(/Đơn vị vận chuyển/), "GHN");
    await user.click(within(dialog).getByRole("button", { name: "Giao cho vận chuyển" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const patchIdx = mock.mock.calls.findIndex(([, i]) => isPatch(i as RequestInit));
    expect(mock.mock.calls[patchIdx]![0]).toBe(`/api/v1/admin/orders/${CODE}/status`);
    expect(bodyOf(mock, patchIdx)).toEqual({
      toStatus: "SHIPPING",
      fromStatus: "PROCESSING",
      trackingNumber: "GHN-123",
      carrier: "GHN",
    });
    expect(screen.getByText(/Đã cập nhật trạng thái đơn thành "Đang giao"/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đã giao" })).toBeInTheDocument();
  });

  it("hủy từ PROCESSING bắt buộc ghi chú, có cảnh báo hoàn kho", async () => {
    const mock = stubFetch((_p, init) =>
      isPatch(init)
        ? jsonRes(200, { data: makeAdminOrder({ status: "CANCELLED", allowedTransitions: [] }) })
        : jsonRes(200, {
            data: makeAdminOrder({
              status: "PROCESSING",
              allowedTransitions: ["SHIPPING", "CANCELLED"],
            }),
          }),
    );
    render(<AdminOrderDetail code={CODE} />);
    const dialog = await openAction("Hủy đơn");
    expect(within(dialog).getByText(/hoàn lại tồn kho/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(dialog).getByRole("button", { name: "Hủy đơn" }));
    expect(await within(dialog).findByText("Vui lòng nhập lý do.")).toBeInTheDocument();
    expect(mock.mock.calls.some(([, i]) => isPatch(i as RequestInit))).toBe(false);

    await user.type(within(dialog).getByLabelText(/Lý do hủy/), "Hết hàng thực tế");
    await user.click(within(dialog).getByRole("button", { name: "Hủy đơn" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const patchIdx = mock.mock.calls.findIndex(([, i]) => isPatch(i as RequestInit));
    expect(bodyOf(mock, patchIdx)).toEqual({
      toStatus: "CANCELLED",
      fromStatus: "PROCESSING",
      note: "Hết hàng thực tế",
    });
  });

  it("hủy từ PENDING không bắt buộc ghi chú; đơn online PAID cảnh báo hoàn tiền thủ công", async () => {
    const mock = stubFetch((_p, init) =>
      isPatch(init)
        ? jsonRes(200, { data: makeAdminOrder({ status: "CANCELLED", allowedTransitions: [] }) })
        : jsonRes(200, {
            data: makeAdminOrder({
              status: "CONFIRMED",
              paymentMethod: "VNPAY",
              paymentStatus: "PAID",
              allowedTransitions: ["PROCESSING", "CANCELLED"],
            }),
          }),
    );
    render(<AdminOrderDetail code={CODE} />);
    const dialog = await openAction("Hủy đơn");
    expect(within(dialog).getByText(/hoàn tiền cho khách thủ công/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Hủy đơn" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const patchIdx = mock.mock.calls.findIndex(([, i]) => isPatch(i as RequestInit));
    expect(bodyOf(mock, patchIdx)).toEqual({ toStatus: "CANCELLED", fromStatus: "CONFIRMED" });
  });

  it("-> FAILED_DELIVERY bắt buộc lý do", async () => {
    stubFetch(() =>
      jsonRes(200, {
        data: makeAdminOrder({
          status: "SHIPPING",
          allowedTransitions: ["DELIVERED", "FAILED_DELIVERY"],
        }),
      }),
    );
    render(<AdminOrderDetail code={CODE} />);
    const dialog = await openAction("Giao thất bại");
    await userEvent.click(within(dialog).getByRole("button", { name: "Giao thất bại" }));
    expect(await within(dialog).findByText("Vui lòng nhập lý do.")).toBeInTheDocument();
  });

  it("FAILED_DELIVERY -> SHIPPING: tracking tùy chọn, điền sẵn giá trị hiện tại", async () => {
    stubFetch(() =>
      jsonRes(200, {
        data: makeAdminOrder({
          status: "FAILED_DELIVERY",
          trackingNumber: "OLD-1",
          carrier: "GHN",
          allowedTransitions: ["SHIPPING", "CANCELLED"],
        }),
      }),
    );
    render(<AdminOrderDetail code={CODE} />);
    const dialog = await openAction("Giao lại");
    expect(within(dialog).getByLabelText(/Mã vận đơn/)).toHaveValue("OLD-1");
    expect(within(dialog).getByLabelText(/Đơn vị vận chuyển/)).toHaveValue("GHN");
    expect(within(dialog).queryByText(/\(bắt buộc\)/)).not.toBeInTheDocument();
  });

  it("409 CONFLICT -> báo 'Đơn hàng vừa được cập nhật' và tải lại đơn", async () => {
    let gets = 0;
    const mock = stubFetch((_p, init) => {
      if (isPatch(init)) return errRes(409, "CONFLICT", "x", { currentStatus: "CONFIRMED" });
      gets += 1;
      return jsonRes(200, {
        data:
          gets === 1
            ? makeAdminOrder({ status: "PENDING", allowedTransitions: ["CONFIRMED", "CANCELLED"] })
            : makeAdminOrder({
                status: "CONFIRMED",
                allowedTransitions: ["PROCESSING", "CANCELLED"],
              }),
      });
    });
    render(<AdminOrderDetail code={CODE} />);
    const dialog = await openAction("Xác nhận đơn");
    await userEvent.click(within(dialog).getByRole("button", { name: "Xác nhận đơn" }));

    expect(await screen.findByRole("button", { name: "Bắt đầu đóng gói" })).toBeInTheDocument();
    expect(screen.getByText(/Đơn hàng vừa được cập nhật/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(gets).toBe(2);
    const patchIdx = mock.mock.calls.findIndex(([, i]) => isPatch(i as RequestInit));
    expect(bodyOf(mock, patchIdx)).toEqual({ toStatus: "CONFIRMED", fromStatus: "PENDING" });
  });

  it("409 INVALID_STATUS_TRANSITION -> thông báo và tải lại", async () => {
    let gets = 0;
    stubFetch((_p, init) => {
      if (isPatch(init)) return errRes(409, "INVALID_STATUS_TRANSITION");
      gets += 1;
      return jsonRes(200, { data: makeAdminOrder() });
    });
    render(<AdminOrderDetail code={CODE} />);
    const dialog = await openAction("Xác nhận đơn");
    await userEvent.click(within(dialog).getByRole("button", { name: "Xác nhận đơn" }));
    await waitFor(() => expect(gets).toBe(2));
    expect(await screen.findByText(/Không thể chuyển đơn sang trạng thái này/)).toBeInTheDocument();
  });

  it("400 -> lỗi dưới field; 403 -> không đủ quyền trong hộp thoại", async () => {
    let mode: 400 | 403 = 400;
    stubFetch((_p, init) => {
      if (!isPatch(init))
        return jsonRes(200, {
          data: makeAdminOrder({ status: "PROCESSING", allowedTransitions: ["SHIPPING"] }),
        });
      return mode === 400
        ? errRes(400, "VALIDATION_ERROR", "x", [
            { field: "trackingNumber", message: "Mã vận đơn không hợp lệ (máy chủ)" },
          ])
        : errRes(403, "FORBIDDEN");
    });
    render(<AdminOrderDetail code={CODE} />);
    const dialog = await openAction("Giao cho vận chuyển");
    const user = userEvent.setup();
    await user.type(within(dialog).getByLabelText(/Mã vận đơn/), "ABC1");
    await user.click(within(dialog).getByRole("button", { name: "Giao cho vận chuyển" }));
    expect(
      await within(dialog).findByText("Mã vận đơn không hợp lệ (máy chủ)"),
    ).toBeInTheDocument();

    mode = 403;
    await user.click(within(dialog).getByRole("button", { name: "Giao cho vận chuyển" }));
    expect(await within(dialog).findByText(/không đủ quyền/)).toBeInTheDocument();
  });

  it("Escape đóng hộp thoại", async () => {
    stubFetch(() => jsonRes(200, { data: makeAdminOrder() }));
    render(<AdminOrderDetail code={CODE} />);
    await openAction("Xác nhận đơn");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("404 -> 'Không tìm thấy đơn hàng'", async () => {
    stubFetch(() => errRes(404, "NOT_FOUND"));
    render(<AdminOrderDetail code="BB-000000-XXXX" />);
    expect(await screen.findByText("Không tìm thấy đơn hàng")).toBeInTheDocument();
  });
});
