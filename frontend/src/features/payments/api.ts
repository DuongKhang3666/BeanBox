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
