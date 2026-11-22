"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ApiError } from "@/lib/api/errors";
import { formatVND } from "@/lib/format";
import { completeMockGateway, pickVnpayParams, type MockChoice } from "../api";
import { safeResultPath } from "../redirect";

/**
 * Cổng thanh toán GIẢ LẬP (D-060): đọc yêu cầu đã ký trong query, cho người dùng chọn kết quả rồi
 * gửi nguyên query cho backend (backend kiểm chữ ký và xử lý qua IPN thật). Không trừ tiền thật.
 */
export type MockProvider = "vnpay" | "momo";

const MOMO_KEYS = [
  "partnerCode",
  "orderId",
  "requestId",
  "amount",
  "orderInfo",
  "redirectUrl",
  "requestType",
  "extraData",
  "lang",
  "signature",
] as const;

interface ParsedRequest {
  params: Record<string, string>;
  amount: number;
  orderCode: string | null;
}

const ORDER_IN_TEXT = /BB-\d{6}-[A-Z0-9]{4}/;

function parseRequest(provider: MockProvider, raw: string): ParsedRequest | null {
  const sp = new URLSearchParams(raw);
  if (provider === "vnpay") {
    const vnp = pickVnpayParams(raw);
    const params = Object.fromEntries(vnp);
    const cents = Number(params.vnp_Amount);
    if (!params.vnp_SecureHash || !params.vnp_TxnRef || !Number.isFinite(cents) || cents <= 0) {
      return null;
    }
    return {
      params,
      amount: cents / 100,
      orderCode: ORDER_IN_TEXT.exec(params.vnp_OrderInfo ?? "")?.[0] ?? null,
    };
  }
  const params: Record<string, string> = {};
  for (const k of MOMO_KEYS) {
    const v = sp.get(k);
    if (v !== null) params[k] = v;
  }
  const amount = Number(params.amount);
  if (!params.signature || !params.orderId || !Number.isFinite(amount) || amount <= 0) return null;
  return { params, amount, orderCode: ORDER_IN_TEXT.exec(params.orderInfo ?? "")?.[0] ?? null };
}

const TITLE: Record<MockProvider, string> = {
  vnpay: "VNPay (giả lập)",
  momo: "Ví MoMo (giả lập)",
};

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "PAYMENT_SIGNATURE_INVALID") {
      return "Yêu cầu thanh toán không hợp lệ hoặc đã bị thay đổi. Hãy quay lại cửa hàng và bấm thanh toán lại.";
    }
    if (err.status === 404) {
      return "Cổng thanh toán giả lập chưa được bật trên máy chủ này, hoặc không tìm thấy giao dịch.";
    }
    if (err.code === "NETWORK_ERROR") {
      return "Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại.";
    }
  }
  return "Không hoàn tất được giao dịch giả lập. Vui lòng thử lại.";
}

export function MockGatewayView({ provider }: { provider: MockProvider }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [raw] = useState(() => searchParams.toString());
  const [req] = useState(() => parseRequest(provider, raw));
  const [busy, setBusy] = useState<MockChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  async function choose(choice: MockChoice) {
    if (lock.current || !req) return;
    lock.current = true;
    setBusy(choice);
    setError(null);
    try {
      const { returnUrl } = await completeMockGateway(provider, req.params, choice);
      const path = safeResultPath(returnUrl, window.location.origin);
      if (!path) {
        setError("Không xác định được trang kết quả. Vui lòng thử lại.");
      } else {
        router.push(path);
        return; // đang rời trang: giữ trạng thái loading
      }
    } catch (err) {
      setError(errorMessage(err));
    }
    lock.current = false;
    setBusy(null);
  }

  return (
    <section
      aria-labelledby="mock-gw-title"
      className="space-y-4 rounded-2xl border border-coffee-200 bg-white p-5 sm:p-8"
    >
      <div
        role="note"
        className="rounded-lg border border-danger-600/40 bg-danger-50 px-3 py-3 text-danger-600"
      >
        <p className="font-bold">Cổng thanh toán GIẢ LẬP, không trừ tiền thật</p>
        <p className="text-sm">
          Đây là trang mô phỏng dùng cho bản demo của BeanBox. Không nhập thẻ hay tài khoản thật.
        </p>
      </div>
      <h1 id="mock-gw-title" className="font-serif text-2xl font-bold text-coffee-900">
        {TITLE[provider]}
      </h1>
      {req ? (
        <>
          <dl className="grid gap-3 sm:grid-cols-2">
            {req.orderCode ? (
              <div>
                <dt className="text-sm text-coffee-700">Mã đơn hàng</dt>
                <dd data-testid="mock-order-code" className="font-mono text-lg font-bold">
                  {req.orderCode}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-sm text-coffee-700">Số tiền</dt>
              <dd data-testid="mock-amount" className="text-lg font-bold text-coffee-900">
                {formatVND(req.amount)}
              </dd>
            </div>
          </dl>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => choose("success")}
              loading={busy === "success"}
              disabled={!!busy}
            >
              Thanh toán thành công
            </Button>
            <Button
              variant="danger"
              onClick={() => choose("failed")}
              loading={busy === "failed"}
              disabled={!!busy}
            >
              Thanh toán thất bại
            </Button>
            <Button
              variant="outline"
              onClick={() => choose("cancel")}
              loading={busy === "cancel"}
              disabled={!!busy}
            >
              Hủy giao dịch
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <p role="alert" className="text-coffee-800">
            Liên kết thanh toán không hợp lệ hoặc thiếu dữ liệu. Hãy quay lại cửa hàng và bấm thanh
            toán lại.
          </p>
          <Link href="/" className={buttonClasses("outline")}>
            Về trang chủ
          </Link>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}
