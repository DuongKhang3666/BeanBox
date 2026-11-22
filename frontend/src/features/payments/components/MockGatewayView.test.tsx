import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import { MockGatewayView } from "./MockGatewayView";

const push = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));

const VNP =
  "vnp_Amount=22000000&vnp_Command=pay&vnp_OrderInfo=Thanh+toan+don+hang+BB-261110-K7QP&vnp_TmnCode=BEANBOXDEMO&vnp_TxnRef=pay1&vnp_SecureHash=abc123";
const MOMO =
  "partnerCode=BEANBOXMOMODEMO&orderId=pay2&requestId=r1&amount=350000&orderInfo=Thanh+toan+don+hang+BB-261110-K7QP&signature=sig&utm_x=1";

function stubFetch(handler: (path: string, body: unknown) => Response) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) =>
    handler(input.replace("/api/v1", ""), init.body ? JSON.parse(init.body as string) : undefined),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  push.mockReset();
  search = "";
});
afterEach(() => vi.unstubAllGlobals());

describe("MockGatewayView", () => {
  it("VNPay: cảnh báo GIẢ LẬP, mã đơn, số tiền (chia 100) và 3 nút", () => {
    search = VNP;
    render(<MockGatewayView provider="vnpay" />);
    expect(screen.getByRole("note")).toHaveTextContent("GIẢ LẬP, không trừ tiền thật");
    expect(screen.getByRole("heading", { name: "VNPay (giả lập)" })).toBeInTheDocument();
    expect(screen.getByTestId("mock-order-code")).toHaveTextContent("BB-261110-K7QP");
    expect(screen.getByTestId("mock-amount")).toHaveTextContent("220.000₫");
    for (const name of ["Thanh toán thành công", "Thanh toán thất bại", "Hủy giao dịch"]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
  });

  it("MoMo: hiện số tiền, bỏ tham số lạ khi gửi", async () => {
    search = MOMO;
    const mock = stubFetch(() =>
      jsonRes(200, {
        data: {
          returnUrl: `${window.location.origin}/thanh-toan/ket-qua?provider=momo&signature=z`,
        },
      }),
    );
    const u = userEvent.setup();
    render(<MockGatewayView provider="momo" />);
    expect(screen.getByTestId("mock-amount")).toHaveTextContent("350.000₫");
    await u.click(screen.getByRole("button", { name: "Thanh toán thành công" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const [path, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/v1/mock-gateway/momo/complete");
    expect(JSON.parse(init.body as string)).toEqual({
      params: {
        partnerCode: "BEANBOXMOMODEMO",
        orderId: "pay2",
        requestId: "r1",
        amount: "350000",
        orderInfo: "Thanh toan don hang BB-261110-K7QP",
        signature: "sig",
      },
      result: "success",
    });
    expect(push).toHaveBeenCalledWith("/thanh-toan/ket-qua?provider=momo&signature=z");
  });

  it("VNPay: gửi NGUYÊN vnp_* đã nhận và đúng kết quả cho từng nút", async () => {
    search = VNP;
    const mock = stubFetch(() =>
      jsonRes(200, {
        data: { returnUrl: `${window.location.origin}/thanh-toan/ket-qua?provider=vnpay` },
      }),
    );
    const u = userEvent.setup();
    render(<MockGatewayView provider="vnpay" />);
    await u.click(screen.getByRole("button", { name: "Hủy giao dịch" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/thanh-toan/ket-qua?provider=vnpay"));
    const body = JSON.parse((mock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.result).toBe("cancel");
    expect(body.params).toMatchObject({
      vnp_Amount: "22000000",
      vnp_TxnRef: "pay1",
      vnp_SecureHash: "abc123",
      vnp_TmnCode: "BEANBOXDEMO",
    });
  });

  it("returnUrl khác origin hoặc sai đường dẫn bị từ chối, không điều hướng", async () => {
    search = VNP;
    stubFetch(() =>
      jsonRes(200, { data: { returnUrl: "https://evil.example/thanh-toan/ket-qua" } }),
    );
    const u = userEvent.setup();
    render(<MockGatewayView provider="vnpay" />);
    await u.click(screen.getByRole("button", { name: "Thanh toán thành công" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không xác định được trang kết quả");
    expect(push).not.toHaveBeenCalled();
    // thử lại được
    expect(screen.getByRole("button", { name: "Thanh toán thành công" })).toBeEnabled();
  });

  it("400 chữ ký sai -> thông báo, không điều hướng", async () => {
    search = VNP;
    stubFetch(() => errRes(400, "PAYMENT_SIGNATURE_INVALID", "x"));
    const u = userEvent.setup();
    render(<MockGatewayView provider="vnpay" />);
    await u.click(screen.getByRole("button", { name: "Thanh toán thất bại" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Yêu cầu thanh toán không hợp lệ hoặc đã bị thay đổi",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("404 (cổng giả chưa bật) -> thông báo rõ ràng", async () => {
    search = MOMO;
    stubFetch(() => errRes(404, "NOT_FOUND", "x"));
    const u = userEvent.setup();
    render(<MockGatewayView provider="momo" />);
    await u.click(screen.getByRole("button", { name: "Hủy giao dịch" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("chưa được bật");
  });

  it("thiếu chữ ký/số tiền: báo liên kết không hợp lệ, không có nút thanh toán", () => {
    search = "vnp_Amount=100&vnp_TxnRef=p";
    render(<MockGatewayView provider="vnpay" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Liên kết thanh toán không hợp lệ");
    expect(screen.queryByRole("button", { name: "Thanh toán thành công" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
  });
});
