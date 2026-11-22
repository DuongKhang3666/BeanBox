import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import type { BankTransferInfo } from "../api";
import { BankTransferPanel } from "./BankTransferPanel";

const CODE = "BB-261110-K7QP";

function info(over: Partial<BankTransferInfo> = {}): BankTransferInfo {
  return {
    orderCode: CODE,
    amount: 220000,
    content: `BEANBOX ${CODE}`,
    bankName: "Ngân hàng demo (không có thật)",
    bankBin: "999999",
    accountNo: "0123456789",
    accountName: "BEANBOX DEMO",
    qrPayload: "000201",
    qrDataUrl: "data:image/png;base64,AAAA",
    expiresAt: "2026-11-11T08:30:00.000Z",
    claimedAt: null,
    isDemo: true,
    ...over,
  };
}

function stubFetch(handler: (method: string, path: string, body: unknown) => Response) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) =>
    handler(
      init.method ?? "GET",
      input.replace("/api/v1", ""),
      init.body ? JSON.parse(init.body as string) : undefined,
    ),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => vi.unstubAllGlobals());

describe("BankTransferPanel", () => {
  it("hiện cảnh báo demo, QR có alt, số tài khoản và nội dung chuyển khoản", async () => {
    const mock = stubFetch(() => jsonRes(200, { data: info() }));
    render(<BankTransferPanel code={CODE} phone="0901234567" />);
    expect(await screen.findByRole("note")).toHaveTextContent("KHÔNG chuyển tiền thật");
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "data:image/png;base64,AAAA");
    expect(img.getAttribute("alt")).toContain(CODE);
    expect(screen.getByTestId("bt-account")).toHaveTextContent("0123456789");
    expect(screen.getByTestId("bt-content")).toHaveTextContent(`BEANBOX ${CODE}`);
    expect(screen.getByRole("button", { name: "Tôi đã chuyển khoản" })).toBeEnabled();
    const [url] = mock.mock.calls[0] as unknown as [string];
    expect(url).toContain(`/orders/${CODE}/bank-transfer`);
    expect(url).toContain("phone=0901234567");
  });

  it("isDemo=false: không hiện cảnh báo demo", async () => {
    stubFetch(() => jsonRes(200, { data: info({ isDemo: false }) }));
    render(<BankTransferPanel code={CODE} />);
    await screen.findByTestId("bt-account");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("bấm 'Tôi đã chuyển khoản' gọi claim, hiện đã ghi nhận và không còn nút", async () => {
    const mock = stubFetch((method) =>
      method === "POST"
        ? jsonRes(200, { data: { claimedAt: "2026-11-10T09:00:00.000Z" } })
        : jsonRes(200, { data: info() }),
    );
    const u = userEvent.setup();
    render(<BankTransferPanel code={CODE} phone="0901234567" />);
    await u.click(await screen.findByRole("button", { name: "Tôi đã chuyển khoản" }));
    expect(await screen.findByTestId("bt-claimed")).toHaveTextContent("Đã ghi nhận");
    expect(screen.queryByRole("button", { name: "Tôi đã chuyển khoản" })).not.toBeInTheDocument();
    const post = mock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST")!;
    expect(post[0]).toContain(`/orders/${CODE}/bank-transfer/claim`);
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({ phone: "0901234567" });
  });

  it("đã claim từ trước: hiện thông báo, không có nút", async () => {
    stubFetch(() => jsonRes(200, { data: info({ claimedAt: "2026-11-10T09:00:00.000Z" }) }));
    render(<BankTransferPanel code={CODE} />);
    expect(await screen.findByTestId("bt-claimed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tôi đã chuyển khoản" })).not.toBeInTheDocument();
  });

  it("lỗi tải: báo lỗi và thử lại được", async () => {
    let fail = true;
    stubFetch(() => (fail ? errRes(404, "NOT_FOUND", "x") : jsonRes(200, { data: info() })));
    const u = userEvent.setup();
    render(<BankTransferPanel code={CODE} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fail = false;
    await u.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(screen.getByTestId("bt-account")).toBeInTheDocument());
  });

  it("claim lỗi: hiện thông báo, nút vẫn còn", async () => {
    stubFetch((method) =>
      method === "POST" ? errRes(409, "PAYMENT_NOT_ALLOWED", "x") : jsonRes(200, { data: info() }),
    );
    const u = userEvent.setup();
    render(<BankTransferPanel code={CODE} />);
    await u.click(await screen.findByRole("button", { name: "Tôi đã chuyển khoản" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tôi đã chuyển khoản" })).toBeEnabled();
  });
});
