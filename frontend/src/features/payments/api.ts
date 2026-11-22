import { api } from "@/lib/api/client";
import type { PaymentResult, PaymentSession } from "@/types/payment";

interface CreateBody {
  code: string;
  /** Chỉ khách chưa đăng nhập gửi SĐT; có `phone` thì request đi theo đường khách (skipAuth). */
  phone?: string;
}

function createBody({ code, phone }: CreateBody) {
  return { code, ...(phone ? { phone } : {}) };
}

export async function createVnpayPayment(input: CreateBody): Promise<PaymentSession> {
  const { data } = await api.post<PaymentSession>("/payments/vnpay/create", createBody(input), {
    skipAuth: !!input.phone,
  });
  return data;
}

export async function createStripeSession(input: CreateBody): Promise<PaymentSession> {
  const { data } = await api.post<PaymentSession>(
    "/payments/stripe/create-session",
    createBody(input),
    { skipAuth: !!input.phone },
  );
  return data;
}

/** Chỉ giữ các khóa `vnp_*` của query (giữ nguyên thứ tự, giá trị rỗng và khóa lặp). */
export function pickVnpayParams(searchParams: string): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(searchParams)) {
    if (k.startsWith("vnp_")) out.append(k, v);
  }
  return out;
}

/** Chuyển nguyên query vnp_* sang server để xác minh chữ ký (§13.3). */
export async function confirmVnpayReturn(searchParamsString: string): Promise<PaymentResult> {
  const qs = pickVnpayParams(searchParamsString).toString();
  // Nối thẳng vào path: không đi qua `query` của client (bỏ giá trị rỗng sẽ làm lệch chữ ký).
  const { data } = await api.get<PaymentResult>(`/payments/vnpay/return?${qs}`, {
    skipAuth: true,
  });
  return data;
}

export async function syncStripeSession(sessionId: string): Promise<PaymentResult> {
  const { data } = await api.post<PaymentResult>(
    "/payments/stripe/sync",
    { sessionId },
    { skipAuth: true },
  );
  return data;
}

export async function createMomoPayment(input: CreateBody): Promise<PaymentSession> {
  const { data } = await api.post<PaymentSession>("/payments/momo/create", createBody(input), {
    skipAuth: !!input.phone,
  });
  return data;
}

/** Tạo phiên thanh toán theo phương thức online của đơn (VNPay/MoMo giả/Stripe). */
export function createOnlinePayment(
  method: "VNPAY" | "STRIPE" | "MOMO",
  input: CreateBody,
): Promise<PaymentSession> {
  if (method === "VNPAY") return createVnpayPayment(input);
  if (method === "MOMO") return createMomoPayment(input);
  return createStripeSession(input);
}

/** Tham số trả về của MoMo (giả) trên trang kết quả; khóa khác bị bỏ. */
export const MOMO_RESULT_KEYS = [
  "partnerCode",
  "orderId",
  "requestId",
  "amount",
  "orderInfo",
  "orderType",
  "transId",
  "resultCode",
  "message",
  "payType",
  "responseTime",
  "extraData",
  "signature",
] as const;

export function pickMomoParams(searchParams: string): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(searchParams)) {
    if ((MOMO_RESULT_KEYS as readonly string[]).includes(k)) out.append(k, v);
  }
  return out;
}

/** Chuyển nguyên tham số MoMo sang server để xác minh chữ ký; server chỉ đọc trạng thái từ DB. */
export async function confirmMomoReturn(searchParamsString: string): Promise<PaymentResult> {
  const qs = pickMomoParams(searchParamsString).toString();
  const { data } = await api.get<PaymentResult>(`/payments/momo/return?${qs}`, {
    skipAuth: true,
  });
  return data;
}

export type MockChoice = "success" | "failed" | "cancel";

/**
 * Cổng giả (D-060): gửi nguyên tham số đã nhận (có chữ ký) và lựa chọn của người dùng.
 * Server kiểm chữ ký, xử lý qua đúng IPN thật rồi trả URL trang kết quả đã ký.
 */
export async function completeMockGateway(
  provider: "vnpay" | "momo",
  params: Record<string, string>,
  result: MockChoice,
): Promise<{ returnUrl: string }> {
  const { data } = await api.post<{ returnUrl: string }>(
    `/mock-gateway/${provider}/complete`,
    { params, result },
    { skipAuth: true },
  );
  return data;
}

export interface BankTransferInfo {
  orderCode: string;
  amount: number;
  content: string;
  bankName: string;
  bankBin: string;
  accountNo: string;
  accountName: string;
  qrPayload: string;
  qrDataUrl: string;
  expiresAt: string;
  claimedAt: string | null;
  /** true: BIN demo hoặc đang bật cổng giả -> phải cảnh báo KHÔNG chuyển tiền thật. */
  isDemo: boolean;
}

/** Hướng dẫn chuyển khoản + QR (D-061). Khách chưa đăng nhập gửi SĐT đặt hàng. */
export async function getBankTransfer(code: string, phone?: string): Promise<BankTransferInfo> {
  const { data } = await api.get<BankTransferInfo>(
    `/orders/${encodeURIComponent(code)}/bank-transfer`,
    { ...(phone ? { query: { phone }, skipAuth: true } : {}) },
  );
  return data;
}

/** "Tôi đã chuyển khoản": chỉ ghi nhận khách báo, KHÔNG đổi trạng thái thanh toán. */
export async function claimBankTransfer(
  code: string,
  phone?: string,
): Promise<{ claimedAt: string }> {
  const { data } = await api.post<{ claimedAt: string }>(
    `/orders/${encodeURIComponent(code)}/bank-transfer/claim`,
    phone ? { phone } : {},
    { ...(phone ? { skipAuth: true } : {}) },
  );
  return data;
}
