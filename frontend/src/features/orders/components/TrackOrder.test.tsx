import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { makeTrackedOrder } from "../testing";
import { TrackOrder } from "./TrackOrder";

let search = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function stubFetch(routes: Record<string, Handler>) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const path = input.replace("/api/v1", "");
    const key = `${init.method ?? "GET"} ${path.split("?")[0]}`;
    const h = routes[key];
    if (!h) throw new Error(`Chưa mock: ${key}`);
    return h(path, init);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

const CODE = "BB-261110-K7QP";

beforeEach(() => {
  search = "";
  tokenStore.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  tokenStore.clear();
});

async function search_(u: ReturnType<typeof userEvent.setup>, code = CODE, phone = "0901 234 567") {
  const codeBox = screen.getByLabelText("Mã đơn hàng");
  await u.clear(codeBox);
  if (code) await u.type(codeBox, code);
  await u.type(screen.getByLabelText("Số điện thoại đặt hàng"), phone);
  await u.click(screen.getByRole("button", { name: "Tra cứu" }));
}

describe("TrackOrder", () => {
  it("prefill mã từ ?code= và tự viết hoa khi gõ", async () => {
    search = "code=bb-261110-k7qp";
    const u = userEvent.setup();
    render(<TrackOrder />);
    expect(screen.getByLabelText("Mã đơn hàng")).toHaveValue(CODE);
    await u.clear(screen.getByLabelText("Mã đơn hàng"));
    await u.type(screen.getByLabelText("Mã đơn hàng"), "bb-1");
    expect(screen.getByLabelText("Mã đơn hàng")).toHaveValue("BB-1");
  });

  it("validate: mã sai định dạng, SĐT sai -> lỗi field, không gọi API", async () => {
    const mock = stubFetch({});
    const u = userEvent.setup();
    render(<TrackOrder />);
    await search_(u, "BB-123456-0000", "123");
    expect(screen.getByText(/Mã đơn không đúng định dạng/)).toBeInTheDocument();
    expect(screen.getByText(/Số điện thoại không hợp lệ/)).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();
  });

  it("gọi /orders/track với SĐT đã chuẩn hóa, bỏ Bearer, hiển thị kết quả", async () => {
    tokenStore.set("tok");
    const mock = stubFetch({
      "GET /orders/track": () =>
        jsonRes(200, {
          data: makeTrackedOrder({
            status: "SHIPPING",
            canCancel: false,
            trackingNumber: "GHN123",
            carrier: "GHN",
            history: [
              { fromStatus: null, toStatus: "PENDING", createdAt: "2026-11-10T08:30:00.000Z" },
              {
                fromStatus: "PENDING",
                toStatus: "SHIPPING",
                createdAt: "2026-11-11T08:30:00.000Z",
              },
            ],
          }),
        }),
    });
    const u = userEvent.setup();
    render(<TrackOrder />);
    await search_(u);
    expect(await screen.findByText("GHN123 (GHN)")).toBeInTheDocument();
    const [url, init] = mock.mock.calls[0]!;
    expect(String(url)).toBe(`/api/v1/orders/track?code=${CODE}&phone=0901234567`);
    expect((init as RequestInit).headers).not.toHaveProperty("Authorization");
    expect(screen.getAllByText("Đang giao").length).toBeGreaterThan(0);
    expect(screen.getByText("Phường Sài Gòn, Thành phố Hồ Chí Minh")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hủy đơn" })).not.toBeInTheDocument();
  });

  it("404 -> thông báo không tìm thấy", async () => {
    stubFetch({ "GET /orders/track": () => errRes(404, "NOT_FOUND") });
    const u = userEvent.setup();
    render(<TrackOrder />);
    await search_(u);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không tìm thấy đơn hàng. Vui lòng kiểm tra lại mã đơn và số điện thoại.",
    );
  });

  it("429 -> thử lại sau N giây; 400 -> lỗi field", async () => {
    let n = 0;
    stubFetch({
      "GET /orders/track": () =>
        ++n === 1
          ? errRes(429, "RATE_LIMITED", "x", { retryAfterSec: 42 })
          : errRes(400, "VALIDATION_ERROR", "x", [
              { field: "phone", message: "SĐT sai từ server" },
            ]),
    });
    const u = userEvent.setup();
    render(<TrackOrder />);
    await search_(u);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Bạn thao tác quá nhanh, thử lại sau 42 giây",
    );
    await u.click(screen.getByRole("button", { name: "Tra cứu" }));
    expect(await screen.findByText("SĐT sai từ server")).toBeInTheDocument();
  });

  it("canCancel: Hủy đơn -> cancelGuestOrder (skipAuth, phone, reason) -> hiển thị response rút gọn và báo thành công", async () => {
    tokenStore.set("tok");
    const mock = stubFetch({
      "GET /orders/track": () => jsonRes(200, { data: makeTrackedOrder() }),
      [`POST /orders/${CODE}/cancel`]: () =>
        jsonRes(200, {
          data: makeTrackedOrder({
            status: "CANCELLED",
            canCancel: false,
            cancelReason: "Đặt nhầm",
          }),
        }),
    });
    const u = userEvent.setup();
    render(<TrackOrder />);
    await search_(u);
    await u.click(await screen.findByRole("button", { name: "Hủy đơn" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    await u.type(screen.getByLabelText(/Lý do hủy/), "Đặt nhầm");
    await u.click(screen.getByRole("button", { name: "Xác nhận hủy đơn" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Đã hủy đơn hàng thành công.")).toBeInTheDocument();
    expect(screen.getByText("Đặt nhầm", { selector: "dd" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hủy đơn" })).not.toBeInTheDocument();

    expect(
      mock.mock.calls.filter(
        ([, i]) => !(i as RequestInit)?.method || (i as RequestInit).method === "GET",
      ),
    ).toHaveLength(1);
    const cancelCall = mock.mock.calls.find(([, i]) => (i as RequestInit).method === "POST")!;
    const init = cancelCall[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ reason: "Đặt nhầm", phone: "0901234567" });
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("canCancel=false nhưng trạng thái còn hủy được (đơn tài khoản) -> gợi ý đăng nhập", async () => {
    stubFetch({
      "GET /orders/track": () =>
        jsonRes(200, { data: makeTrackedOrder({ status: "CONFIRMED", canCancel: false }) }),
    });
    const u = userEvent.setup();
    render(<TrackOrder />);
    await search_(u);
    expect(await screen.findByText(/Đơn này được đặt bằng tài khoản/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đơn hàng của tôi" })).toHaveAttribute(
      "href",
      "/tai-khoan/don-hang",
    );
    expect(screen.queryByRole("button", { name: "Hủy đơn" })).not.toBeInTheDocument();
  });

  it("không hiện gợi ý khi đơn đã giao hoặc khi canCancel=true", async () => {
    stubFetch({
      "GET /orders/track": () =>
        jsonRes(200, { data: makeTrackedOrder({ status: "SHIPPING", canCancel: false }) }),
    });
    const u = userEvent.setup();
    render(<TrackOrder />);
    await search_(u);
    await screen.findByLabelText("Kết quả tra cứu");
    expect(screen.queryByText(/Đơn này được đặt bằng tài khoản/)).not.toBeInTheDocument();
  });

  it("canPay: dùng expiresAt của đơn để đếm ngược 'Thanh toán lại'", async () => {
    stubFetch({
      "GET /orders/track": () =>
        jsonRes(200, {
          data: makeTrackedOrder({
            status: "PENDING_PAYMENT",
            paymentMethod: "VNPAY",
            canPay: true,
            expiresAt: new Date(Date.now() + 125_000).toISOString(),
          }),
        }),
    });
    const u = userEvent.setup();
    render(<TrackOrder />);
    await search_(u);
    expect(await screen.findByRole("timer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thanh toán lại" })).toBeInTheDocument();
  });

  it("hủy lỗi INVALID_STATUS_TRANSITION -> hiển thị trong hộp thoại", async () => {
    stubFetch({
      "GET /orders/track": () => jsonRes(200, { data: makeTrackedOrder() }),
      [`POST /orders/${CODE}/cancel`]: () => errRes(409, "INVALID_STATUS_TRANSITION"),
    });
    const u = userEvent.setup();
    render(<TrackOrder />);
    await search_(u);
    await u.click(await screen.findByRole("button", { name: "Hủy đơn" }));
    await u.click(screen.getByRole("button", { name: "Xác nhận hủy đơn" }));
    expect(
      await screen.findByText("Đơn hàng không thể hủy ở trạng thái hiện tại"),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
