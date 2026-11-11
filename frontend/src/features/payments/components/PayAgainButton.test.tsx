import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import { PayAgainButton } from "./PayAgainButton";

const assign = vi.fn();
const CODE = "BB-261110-K7QP";

beforeEach(() => {
  assign.mockReset();
  vi.stubGlobal("location", { ...window.location, assign });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const inFuture = (ms: number) => new Date(Date.now() + ms).toISOString();

function session(redirectUrl: string) {
  return jsonRes(200, { data: { redirectUrl, paymentId: "p1", expiresAt: null } });
}

describe("PayAgainButton", () => {
  it("COD không hiển thị gì", () => {
    const { container } = render(<PayAgainButton code={CODE} method="COD" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hiển thị đếm ngược mm:ss và giảm theo thời gian", () => {
    vi.useFakeTimers();
    render(<PayAgainButton code={CODE} method="VNPAY" expiresAt={inFuture(125_000)} />);
    expect(screen.getByRole("timer")).toHaveTextContent("02:05");
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("02:00");
  });

  it("chỉ thông báo cho trình đọc màn hình khi còn dưới 1 phút", () => {
    vi.useFakeTimers();
    render(<PayAgainButton code={CODE} method="VNPAY" expiresAt={inFuture(70_000)} />);
    const live = () => screen.getAllByRole("status").find((n) => n.className.includes("sr-only"))!;
    expect(live()).toBeEmptyDOMElement();
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(live()).toHaveTextContent(/còn dưới 1 phút/);
    expect(screen.getByRole("timer")).not.toHaveAttribute("aria-live");
  });

  it("tự ẩn nút khi hết hạn (đã hết hạn lúc mở, và hết hạn khi đang xem)", () => {
    vi.useFakeTimers();
    const first = render(<PayAgainButton code={CODE} method="VNPAY" expiresAt={inFuture(-1000)} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    first.unmount();

    render(<PayAgainButton code={CODE} method="STRIPE" expiresAt={inFuture(3000)} />);
    expect(screen.getByRole("button", { name: "Thanh toán lại" })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/quá hạn thanh toán/)).toBeInTheDocument();
  });

  it("VNPay, đã đăng nhập: gọi create không kèm phone rồi assign redirectUrl https", async () => {
    const fetchMock = vi.fn(async () => session("https://sandbox.vnpayment.vn/pay?x=1"));
    vi.stubGlobal("fetch", fetchMock);
    render(<PayAgainButton code={CODE} method="VNPAY" />);
    await userEvent.click(screen.getByRole("button", { name: "Thanh toán lại" }));
    await vi.waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://sandbox.vnpayment.vn/pay?x=1"),
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/payments/vnpay/create");
    expect(JSON.parse(init.body as string)).toEqual({ code: CODE });
  });

  it("Stripe, khách: gửi phone tới create-session và không gắn Bearer", async () => {
    const fetchMock = vi.fn(async () => session("https://checkout.stripe.com/c/pay/cs_test_1"));
    vi.stubGlobal("fetch", fetchMock);
    render(<PayAgainButton code={CODE} method="STRIPE" phone="0901234567" />);
    await userEvent.click(screen.getByRole("button", { name: "Thanh toán lại" }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/payments/stripe/create-session");
    expect(JSON.parse(init.body as string)).toEqual({ code: CODE, phone: "0901234567" });
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("redirectUrl http bị chặn, hiện lỗi", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => session("http://evil.test/pay")),
    );
    render(<PayAgainButton code={CODE} method="VNPAY" />);
    await userEvent.click(screen.getByRole("button", { name: "Thanh toán lại" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không mở được trang thanh toán");
    expect(assign).not.toHaveBeenCalled();
  });

  it("409 PAYMENT_NOT_ALLOWED EXPIRED -> thông báo tiếng Việt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errRes(409, "PAYMENT_NOT_ALLOWED", "x", { reason: "EXPIRED" })),
    );
    render(<PayAgainButton code={CODE} method="VNPAY" />);
    await userEvent.click(screen.getByRole("button", { name: "Thanh toán lại" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Đơn hàng đã quá hạn thanh toán");
  });

  it("onBeforePay trả false thì không gọi API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PayAgainButton code={CODE} method="VNPAY" onBeforePay={() => false} />);
    await userEvent.click(screen.getByRole("button", { name: "Thanh toán lại" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
