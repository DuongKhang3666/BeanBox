import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeAddress, makeUser, errRes, jsonRes } from "@/features/account/testing";
import type { CartContextValue } from "@/features/cart/CartProvider";
import { makeCart, makeCartItem } from "@/features/cart/testing";
import { makeOrder, makeQuote, makeShippingOption } from "@/features/orders/testing";
import { ApiError } from "@/lib/api/errors";
import { LAST_ORDER_KEY } from "./CheckoutForm";
import { CheckoutView } from "./CheckoutView";

const push = vi.fn();
let auth: { status: string; user: unknown };
let cartValue: CartContextValue;

const assign = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/features/cart/CartProvider", () => ({ useCart: () => cartValue }));
vi.mock("@/features/account/components/LocationFields", () => ({
  LOCATION_FIELDS: ["provinceCode", "wardCode"],
  LocationFields: ({
    onChange,
    errors,
  }: {
    onChange: (v: { provinceCode: string; wardCode: string }) => void;
    errors: Record<string, string>;
  }) => (
    <div>
      <button type="button" onClick={() => onChange({ provinceCode: "79", wardCode: "26740" })}>
        Chọn Phường Sài Gòn
      </button>
      <span>{errors.provinceCode}</span>
    </div>
  ),
}));

function baseCart(over: Partial<CartContextValue> = {}): CartContextValue {
  return {
    cart: makeCart(),
    status: "ready",
    error: null,
    notice: null,
    pending: { adding: false, clearing: false, coupon: false, itemIds: new Set() },
    addItem: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    clearCart: vi.fn(),
    applyCoupon: vi.fn(),
    removeCoupon: vi.fn(async () => makeCart()),
    reload: vi.fn(),
    dismissNotice: vi.fn(),
    miniCartOpen: false,
    openMiniCart: vi.fn(),
    closeMiniCart: vi.fn(),
    ...over,
  };
}

type Handler = (body: unknown, init: RequestInit) => Response | Promise<Response>;

function stubFetch(routes: Record<string, Handler>) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const key = `${init.method ?? "GET"} ${input.replace("/api/v1", "")}`;
    const h = routes[key];
    if (!h) throw new Error(`Chưa mock: ${key}`);
    return h(init.body ? JSON.parse(init.body as string) : undefined, init);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function callsOf(mock: ReturnType<typeof stubFetch>, key: string) {
  return mock.mock.calls.filter(
    ([input, init]) =>
      `${(init as RequestInit)?.method ?? "GET"} ${String(input).replace("/api/v1", "")}` === key,
  );
}
const bodyOfCall = (c: unknown[]) => JSON.parse((c[1] as RequestInit).body as string);
const keyOfCall = (c: unknown[]) =>
  ((c[1] as RequestInit).headers as Record<string, string>)["Idempotency-Key"];

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

beforeEach(() => {
  push.mockReset();
  assign.mockReset();
  vi.stubGlobal("location", { ...window.location, assign });
  sessionStorage.clear();
  auth = { status: "anonymous", user: null };
  cartValue = baseCart();
});
afterEach(() => vi.unstubAllGlobals());

async function fillGuest(u: ReturnType<typeof userEvent.setup>) {
  await u.type(screen.getByLabelText("Email"), "an@example.com");
  await u.type(screen.getByLabelText("Số điện thoại"), "0901234567");
  await u.type(screen.getByLabelText("Họ và tên người nhận"), "Nguyễn Văn An");
  await u.type(screen.getByLabelText("Số điện thoại người nhận"), "0901 234 567");
  await u.type(screen.getByLabelText("Địa chỉ cụ thể (số nhà, đường)"), "12 Lê Lợi");
  await u.click(screen.getByRole("button", { name: "Chọn Phường Sài Gòn" }));
}

const submitBtn = () => screen.getByRole("button", { name: /^Đặt hàng/ });

describe("CheckoutView – trạng thái giỏ", () => {
  it("giỏ đang tải -> skeleton", () => {
    cartValue = baseCart({ cart: null, status: "loading" });
    render(<CheckoutView />);
    expect(screen.getByLabelText("Đang tải trang thanh toán")).toBeInTheDocument();
  });

  it("lỗi tải giỏ -> ErrorState, thử lại gọi reload", async () => {
    cartValue = baseCart({
      cart: null,
      status: "error",
      error: new ApiError(0, "NETWORK_ERROR", "x"),
    });
    render(<CheckoutView />);
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(cartValue.reload).toHaveBeenCalled();
  });

  it("giỏ rỗng -> EmptyState có link /gio-hang", () => {
    cartValue = baseCart({ cart: makeCart({ items: [] }) });
    render(<CheckoutView />);
    expect(screen.getByText("Giỏ hàng của bạn đang trống")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về giỏ hàng" })).toHaveAttribute("href", "/gio-hang");
  });

  it("giỏ có dòng chặn -> thông báo + Quay lại giỏ hàng", () => {
    cartValue = baseCart({
      cart: makeCart({ items: [makeCartItem({ warnings: ["OUT_OF_STOCK"] })] }),
    });
    render(<CheckoutView />);
    expect(screen.getByRole("alert")).toHaveTextContent("hết hàng");
    expect(screen.getByRole("link", { name: "Quay lại giỏ hàng" })).toHaveAttribute(
      "href",
      "/gio-hang",
    );
  });
});

describe("CheckoutView – khách vãng lai", () => {
  it("gọi quote với wardCode + contactEmail, đặt hàng gửi đúng body và Idempotency-Key", async () => {
    const order = makeOrder();
    const mock = stubFetch({
      "POST /checkout/quote": () => jsonRes(200, { data: makeQuote() }),
      "POST /orders": () => jsonRes(201, { data: order }),
    });
    const u = userEvent.setup();
    render(<CheckoutView />);
    expect(screen.getByText("Chọn địa chỉ để tính phí vận chuyển")).toBeInTheDocument();
    await fillGuest(u);

    // Tiêu chuẩn được chọn sẵn, COD chọn sẵn, VNPay/Stripe bị khóa.
    expect(await screen.findByRole("radio", { name: /Tiêu chuẩn/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /COD/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /VNPay/ })).toBeDisabled();
    expect(screen.getAllByText("Chưa khả dụng")).toHaveLength(2);
    const quotes = callsOf(mock, "POST /checkout/quote").map(bodyOfCall);
    expect(quotes.at(-1)).toEqual({
      provinceCode: "79",
      wardCode: "26740",
      contactEmail: "an@example.com",
    });

    await u.type(screen.getByLabelText(/Ghi chú cho đơn hàng/), "Gọi trước khi giao");
    await u.click(screen.getByRole("checkbox", { name: /điều khoản/ }));
    await waitFor(() => expect(submitBtn()).toHaveTextContent("350.000₫"));
    await u.click(submitBtn());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dat-hang-thanh-cong/BB-261110-K7QP"));
    const [call] = callsOf(mock, "POST /orders");
    expect(bodyOfCall(call!)).toEqual({
      contact: { email: "an@example.com", phone: "0901234567" },
      shippingAddress: {
        fullName: "Nguyễn Văn An",
        phone: "0901234567",
        provinceCode: "79",
        wardCode: "26740",
        line1: "12 Lê Lợi",
      },
      shippingMethod: "STANDARD",
      paymentMethod: "COD",
      note: "Gọi trước khi giao",
      acceptTerms: true,
      expectedTotal: 350000,
    });
    expect(keyOfCall(call!)).toMatch(UUID_V4);
    expect(JSON.parse(sessionStorage.getItem(LAST_ORDER_KEY)!).code).toBe(order.code);
    expect(cartValue.reload).toHaveBeenCalled();
  });

  it("validate client: gửi trống -> lỗi từng field, không gọi POST /orders", async () => {
    const mock = stubFetch({});
    const u = userEvent.setup();
    render(<CheckoutView />);
    await u.click(submitBtn());
    expect(screen.getByText("Vui lòng nhập email")).toBeInTheDocument();
    expect(screen.getByText("Vui lòng nhập số điện thoại")).toBeInTheDocument();
    expect(screen.getByText("Vui lòng nhập họ tên")).toBeInTheDocument();
    expect(screen.getByText("Vui lòng chọn tỉnh/thành")).toBeInTheDocument();
    expect(screen.getByText("Vui lòng đồng ý với điều khoản mua hàng")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(mock).not.toHaveBeenCalled();
  });

  it("lỗi mạng rồi bấm lại -> CÙNG Idempotency-Key", async () => {
    let n = 0;
    const mock = stubFetch({
      "POST /checkout/quote": () => jsonRes(200, { data: makeQuote() }),
      "POST /orders": () => {
        n += 1;
        if (n === 1) throw new TypeError("network down");
        return jsonRes(201, { data: makeOrder() });
      },
    });
    const u = userEvent.setup();
    render(<CheckoutView />);
    await fillGuest(u);
    await u.click(screen.getByRole("checkbox", { name: /điều khoản/ }));
    await waitFor(() => expect(submitBtn()).toHaveTextContent("350.000₫"));
    await u.click(submitBtn());
    expect(await screen.findByText(/Không thể kết nối/)).toBeInTheDocument();
    await u.click(submitBtn());
    await waitFor(() => expect(push).toHaveBeenCalled());
    const calls = callsOf(mock, "POST /orders");
    expect(calls).toHaveLength(2);
    expect(keyOfCall(calls[0]!)).toBe(keyOfCall(calls[1]!));
  });

  it("đổi payload sau lỗi 409 -> key MỚI", async () => {
    let n = 0;
    const mock = stubFetch({
      "POST /checkout/quote": () => jsonRes(200, { data: makeQuote() }),
      "POST /orders": () => {
        n += 1;
        return n === 1
          ? errRes(409, "IDEMPOTENCY_CONFLICT", "trùng")
          : jsonRes(201, { data: makeOrder() });
      },
    });
    const u = userEvent.setup();
    render(<CheckoutView />);
    await fillGuest(u);
    await u.click(screen.getByRole("checkbox", { name: /điều khoản/ }));
    await waitFor(() => expect(submitBtn()).toHaveTextContent("350.000₫"));
    await u.click(submitBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent("trùng lặp");
    await u.type(screen.getByLabelText(/Ghi chú cho đơn hàng/), "Đổi ghi chú");
    await u.click(submitBtn());
    await waitFor(() => expect(push).toHaveBeenCalled());
    const calls = callsOf(mock, "POST /orders");
    expect(keyOfCall(calls[0]!)).not.toBe(keyOfCall(calls[1]!));
  });

  it("PRICE_CHANGED: cập nhật tóm tắt từ details.quote và báo tổng mới", async () => {
    const newQuote = makeQuote({
      shippingOptions: [makeShippingOption({ grandTotal: 332000, payableFee: 2000, fee: 2000 })],
    });
    const mock = stubFetch({
      "POST /checkout/quote": () => jsonRes(200, { data: makeQuote() }),
      "POST /orders": () =>
        errRes(409, "PRICE_CHANGED", "x", {
          expectedTotal: 350000,
          grandTotal: 332000,
          quote: newQuote,
        }),
    });
    const u = userEvent.setup();
    render(<CheckoutView />);
    await fillGuest(u);
    await u.click(screen.getByRole("checkbox", { name: /điều khoản/ }));
    await waitFor(() => expect(submitBtn()).toHaveTextContent("350.000₫"));
    await u.click(submitBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tổng tiền đã thay đổi thành 332.000₫, vui lòng kiểm tra và bấm Đặt hàng lần nữa",
    );
    expect(submitBtn()).toHaveTextContent("332.000₫");
    expect(callsOf(mock, "POST /orders")).toHaveLength(1);
  });

  it("double click chỉ gửi 1 request", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const mock = stubFetch({
      "POST /checkout/quote": () => jsonRes(200, { data: makeQuote() }),
      "POST /orders": async () => {
        await gate;
        return jsonRes(201, { data: makeOrder() });
      },
    });
    const u = userEvent.setup();
    render(<CheckoutView />);
    await fillGuest(u);
    await u.click(screen.getByRole("checkbox", { name: /điều khoản/ }));
    await waitFor(() => expect(submitBtn()).toHaveTextContent("350.000₫"));
    await u.dblClick(submitBtn());
    expect(screen.getByRole("button", { name: /Đang đặt hàng/ })).toBeDisabled();
    release();
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(callsOf(mock, "POST /orders")).toHaveLength(1);
  });

  it("quote có issues -> cảnh báo và chặn đặt hàng", async () => {
    stubFetch({
      "POST /checkout/quote": () =>
        jsonRes(200, {
          data: makeQuote({ issues: [{ variantId: "v1", type: "OUT_OF_STOCK", available: 0 }] }),
        }),
    });
    const u = userEvent.setup();
    render(<CheckoutView />);
    await fillGuest(u);
    expect(await screen.findByText(/hết hàng hoặc không đủ số lượng/)).toBeInTheDocument();
    expect(submitBtn()).toBeDisabled();
  });

  it("VALIDATION_ERROR từ server map vào field", async () => {
    stubFetch({
      "POST /checkout/quote": () => jsonRes(200, { data: makeQuote() }),
      "POST /orders": () =>
        errRes(400, "VALIDATION_ERROR", "x", [
          { field: "contact.phone", message: "SĐT không hợp lệ từ server" },
        ]),
    });
    const u = userEvent.setup();
    render(<CheckoutView />);
    await fillGuest(u);
    await u.click(screen.getByRole("checkbox", { name: /điều khoản/ }));
    await waitFor(() => expect(submitBtn()).toHaveTextContent("350.000₫"));
    await u.click(submitBtn());
    expect(await screen.findByText("SĐT không hợp lệ từ server")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Số điện thoại")).toHaveFocus());
  });

  it("OUT_OF_STOCK: thông báo + reload giỏ + link giỏ hàng; COUPON_INVALID: nút Bỏ mã", async () => {
    let n = 0;
    stubFetch({
      "POST /checkout/quote": () => jsonRes(200, { data: makeQuote() }),
      "POST /orders": () => {
        n += 1;
        return n === 1
          ? errRes(409, "OUT_OF_STOCK", "x", {
              items: [{ variantId: "v1", requested: 2, available: 0 }],
            })
          : errRes(409, "COUPON_INVALID", "x", { reason: "EXPIRED" });
      },
    });
    const u = userEvent.setup();
    render(<CheckoutView />);
    await fillGuest(u);
    await u.click(screen.getByRole("checkbox", { name: /điều khoản/ }));
    await waitFor(() => expect(submitBtn()).toHaveTextContent("350.000₫"));
    await u.click(submitBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent("không đủ số lượng");
    expect(cartValue.reload).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Quay lại giỏ hàng" })).toHaveAttribute(
      "href",
      "/gio-hang",
    );

    await u.click(submitBtn());
    expect(await screen.findByText("Mã giảm giá đã hết hạn.")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Bỏ mã" }));
    expect(cartValue.removeCoupon).toHaveBeenCalled();
  });
});

describe("CheckoutView – mã giảm giá không hợp lệ", () => {
  it("quote có coupon invalid -> cảnh báo, nút Đặt hàng disabled, Bỏ mã gọi removeCoupon", async () => {
    stubFetch({
      "POST /checkout/quote": () =>
        jsonRes(200, {
          data: makeQuote({
            coupon: {
              code: "HETHAN",
              type: "PERCENT",
              discount: 0,
              valid: false,
              invalidReason: "EXPIRED",
            },
          }),
        }),
    });
    const u = userEvent.setup();
    render(<CheckoutView />);
    await fillGuest(u);
    await u.click(screen.getByRole("checkbox", { name: /điều khoản/ }));
    await waitFor(() => expect(submitBtn()).toHaveTextContent("350.000₫"));
    expect(submitBtn()).toBeDisabled();
    expect(await screen.findByRole("alert")).toHaveTextContent("Mã giảm giá đã hết hạn.");
    await u.click(screen.getByRole("button", { name: "Bỏ mã" }));
    expect(cartValue.removeCoupon).toHaveBeenCalled();
  });

  it("coupon invalid MIN_ORDER có minOrder -> hiện số tiền tối thiểu", async () => {
    stubFetch({
      "POST /checkout/quote": () =>
        jsonRes(200, {
          data: makeQuote({
            coupon: {
              code: "BIG20",
              type: "PERCENT",
              discount: 0,
              valid: false,
              invalidReason: "MIN_ORDER",
              minOrder: 200000,
            },
          }),
        }),
    });
    const u = userEvent.setup();
    render(<CheckoutView />);
    await fillGuest(u);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Đơn hàng cần đạt tối thiểu 200.000₫ để dùng mã này.",
    );
  });

  it("checkbox điều khoản có link mở tab mới tới /chinh-sach/dieu-khoan", () => {
    render(<CheckoutView />);
    const link = screen.getByRole("link", { name: "điều khoản mua hàng" });
    expect(link).toHaveAttribute("href", "/chinh-sach/dieu-khoan");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByRole("checkbox", { name: /điều khoản/ })).toBeInTheDocument();
  });
});

describe("CheckoutView – thành viên", () => {
  const A1 = makeAddress({ id: "a1", isDefault: true });
  const A2 = makeAddress({ id: "a2", fullName: "Trần Thị Bình", isDefault: false });

  it("chọn địa chỉ từ sổ: quote theo addressId, đặt hàng gửi addressId và không gửi shippingAddress", async () => {
    auth = { status: "authenticated", user: makeUser() };
    const mock = stubFetch({
      "GET /me/addresses": () => jsonRes(200, { data: [A1, A2] }),
      "POST /checkout/quote": () => jsonRes(200, { data: makeQuote() }),
      "POST /orders": () => jsonRes(201, { data: makeOrder() }),
    });
    const u = userEvent.setup();
    render(<CheckoutView />);
    // Chọn sẵn địa chỉ mặc định
    const first = await screen.findByRole("radio", { name: /Nguyễn Văn An/ });
    expect(first).toBeChecked();
    expect(screen.getByLabelText("Email")).toHaveValue("an@example.com");
    expect(screen.getByLabelText("Email")).toHaveAttribute("readonly");
    await waitFor(() => expect(callsOf(mock, "POST /checkout/quote")).toHaveLength(1));
    expect(bodyOfCall(callsOf(mock, "POST /checkout/quote")[0]!)).toEqual({ addressId: "a1" });

    await u.click(screen.getByRole("radio", { name: /Trần Thị Bình/ }));
    await waitFor(() => expect(callsOf(mock, "POST /checkout/quote")).toHaveLength(2));
    expect(bodyOfCall(callsOf(mock, "POST /checkout/quote")[1]!)).toEqual({ addressId: "a2" });

    await u.click(screen.getByRole("checkbox", { name: /điều khoản/ }));
    await waitFor(() => expect(submitBtn()).toHaveTextContent("350.000₫"));
    await u.click(submitBtn());
    await waitFor(() => expect(push).toHaveBeenCalled());
    const body = bodyOfCall(callsOf(mock, "POST /orders")[0]!);
    expect(body.addressId).toBe("a2");
    expect(body).not.toHaveProperty("shippingAddress");
    expect(body).not.toHaveProperty("contact");
  });

  it("tải sổ địa chỉ lỗi -> thông báo + thử lại", async () => {
    auth = { status: "authenticated", user: makeUser() };
    let n = 0;
    stubFetch({
      "GET /me/addresses": () => {
        n += 1;
        return n === 1 ? errRes(500, "INTERNAL_ERROR") : jsonRes(200, { data: [A1] });
      },
      "POST /checkout/quote": () => jsonRes(200, { data: makeQuote() }),
    });
    const u = userEvent.setup();
    render(<CheckoutView />);
    expect(await screen.findByText("Không tải được sổ địa chỉ.")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("radio", { name: /Nguyễn Văn An/ })).toBeChecked();
  });
});

describe("CheckoutView - thanh toán online", () => {
  const onlineQuote = () =>
    makeQuote({
      paymentMethods: [
        { method: "COD", enabled: true },
        { method: "VNPAY", enabled: true },
        { method: "STRIPE", enabled: false },
      ],
    });
  const onlineOrder = (over = {}) =>
    makeOrder({
      status: "PENDING_PAYMENT",
      paymentMethod: "VNPAY",
      canPay: true,
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      ...over,
    });
  const session = (redirectUrl: string) =>
    jsonRes(200, { data: { redirectUrl, paymentId: "pay1", expiresAt: null } });

  async function chooseVnpayAndSubmit(u: ReturnType<typeof userEvent.setup>) {
    await fillGuest(u);
    const vnpay = await screen.findByRole("radio", { name: /VNPay \(ATM\/QR\/thẻ\)/ });
    await waitFor(() => expect(vnpay).toBeEnabled());
    await u.click(vnpay);
    await u.click(screen.getByRole("checkbox", { name: /điều khoản/ }));
    await waitFor(() => expect(submitBtn()).toHaveTextContent("350.000₫"));
    await u.click(submitBtn());
  }

  it("phương thức tắt hiển thị mờ, chú thích 'Chưa khả dụng' và không chọn được", async () => {
    stubFetch({ "POST /checkout/quote": () => jsonRes(200, { data: onlineQuote() }) });
    const u = userEvent.setup();
    render(<CheckoutView />);
    await fillGuest(u);
    const vnpay = await screen.findByRole("radio", { name: /VNPay/ });
    await waitFor(() => expect(vnpay).toBeEnabled());
    const stripe = screen.getByRole("radio", { name: /Thẻ quốc tế \(Stripe\)/ });
    expect(stripe).toBeDisabled();
    expect(stripe.closest("label")?.className).toContain("opacity-60");
    expect(screen.getAllByText("Chưa khả dụng")).toHaveLength(1);
    await u.click(stripe);
    expect(screen.getByRole("radio", { name: /COD/ })).toBeChecked();
    expect(stripe).not.toBeChecked();
  });

  it("đặt VNPay: lưu đơn vào sessionStorage, gọi create (khách gửi phone) rồi assign redirectUrl https", async () => {
    const order = onlineOrder();
    const mock = stubFetch({
      "POST /checkout/quote": () => jsonRes(200, { data: onlineQuote() }),
      "POST /orders": () => jsonRes(201, { data: order }),
      "POST /payments/vnpay/create": () =>
        session("https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?a=1"),
    });
    const u = userEvent.setup();
    render(<CheckoutView />);
    await chooseVnpayAndSubmit(u);

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?a=1"),
    );
    expect(bodyOfCall(callsOf(mock, "POST /orders")[0]!).paymentMethod).toBe("VNPAY");
    expect(JSON.parse(sessionStorage.getItem(LAST_ORDER_KEY)!).code).toBe(order.code);
    const create = callsOf(mock, "POST /payments/vnpay/create");
    expect(create).toHaveLength(1);
    expect(bodyOfCall(create[0]!)).toEqual({ code: order.code, phone: "0901234567" });
    // Thứ tự: đặt đơn trước, rồi mới tạo phiên.
    const paths = mock.mock.calls.map(([input]) => String(input));
    expect(paths.indexOf("/api/v1/orders")).toBeLessThan(
      paths.indexOf("/api/v1/payments/vnpay/create"),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("đã đăng nhập: create không gửi phone", async () => {
    auth = { status: "authenticated", user: makeUser() };
    const mock = stubFetch({
      "GET /me/addresses": () =>
        jsonRes(200, { data: [makeAddress({ id: "a1", isDefault: true })] }),
      "POST /checkout/quote": () => jsonRes(200, { data: onlineQuote() }),
      "POST /orders": () => jsonRes(201, { data: onlineOrder() }),
      "POST /payments/vnpay/create": () => session("https://sandbox.vnpayment.vn/x"),
    });
    const u = userEvent.setup();
    render(<CheckoutView />);
    const vnpay = await screen.findByRole("radio", { name: /VNPay/ });
    await waitFor(() => expect(vnpay).toBeEnabled());
    await u.click(vnpay);
    await u.click(screen.getByRole("checkbox", { name: /điều khoản/ }));
    await waitFor(() => expect(submitBtn()).toHaveTextContent("350.000₫"));
    await u.click(submitBtn());
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(bodyOfCall(callsOf(mock, "POST /payments/vnpay/create")[0]!)).toEqual({
      code: "BB-261110-K7QP",
    });
  });

  it("redirectUrl http bị chặn: không assign, chuyển trang đơn hàng với thông báo", async () => {
    stubFetch({
      "POST /checkout/quote": () => jsonRes(200, { data: onlineQuote() }),
      "POST /orders": () => jsonRes(201, { data: onlineOrder() }),
      "POST /payments/vnpay/create": () => session("http://evil.example/pay"),
    });
    const u = userEvent.setup();
    render(<CheckoutView />);
    await chooseVnpayAndSubmit(u);
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/dat-hang-thanh-cong/BB-261110-K7QP?pay=failed"),
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([
    [
      "409 PAYMENT_NOT_ALLOWED",
      () => errRes(409, "PAYMENT_NOT_ALLOWED", "x", { reason: "UNAVAILABLE" }),
    ],
    ["503", () => errRes(503, "SERVICE_UNAVAILABLE")],
    [
      "lỗi mạng",
      () => {
        throw new TypeError("network down");
      },
    ],
  ])("lỗi tạo phiên (%s) -> chuyển trang đơn hàng để thanh toán lại", async (_name, fail) => {
    stubFetch({
      "POST /checkout/quote": () => jsonRes(200, { data: onlineQuote() }),
      "POST /orders": () => jsonRes(201, { data: onlineOrder() }),
      "POST /payments/vnpay/create": fail,
    });
    const u = userEvent.setup();
    render(<CheckoutView />);
    await chooseVnpayAndSubmit(u);
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/dat-hang-thanh-cong/BB-261110-K7QP?pay=failed"),
    );
    expect(assign).not.toHaveBeenCalled();
  });
});
