import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeAddress, makeUser } from "@/features/account/testing";
import type { CartContextValue } from "@/features/cart/CartProvider";
import { ApiError } from "@/lib/api/errors";
import { NEW_ADDRESS, useCheckoutAddress } from "./useCheckoutAddress";
import { useCheckoutCaptcha } from "./useCheckoutCaptcha";
import { useCheckoutSubmit, type CheckoutSubmitInput } from "./useCheckoutSubmit";
import { useCouponRemoval } from "./useCouponRemoval";

const push = vi.fn();
let cartValue: Pick<CartContextValue, "reload" | "removeCoupon" | "pending">;
const listAddresses = vi.fn();
const placeOrder = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/features/cart/CartProvider", () => ({ useCart: () => cartValue }));
vi.mock("@/features/account/api", () => ({ listAddresses: () => listAddresses() }));
vi.mock("@/features/orders/api", () => ({
  placeOrder: (...a: unknown[]) => placeOrder(...a),
}));

beforeEach(() => {
  push.mockReset();
  placeOrder.mockReset();
  listAddresses.mockReset();
  sessionStorage.clear();
  cartValue = {
    reload: vi.fn(),
    removeCoupon: vi.fn(async () => undefined) as unknown as CartContextValue["removeCoupon"],
    pending: { adding: false, clearing: false, coupon: false, itemIds: new Set() },
  };
});
afterEach(() => vi.unstubAllGlobals());

describe("useCheckoutAddress", () => {
  it("khách vãng lai luôn hiện form nhập tay, không có địa chỉ đã chọn", () => {
    const { result } = renderHook(() => useCheckoutAddress(false, null));
    expect(result.current.showForm).toBe(true);
    expect(result.current.useSaved).toBe(false);
    expect(result.current.addressId).toBeNull();
    expect(listAddresses).not.toHaveBeenCalled();
  });

  it("khách đăng nhập: mặc định chọn địa chỉ mặc định; chọn địa chỉ khác thì hiện form", async () => {
    const a1 = makeAddress({ id: "a1", isDefault: false });
    const a2 = makeAddress({ id: "a2", isDefault: true });
    listAddresses.mockResolvedValue([a1, a2]);
    const user = makeUser({ fullName: "Lan", phone: "0901234567" });
    const { result } = renderHook(() => useCheckoutAddress(true, user));
    expect(result.current.shipName).toBe("Lan");
    await waitFor(() => expect(result.current.useSaved).toBe(true));
    expect(result.current.addressId).toBe("a2");
    expect(result.current.showForm).toBe(false);

    act(() => result.current.setPickedId("a1"));
    expect(result.current.addressId).toBe("a1");

    act(() => result.current.setPickedId(NEW_ADDRESS));
    expect(result.current.useSaved).toBe(false);
    expect(result.current.addressId).toBeNull();
    expect(result.current.showForm).toBe(true);
  });

  it("sổ địa chỉ trống thì hiện form nhập tay", async () => {
    listAddresses.mockResolvedValue([]);
    const { result } = renderHook(() => useCheckoutAddress(true, makeUser()));
    await waitFor(() => expect(result.current.showForm).toBe(true));
    expect(result.current.addressId).toBeNull();
  });
});

describe("useCheckoutCaptcha", () => {
  it("chỉ cần captcha với khách vãng lai khi cấu hình bật", () => {
    const cfg = { provider: "turnstile", siteKey: "k" } as never;
    expect(renderHook(() => useCheckoutCaptcha(false, cfg)).result.current.needCaptcha).toBe(true);
    expect(renderHook(() => useCheckoutCaptcha(true, cfg)).result.current.needCaptcha).toBe(false);
    expect(renderHook(() => useCheckoutCaptcha(false, null)).result.current.needCaptcha).toBe(
      false,
    );
  });
});

describe("useCouponRemoval", () => {
  it("bỏ mã thành công thì xóa thông báo lỗi", async () => {
    const setProblem = vi.fn();
    const { result } = renderHook(() => useCouponRemoval(setProblem));
    await act(() => result.current.onRemoveCoupon());
    expect(setProblem).toHaveBeenCalledWith(null);
  });

  it("bỏ mã lỗi thì báo lại kèm hành động bỏ mã", async () => {
    cartValue.removeCoupon = vi.fn(async () => {
      throw new ApiError(500, "INTERNAL_ERROR", "x");
    }) as unknown as CartContextValue["removeCoupon"];
    const setProblem = vi.fn();
    const { result } = renderHook(() => useCouponRemoval(setProblem));
    await act(() => result.current.onRemoveCoupon());
    expect(setProblem).toHaveBeenCalledWith(
      expect.objectContaining({ action: "removeCoupon", message: expect.any(String) }),
    );
  });

  it("couponBusy theo cờ pending.coupon của giỏ", () => {
    cartValue.pending = { ...cartValue.pending, coupon: true };
    const { result } = renderHook(() => useCouponRemoval(vi.fn()));
    expect(result.current.couponBusy).toBe(true);
  });
});

function submitInput(over: Partial<CheckoutSubmitInput> = {}): CheckoutSubmitInput {
  const address = {
    addressId: "a1",
    showForm: false,
    shipName: "",
    shipPhone: "",
    line1: "",
    loc: { provinceCode: "", wardCode: "" },
  } as unknown as CheckoutSubmitInput["address"];
  const captcha = {
    needCaptcha: false,
    token: null,
    setCaptcha: vi.fn(),
    turnstile: { current: null },
  } as unknown as CheckoutSubmitInput["captcha"];
  return {
    authed: true,
    email: "",
    phone: "",
    note: "",
    acceptTerms: true,
    shippingMethod: "STANDARD",
    paymentMethod: "COD",
    selected: {
      method: "STANDARD",
      grandTotal: 100000,
    } as unknown as CheckoutSubmitInput["selected"],
    address,
    captcha,
    q: { status: "ready", replace: vi.fn() } as unknown as CheckoutSubmitInput["q"],
    onPlaced: vi.fn(),
    ...over,
  };
}

const submitEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

describe("useCheckoutSubmit", () => {
  it("chưa đồng ý điều khoản: báo lỗi ô, không gọi API", async () => {
    const { result } = renderHook(() => useCheckoutSubmit(submitInput({ acceptTerms: false })));
    await act(() => result.current.onSubmit(submitEvent));
    expect(result.current.errors.acceptTerms).toBeTruthy();
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("cần captcha mà chưa có token: báo vấn đề, không gọi API", async () => {
    const captcha = {
      needCaptcha: true,
      token: null,
      setCaptcha: vi.fn(),
      turnstile: { current: null },
    } as unknown as CheckoutSubmitInput["captcha"];
    const { result } = renderHook(() => useCheckoutSubmit(submitInput({ captcha })));
    await act(() => result.current.onSubmit(submitEvent));
    expect(result.current.problem?.message).toMatch(/xác minh/);
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("chưa tính được phí vận chuyển: báo vấn đề theo trạng thái báo giá", async () => {
    const q = { status: "loading", replace: vi.fn() } as unknown as CheckoutSubmitInput["q"];
    const { result } = renderHook(() => useCheckoutSubmit(submitInput({ selected: null, q })));
    await act(() => result.current.onSubmit(submitEvent));
    expect(result.current.problem?.message).toMatch(/Đang tính phí/);
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("đặt thành công: gửi Idempotency-Key, lưu đơn, báo onPlaced, chuyển trang thành công", async () => {
    placeOrder.mockResolvedValue({
      code: "BB-1",
      status: "PENDING",
      paymentMethod: "COD",
    });
    const input = submitInput();
    const { result } = renderHook(() => useCheckoutSubmit(input));
    await act(() => result.current.onSubmit(submitEvent));
    expect(placeOrder).toHaveBeenCalledTimes(1);
    const [body, key] = placeOrder.mock.calls[0]!;
    expect(body).toMatchObject({ addressId: "a1", paymentMethod: "COD", expectedTotal: 100000 });
    expect(typeof key).toBe("string");
    expect(input.onPlaced).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/dat-hang-thanh-cong/BB-1");
    expect(JSON.parse(sessionStorage.getItem("bb_last_order")!).code).toBe("BB-1");
  });

  it("PRICE_CHANGED: nêu tổng mới; lỗi 4xx dứt khoát nên lần gửi sau dùng key mới", async () => {
    const q = { status: "ready", replace: vi.fn() } as unknown as CheckoutSubmitInput["q"];
    placeOrder.mockRejectedValue(new ApiError(409, "PRICE_CHANGED", "x", { grandTotal: 250000 }));
    const { result } = renderHook(() => useCheckoutSubmit(submitInput({ q })));
    await act(() => result.current.onSubmit(submitEvent));
    expect(result.current.problem?.message).toMatch(/Tổng tiền đã thay đổi thành/);
    expect(result.current.submitting).toBe(false);
    await act(() => result.current.onSubmit(submitEvent));
    expect(placeOrder).toHaveBeenCalledTimes(2);
    expect(placeOrder.mock.calls[1]![1]).not.toBe(placeOrder.mock.calls[0]![1]);
  });

  it("lỗi 5xx: gửi lại cùng nội dung thì dùng lại Idempotency-Key", async () => {
    placeOrder.mockRejectedValue(new ApiError(503, "SERVICE_UNAVAILABLE", "x"));
    const { result } = renderHook(() => useCheckoutSubmit(submitInput()));
    await act(() => result.current.onSubmit(submitEvent));
    await act(() => result.current.onSubmit(submitEvent));
    expect(placeOrder).toHaveBeenCalledTimes(2);
    expect(placeOrder.mock.calls[1]![1]).toBe(placeOrder.mock.calls[0]![1]);
  });

  it("OUT_OF_STOCK: tải lại giỏ và gợi ý quay lại giỏ hàng", async () => {
    placeOrder.mockRejectedValue(new ApiError(409, "OUT_OF_STOCK", "x"));
    const { result } = renderHook(() => useCheckoutSubmit(submitInput()));
    await act(() => result.current.onSubmit(submitEvent));
    expect(cartValue.reload).toHaveBeenCalled();
    expect(result.current.problem?.action).toBe("cart");
  });

  it("COUPON_INVALID: gợi ý bỏ mã", async () => {
    placeOrder.mockRejectedValue(new ApiError(422, "COUPON_INVALID", "x"));
    const { result } = renderHook(() => useCheckoutSubmit(submitInput()));
    await act(() => result.current.onSubmit(submitEvent));
    expect(result.current.problem?.action).toBe("removeCoupon");
  });

  it("clearError chỉ xóa các khóa có trong errors", async () => {
    const { result } = renderHook(() => useCheckoutSubmit(submitInput({ acceptTerms: false })));
    await act(() => result.current.onSubmit(submitEvent));
    expect(result.current.errors.acceptTerms).toBeTruthy();
    act(() => result.current.clearError("acceptTerms"));
    expect(result.current.errors.acceptTerms).toBeUndefined();
  });
});
