"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/features/auth/AuthProvider";
import { TextField } from "@/features/auth/components/Fields";
import { isValidPhone, normalizePhone } from "@/features/auth/validation";
import { LAST_ORDER_KEY } from "@/features/checkout/components/CheckoutForm";
import { ORDER_CODE_RE, orderErrorMessage } from "@/features/orders/labels";
import { ApiError } from "@/lib/api/errors";
import type { PaymentMethod } from "@/types/order";
import type { PaymentResult } from "@/types/payment";
import { confirmVnpayReturn, pickVnpayParams, syncStripeSession } from "../api";
import { useRemainingMs } from "../useCountdown";
import { PayAgainButton } from "./PayAgainButton";

const BASE = "/thanh-toan/ket-qua";
const SESSION_ID_RE = /^cs_(test_)?[A-Za-z0-9]+$/;

type Provider = "vnpay" | "stripe";
const METHOD: Record<Provider, PaymentMethod> = { vnpay: "VNPAY", stripe: "STRIPE" };

type Plan =
  | { kind: "vnpay"; query: string }
  | { kind: "stripe"; sessionId: string }
  | { kind: "cancelled"; provider: Provider; code: string | null }
  | { kind: "unknown"; provider: Provider | null; code: string | null };

type View =
  | { kind: "loading" }
  | { kind: "result"; result: PaymentResult }
  | { kind: "invalid" }
  | { kind: "error"; message: string }
  | Exclude<Plan, { kind: "vnpay" } | { kind: "stripe" }>;

function planFor(raw: string): Plan {
  const sp = new URLSearchParams(raw);
  const p = sp.get("provider");
  const provider: Provider | null = p === "vnpay" || p === "stripe" ? p : null;
  const rawCode = sp.get("code")?.trim().toUpperCase() ?? "";
  const code = ORDER_CODE_RE.test(rawCode) ? rawCode : null;
  if (provider === "vnpay") {
    const vnp = pickVnpayParams(raw);
    return Array.from(vnp.keys()).length > 0
      ? { kind: "vnpay", query: vnp.toString() }
      : { kind: "unknown", provider, code };
  }
  if (provider === "stripe") {
    const sessionId = sp.get("session_id") ?? "";
    if (SESSION_ID_RE.test(sessionId)) return { kind: "stripe", sessionId };
    if (sp.get("cancelled") === "1") return { kind: "cancelled", provider, code };
  }
  return { kind: "unknown", provider, code };
}

function initialView(plan: Plan): View {
  return plan.kind === "vnpay" || plan.kind === "stripe" ? { kind: "loading" } : plan;
}

/** URL sạch: chỉ còn provider (+ code đã kiểm định dạng). */
function cleanQuery(provider: string | null, code: string | null): string {
  const keep = new URLSearchParams();
  if (provider) keep.set("provider", provider);
  if (code) keep.set("code", code);
  return keep.toString();
}

function readStoredPhone(code: string): string | undefined {
  try {
    const raw = sessionStorage.getItem(LAST_ORDER_KEY);
    if (!raw) return undefined;
    const o = JSON.parse(raw) as { code?: string; contact?: { phone?: string } };
    return o.code === code && typeof o.contact?.phone === "string" ? o.contact.phone : undefined;
  } catch {
    return undefined;
  }
}

function Card({
  title,
  tone = "neutral",
  children,
  actions,
}: {
  title: string;
  tone?: "success" | "warn" | "neutral";
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const toneCls =
    tone === "success"
      ? "border-moss-200 bg-moss-50"
      : tone === "warn"
        ? "border-danger-600/30 bg-danger-50"
        : "border-coffee-200 bg-white";
  return (
    <section
      aria-labelledby="pay-result-title"
      className={`space-y-4 rounded-2xl border p-5 text-center sm:p-8 ${toneCls}`}
    >
      {/* Vùng thông báo: chỉ nội dung kết quả, không chứa đồng hồ đếm ngược. */}
      <div aria-live="polite" className="space-y-3">
        <h1
          id="pay-result-title"
          ref={headingRef}
          tabIndex={-1}
          className="font-serif text-2xl font-bold text-coffee-900 outline-none sm:text-3xl"
        >
          {title}
        </h1>
        {children}
      </div>
      {actions}
    </section>
  );
}

function OrderCode({ code }: { code: string }) {
  return (
    <p className="text-coffee-800">
      Mã đơn hàng{" "}
      <span data-testid="order-code" className="font-mono text-lg font-bold text-coffee-900">
        {code}
      </span>
    </p>
  );
}

function OrderLinks({ code, authed }: { code: string | null; authed: boolean }) {
  const href = authed
    ? code
      ? `/tai-khoan/don-hang/${encodeURIComponent(code)}`
      : "/tai-khoan/don-hang"
    : code
      ? `/tra-cuu-don-hang?code=${encodeURIComponent(code)}`
      : "/tra-cuu-don-hang";
  return (
    <div className="flex flex-col justify-center gap-2 sm:flex-row">
      <Link href={href} className={buttonClasses("primary")}>
        {authed ? "Xem đơn hàng" : "Tra cứu đơn hàng"}
      </Link>
      <Link href="/" className={buttonClasses("outline")}>
        Tiếp tục mua sắm
      </Link>
    </div>
  );
}

/** Thanh toán lại: chủ đơn đăng nhập không cần SĐT; khách lấy SĐT từ đơn vừa đặt hoặc nhập tay. */
function PayAgain({
  code,
  method,
  expiresAt,
  authed,
}: {
  code: string;
  method: PaymentMethod;
  expiresAt?: string | null;
  authed: boolean;
}) {
  const [storedPhone] = useState(() => (authed ? undefined : readStoredPhone(code)));
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | undefined>();

  if (authed || storedPhone) {
    return (
      <PayAgainButton
        code={code}
        method={method}
        expiresAt={expiresAt}
        phone={authed || !storedPhone ? undefined : normalizePhone(storedPhone)}
        className="flex flex-col items-center"
      />
    );
  }

  function onBeforePay() {
    if (!phone.trim()) {
      setError("Vui lòng nhập số điện thoại đặt hàng");
    } else if (!isValidPhone(phone)) {
      setError("Số điện thoại không hợp lệ (ví dụ 0901234567)");
    } else {
      setError(undefined);
      return true;
    }
    document.getElementById("pay-phone")?.focus();
    return false;
  }

  return (
    <div className="mx-auto max-w-sm space-y-3 text-left">
      <TextField
        id="pay-phone"
        label="Số điện thoại đặt hàng"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        hint="Dùng để xác nhận bạn là người đặt đơn này."
        value={phone}
        onChange={(e) => {
          setPhone(e.target.value);
          setError(undefined);
        }}
        error={error}
      />
      <PayAgainButton
        code={code}
        method={method}
        expiresAt={expiresAt}
        phone={isValidPhone(phone) ? normalizePhone(phone) : undefined}
        onBeforePay={onBeforePay}
      />
    </div>
  );
}

function ResultPanel({
  result,
  provider,
  authed,
  authLoading,
}: {
  result: PaymentResult;
  provider: Provider;
  authed: boolean;
  authLoading: boolean;
}) {
  const remaining = useRemainingMs(result.expiresAt);
  const expired = remaining === 0;

  if (result.result === "SUCCEEDED") {
    return (
      <Card
        title="Thanh toán thành công"
        tone="success"
        actions={<OrderLinks code={result.orderCode} authed={authed} />}
      >
        <p className="text-coffee-800">Cảm ơn bạn! BeanBox đã nhận được thanh toán cho đơn hàng.</p>
        <OrderCode code={result.orderCode} />
      </Card>
    );
  }

  if (result.canPay && !expired) {
    return (
      <Card
        title="Thanh toán chưa thành công"
        tone="warn"
        actions={
          <div className="space-y-4">
            {authLoading ? null : (
              <PayAgain
                code={result.orderCode}
                method={METHOD[provider]}
                expiresAt={result.expiresAt}
                authed={authed}
              />
            )}
            <OrderLinks code={result.orderCode} authed={authed} />
          </div>
        }
      >
        <p className="text-coffee-800">
          {result.result === "PENDING"
            ? "Chúng tôi chưa nhận được kết quả giao dịch. Nếu tài khoản của bạn đã bị trừ tiền, vui lòng đợi ít phút rồi kiểm tra lại đơn hàng."
            : "Giao dịch chưa hoàn tất. Đơn hàng vẫn được giữ cho bạn, bạn có thể thanh toán lại trong thời gian còn lại."}
        </p>
        <OrderCode code={result.orderCode} />
      </Card>
    );
  }

  if (expired || result.orderStatus === "CANCELLED") {
    return (
      <Card
        title="Đơn hàng đã quá hạn thanh toán và sẽ bị hủy"
        tone="warn"
        actions={<OrderLinks code={result.orderCode} authed={authed} />}
      >
        <p className="text-coffee-800">
          Nếu bạn đã bị trừ tiền, vui lòng liên hệ BeanBox kèm mã đơn để được hỗ trợ.
        </p>
        <OrderCode code={result.orderCode} />
      </Card>
    );
  }

  return (
    <Card
      title="Thanh toán chưa thành công"
      tone="warn"
      actions={<OrderLinks code={result.orderCode} authed={authed} />}
    >
      <p className="text-coffee-800">Đơn hàng không còn ở trạng thái chờ thanh toán.</p>
      <OrderCode code={result.orderCode} />
    </Card>
  );
}

export function PaymentResultView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status: authStatus } = useAuth();
  // Chụp query ngay lần render đầu: sau đó xóa khỏi thanh địa chỉ.
  const [raw] = useState(() => searchParams.toString());
  const [plan] = useState(() => planFor(raw));
  const [view, setView] = useState<View>(() => initialView(plan));
  const [attempt, setAttempt] = useState(0);

  // Không để chữ ký/phiên thanh toán nằm lại trong URL và lịch sử trình duyệt.
  useEffect(() => {
    const provider =
      plan.kind === "vnpay" ? "vnpay" : plan.kind === "stripe" ? "stripe" : plan.provider;
    const code = plan.kind === "cancelled" || plan.kind === "unknown" ? plan.code : null;
    const clean = cleanQuery(provider, code);
    if (raw !== clean) router.replace(clean ? `${BASE}?${clean}` : BASE);
    // Chỉ chạy một lần khi mở trang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (plan.kind !== "vnpay" && plan.kind !== "stripe") return;
    let cancelled = false;
    const run =
      plan.kind === "vnpay" ? confirmVnpayReturn(plan.query) : syncStripeSession(plan.sessionId);
    run.then(
      (result) => {
        if (cancelled) return;
        setView({ kind: "result", result });
        router.replace(`${BASE}?${cleanQuery(plan.kind, result.orderCode)}`);
      },
      (err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === "PAYMENT_SIGNATURE_INVALID") {
          setView({ kind: "invalid" });
        } else {
          setView({ kind: "error", message: orderErrorMessage(err) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // `router` ổn định; `plan` không đổi sau lần render đầu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const authed = authStatus === "authenticated";
  const authLoading = authStatus === "loading";

  function retry() {
    setView({ kind: "loading" });
    setAttempt((a) => a + 1);
  }

  switch (view.kind) {
    case "loading":
      return (
        <section
          role="status"
          aria-busy="true"
          className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-8 text-center"
        >
          <Spinner label="" className="text-moss-700" />
          <p className="font-medium text-coffee-900">Đang xác nhận thanh toán...</p>
          <p className="text-sm text-coffee-700">Vui lòng không đóng hoặc tải lại trang.</p>
        </section>
      );
    case "result":
      return (
        <ResultPanel
          result={view.result}
          provider={plan.kind === "vnpay" ? "vnpay" : "stripe"}
          authed={authed}
          authLoading={authLoading}
        />
      );
    case "cancelled":
      return (
        <Card
          title="Bạn đã hủy thanh toán"
          tone="neutral"
          actions={
            <div className="space-y-4">
              {view.code && !authLoading ? (
                <PayAgain code={view.code} method="STRIPE" authed={authed} />
              ) : null}
              <OrderLinks code={view.code} authed={authed} />
            </div>
          }
        >
          <p className="text-coffee-800">
            Đơn hàng vẫn được giữ trong thời gian chờ thanh toán. Quá hạn, đơn sẽ tự động bị hủy.
          </p>
          {view.code ? <OrderCode code={view.code} /> : null}
        </Card>
      );
    case "invalid":
      return (
        <Card
          title="Không xác minh được kết quả thanh toán"
          tone="warn"
          actions={<OrderLinks code={null} authed={authed} />}
        >
          <p className="text-coffee-800">
            Dữ liệu trả về từ cổng thanh toán không hợp lệ. Vui lòng kiểm tra trạng thái đơn hàng
            bằng mã đơn trong email xác nhận.
          </p>
        </Card>
      );
    case "error":
      return (
        <Card
          title="Chưa kiểm tra được kết quả thanh toán"
          tone="warn"
          actions={
            <div className="space-y-4">
              <Button onClick={retry}>Thử lại</Button>
              <OrderLinks code={null} authed={authed} />
            </div>
          }
        >
          <p className="text-coffee-800">{view.message}</p>
        </Card>
      );
    default:
      return (
        <Card
          title="Không xác định được kết quả thanh toán"
          tone="neutral"
          actions={<OrderLinks code={view.code} authed={authed} />}
        >
          <p className="text-coffee-800">
            Liên kết này không còn dữ liệu kết quả. Hãy kiểm tra trạng thái đơn hàng để biết thanh
            toán đã được ghi nhận hay chưa.
          </p>
          {view.code ? <OrderCode code={view.code} /> : null}
        </Card>
      );
  }
}
