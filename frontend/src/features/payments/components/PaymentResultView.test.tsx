import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import { LAST_ORDER_KEY } from "@/features/checkout/components/CheckoutForm";
import { makeOrder } from "@/features/orders/testing";
import type { PaymentResult } from "@/types/payment";
import { PaymentResultView } from "./PaymentResultView";

const CODE = "BB-261110-K7QP";
const replace = vi.fn();
const assign = vi.fn();
let search = "";
let auth: { status: string };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => auth }));

const inFuture = (ms: number) => new Date(Date.now() + ms).toISOString();

function result(over: Partial<PaymentResult> = {}): PaymentResult {
  return {
    orderCode: CODE,
    result: "SUCCEEDED",
    orderStatus: "CONFIRMED",
    paymentStatus: "PAID",
    canPay: false,
    expiresAt: null,
    ...over,
  };
}

type Route = (url: string, init: RequestInit) => Response;

function stubFetch(route: Route) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) =>
    route(input.replace("/api/v1", ""), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

const VNP =
  "provider=vnpay&vnp_Amount=35000000&vnp_ResponseCode=00&vnp_TransactionStatus=02&vnp_TxnRef=p1&vnp_SecureHash=abc123&utm_x=1";

beforeEach(() => {
  replace.mockReset();
  assign.mockReset();
  sessionStorage.clear();
  auth = { status: "anonymous" };
  search = "";
  vi.stubGlobal("location", { ...window.location, assign });
});
afterEach(() => vi.unstubAllGlobals());

describe("PaymentResultView - VNPay", () => {
  it("chỉ chuyển khóa vnp_*, dọn URL, và hiển thị THEO RESPONSE (URL báo 00 nhưng server trả FAILED)", async () => {
    search = VNP.replace("vnp_TransactionStatus=02", "vnp_TransactionStatus=00");
    const mock = stubFetch(() =>
      jsonRes(200, {
        data: result({
          result: "FAILED",
          orderStatus: "PENDING_PAYMENT",
          paymentStatus: "FAILED",
          canPay: true,
          expiresAt: inFuture(600_000),
        }),
      }),
    );
    render(<PaymentResultView />);
    expect(screen.getByText("Đang xác nhận thanh toán...")).toBeInTheDocument();

    expect(await screen.findByText("Thanh toán chưa thành công")).toBeInTheDocument();
    expect(screen.queryByText("Thanh toán thành công")).not.toBeInTheDocument();

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method ?? "GET").toBe("GET");
    expect(url.startsWith("/api/v1/payments/vnpay/return?")).toBe(true);
    const sent = new URLSearchParams(url.split("?")[1]);
    expect([...sent.keys()].sort()).toEqual([
      "vnp_Amount",
      "vnp_ResponseCode",
      "vnp_SecureHash",
      "vnp_TransactionStatus",
      "vnp_TxnRef",
    ]);
    expect(sent.get("vnp_ResponseCode")).toBe("00");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();

    // Thanh địa chỉ không còn vnp_* (không lưu chữ ký trong lịch sử).
    expect(replace).toHaveBeenNthCalledWith(1, "/thanh-toan/ket-qua?provider=vnpay");
    expect(replace).toHaveBeenLastCalledWith(`/thanh-toan/ket-qua?provider=vnpay&code=${CODE}`);
    for (const [u] of replace.mock.calls) expect(String(u)).not.toContain("vnp_");
  });

  it("SUCCEEDED: thành công, mã đơn, link tra cứu cho khách", async () => {
    search = VNP;
    stubFetch(() => jsonRes(200, { data: result() }));
    render(<PaymentResultView />);
    expect(await screen.findByText("Thanh toán thành công")).toBeInTheDocument();
    expect(screen.getByTestId("order-code")).toHaveTextContent(CODE);
    expect(screen.getByRole("link", { name: "Tra cứu đơn hàng" })).toHaveAttribute(
      "href",
      `/tra-cuu-don-hang?code=${CODE}`,
    );
  });

  it("SUCCEEDED: người dùng đăng nhập -> link tới đơn trong tài khoản", async () => {
    auth = { status: "authenticated" };
    search = VNP;
    stubFetch(() => jsonRes(200, { data: result() }));
    render(<PaymentResultView />);
    expect(await screen.findByRole("link", { name: "Xem đơn hàng" })).toHaveAttribute(
      "href",
      `/tai-khoan/don-hang/${CODE}`,
    );
  });

  it("400 chữ ký sai -> không xác minh được kết quả + link tra cứu", async () => {
    search = VNP;
    stubFetch(() => errRes(400, "PAYMENT_SIGNATURE_INVALID", "x"));
    render(<PaymentResultView />);
    expect(await screen.findByText("Không xác minh được kết quả thanh toán")).toBeInTheDocument();
    expect(screen.queryByText("Thanh toán thành công")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tra cứu đơn hàng" })).toHaveAttribute(
      "href",
      "/tra-cuu-don-hang",
    );
  });

  it("lỗi mạng -> cho thử lại và gọi lại với cùng dữ liệu", async () => {
    search = VNP;
    let n = 0;
    const mock = stubFetch(() =>
      ++n === 1 ? errRes(503, "SERVICE_UNAVAILABLE") : jsonRes(200, { data: result() }),
    );
    render(<PaymentResultView />);
    await userEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Thanh toán thành công")).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls[1]?.[0]).toBe(mock.mock.calls[0]?.[0]);
  });

  it("không còn tham số vnp_* (tải lại trang) -> không gọi API, hướng dẫn tra cứu", () => {
    search = `provider=vnpay&code=${CODE}`;
    const mock = stubFetch(() => jsonRes(500, {}));
    render(<PaymentResultView />);
    expect(screen.getByText("Không xác định được kết quả thanh toán")).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("PaymentResultView - Stripe", () => {
  it("session_id -> POST /payments/stripe/sync với sessionId", async () => {
    search = "provider=stripe&session_id=cs_test_a1B2c3";
    const mock = stubFetch(() => jsonRes(200, { data: result() }));
    render(<PaymentResultView />);
    expect(await screen.findByText("Thanh toán thành công")).toBeInTheDocument();
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/payments/stripe/sync");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ sessionId: "cs_test_a1B2c3" });
    expect(replace).toHaveBeenNthCalledWith(1, "/thanh-toan/ket-qua?provider=stripe");
    expect(replace).toHaveBeenLastCalledWith(`/thanh-toan/ket-qua?provider=stripe&code=${CODE}`);
  });

  it("session_id sai định dạng -> không gọi API", () => {
    search = "provider=stripe&session_id=../../x";
    const mock = stubFetch(() => jsonRes(500, {}));
    render(<PaymentResultView />);
    expect(screen.getByText("Không xác định được kết quả thanh toán")).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();
  });

  it("cancelled=1 -> 'Bạn đã hủy thanh toán', không gọi API xác nhận, URL chỉ còn provider + code", () => {
    search = `provider=stripe&cancelled=1&code=${CODE}`;
    const mock = stubFetch(() => jsonRes(500, {}));
    render(<PaymentResultView />);
    expect(screen.getByText("Bạn đã hủy thanh toán")).toBeInTheDocument();
    expect(screen.getByTestId("order-code")).toHaveTextContent(CODE);
    expect(mock).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith(`/thanh-toan/ket-qua?provider=stripe&code=${CODE}`);
  });
});

describe("PaymentResultView - thanh toán lại / hết hạn", () => {
  const failed = (over: Partial<PaymentResult> = {}) =>
    result({
      result: "FAILED",
      orderStatus: "PENDING_PAYMENT",
      paymentStatus: "FAILED",
      canPay: true,
      expiresAt: inFuture(600_000),
      ...over,
    });

  it("còn hạn: đồng hồ đếm ngược và nút Thanh toán lại", async () => {
    search = VNP;
    stubFetch(() => jsonRes(200, { data: failed({ expiresAt: inFuture(125_000) }) }));
    render(<PaymentResultView />);
    expect(await screen.findByRole("button", { name: "Thanh toán lại" })).toBeInTheDocument();
    expect(screen.getByRole("timer").textContent).toMatch(/^0[12]:\d\d$/);
  });

  it("khách có SĐT trong sessionStorage (khớp mã): thanh toán lại gửi phone đó, không hỏi SĐT", async () => {
    search = VNP;
    sessionStorage.setItem(
      LAST_ORDER_KEY,
      JSON.stringify(
        makeOrder({ paymentMethod: "VNPAY", contact: { email: "a@b.vn", phone: "0912345678" } }),
      ),
    );
    const mock = stubFetch((url) =>
      url.startsWith("/payments/vnpay/return")
        ? jsonRes(200, { data: failed() })
        : jsonRes(200, {
            data: {
              redirectUrl: "https://sandbox.vnpayment.vn/x",
              paymentId: "p2",
              expiresAt: null,
            },
          }),
    );
    render(<PaymentResultView />);
    await userEvent.click(await screen.findByRole("button", { name: "Thanh toán lại" }));
    expect(screen.queryByLabelText("Số điện thoại đặt hàng")).not.toBeInTheDocument();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://sandbox.vnpayment.vn/x"));
    const [url, init] = mock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/payments/vnpay/create");
    expect(JSON.parse(init.body as string)).toEqual({ code: CODE, phone: "0912345678" });
  });

  it("sessionStorage của đơn khác mã -> phải nhập SĐT; SĐT sai bị chặn, đúng thì chuẩn hóa rồi gửi", async () => {
    search = VNP;
    sessionStorage.setItem(
      LAST_ORDER_KEY,
      JSON.stringify(
        makeOrder({ code: "BB-261110-AAAA", contact: { email: "a@b.vn", phone: "0912345678" } }),
      ),
    );
    const mock = stubFetch((url) =>
      url.startsWith("/payments/vnpay/return")
        ? jsonRes(200, { data: failed() })
        : jsonRes(200, {
            data: {
              redirectUrl: "https://sandbox.vnpayment.vn/x",
              paymentId: "p2",
              expiresAt: null,
            },
          }),
    );
    const u = userEvent.setup();
    render(<PaymentResultView />);
    const pay = await screen.findByRole("button", { name: "Thanh toán lại" });

    await u.click(pay);
    expect(screen.getByText("Vui lòng nhập số điện thoại đặt hàng")).toBeInTheDocument();
    await u.type(screen.getByLabelText("Số điện thoại đặt hàng"), "12345");
    await u.click(pay);
    expect(screen.getByText(/Số điện thoại không hợp lệ/)).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(1); // chỉ lần xác nhận ban đầu

    const input = screen.getByLabelText("Số điện thoại đặt hàng");
    await u.clear(input);
    await u.type(input, "+84 901.234.567");
    await u.click(pay);
    await waitFor(() => expect(assign).toHaveBeenCalled());
    const [, init] = mock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ code: CODE, phone: "0901234567" });
  });

  it("đã đăng nhập: không hỏi SĐT, không gửi phone", async () => {
    auth = { status: "authenticated" };
    search = "provider=stripe&session_id=cs_test_zz";
    const mock = stubFetch((url) =>
      url.startsWith("/payments/stripe/sync")
        ? jsonRes(200, { data: failed() })
        : jsonRes(200, {
            data: {
              redirectUrl: "https://checkout.stripe.com/c/1",
              paymentId: "p2",
              expiresAt: null,
            },
          }),
    );
    render(<PaymentResultView />);
    await userEvent.click(await screen.findByRole("button", { name: "Thanh toán lại" }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    const [url, init] = mock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/payments/stripe/create-session");
    expect(JSON.parse(init.body as string)).toEqual({ code: CODE });
  });

  it("đơn đã quá hạn (canPay=false, CANCELLED) -> thông báo quá hạn + link tra cứu, không có nút", async () => {
    search = VNP;
    stubFetch(() =>
      jsonRes(200, {
        data: failed({ orderStatus: "CANCELLED", canPay: false, expiresAt: null }),
      }),
    );
    render(<PaymentResultView />);
    expect(
      await screen.findByText("Đơn hàng đã quá hạn thanh toán và sẽ bị hủy"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thanh toán lại" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tra cứu đơn hàng" })).toBeInTheDocument();
  });

  it("đang xem thì hết hạn -> chuyển sang thông báo quá hạn", async () => {
    search = VNP;
    stubFetch(() => jsonRes(200, { data: failed({ expiresAt: inFuture(1200) }) }));
    render(<PaymentResultView />);
    expect(await screen.findByRole("button", { name: "Thanh toán lại" })).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Đơn hàng đã quá hạn thanh toán và sẽ bị hủy",
        { selector: "h1" },
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thanh toán lại" })).not.toBeInTheDocument();
  });

  it("PENDING còn hạn: vẫn cho thanh toán lại với lời nhắc đợi", async () => {
    search = VNP;
    stubFetch(() => jsonRes(200, { data: failed({ result: "PENDING", paymentStatus: "UNPAID" }) }));
    render(<PaymentResultView />);
    expect(await screen.findByText(/chưa nhận được kết quả giao dịch/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thanh toán lại" })).toBeInTheDocument();
  });
});
