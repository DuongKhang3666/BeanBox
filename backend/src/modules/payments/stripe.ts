import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import type { StripeConfig } from '../../config/payments.js';
import type { PaymentProviderAdapter } from './payments.providers.js';

/**
 * Stripe Checkout (api-contract §13.2, §13.4) gọi bằng HTTP thuần, KHÔNG dùng SDK (D-014).
 * `StripeHttp` tiêm được để test không đi qua mạng.
 */

export interface StripeHttpResponse {
  status: number;
  json: unknown;
}

export interface StripeHttp {
  request(
    method: 'GET' | 'POST',
    path: string,
    form?: Record<string, string>,
    headers?: Record<string, string>,
  ): Promise<StripeHttpResponse>;
}

export const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const STRIPE_TIMEOUT_MS = 10_000;
/** Stripe yêu cầu phiên sống tối thiểu 30 phút kể từ lúc tạo; thêm đệm cho độ trễ mạng. */
const SESSION_TTL_SEC = 30 * 60 + 60;

export interface FetchStripeHttpOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Client mặc định: fetch toàn cục, Bearer secretKey, form-urlencoded, timeout 10 giây. */
export function createFetchStripeHttp(
  secretKey: string,
  opts: FetchStripeHttpOptions = {},
): StripeHttp {
  const base = opts.baseUrl ?? STRIPE_API_BASE;
  const timeoutMs = opts.timeoutMs ?? STRIPE_TIMEOUT_MS;
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    async request(method, path, form, headers) {
      const res = await doFetch(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${secretKey}`,
          ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...headers,
        },
        ...(method === 'POST' ? { body: new URLSearchParams(form ?? {}).toString() } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { status: res.status, json };
    },
  };
}

// ---------------------------------------------------------------------------
// Phiên Checkout

export interface StripeSession {
  id: string;
  /** `paid` | `unpaid` | `no_payment_required`. */
  paymentStatus: string;
  /** `open` | `complete` | `expired`. */
  status: string;
  amountTotal: number | null;
  currency: string | null;
  clientReferenceId: string | null;
  metadataPaymentId: string | null;
  paymentIntent: string | null;
  url: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** Đọc object Checkout Session từ JSON của Stripe; thiếu `id` -> null. */
export function parseStripeSession(raw: unknown): StripeSession | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || raw.id === '') return null;
  const metadata = isObj(raw.metadata) ? raw.metadata : {};
  const pi = raw.payment_intent;
  return {
    id: raw.id,
    paymentStatus: typeof raw.payment_status === 'string' ? raw.payment_status : '',
    status: typeof raw.status === 'string' ? raw.status : '',
    amountTotal: typeof raw.amount_total === 'number' ? raw.amount_total : null,
    currency: typeof raw.currency === 'string' ? raw.currency.toLowerCase() : null,
    clientReferenceId: strOrNull(raw.client_reference_id),
    metadataPaymentId: strOrNull(metadata.paymentId),
    paymentIntent: strOrNull(pi) ?? (isObj(pi) ? strOrNull(pi.id) : null),
    url: strOrNull(raw.url),
  };
}

/** Chỉ các trường cần lưu vào `Payment.rawPayload` (không lưu toàn bộ object). */
export function stripeRawPayload(s: StripeSession): Record<string, unknown> {
  return {
    id: s.id,
    payment_status: s.paymentStatus,
    amount_total: s.amountTotal,
    currency: s.currency,
    payment_intent: s.paymentIntent,
  };
}

/** Lỗi Stripe: chỉ giữ status/type/code, không đưa body thô vào message. */
export class StripeApiError extends Error {
  constructor(
    readonly status: number,
    readonly stripeType: string | null,
    readonly stripeCode: string | null,
  ) {
    super(`Stripe API lỗi (HTTP ${status}${stripeCode ? `, ${stripeCode}` : ''})`);
    this.name = 'StripeApiError';
  }
}

function assertOk(res: StripeHttpResponse): unknown {
  if (res.status >= 200 && res.status < 300) return res.json;
  const err = isObj(res.json) && isObj(res.json.error) ? res.json.error : {};
  throw new StripeApiError(res.status, strOrNull(err.type), strOrNull(err.code));
}

export interface CreateCheckoutParams {
  paymentId: string;
  orderCode: string;
  amount: number;
  now: Date;
  webAppUrl?: string;
}

export async function createCheckoutSession(
  http: StripeHttp,
  p: CreateCheckoutParams,
): Promise<{ id: string; url: string }> {
  const web = p.webAppUrl ?? env.WEB_APP_URL;
  const form: Record<string, string> = {
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'vnd',
    // VND không có đơn vị thập phân: unit_amount = số đồng, không nhân 100.
    'line_items[0][price_data][unit_amount]': String(p.amount),
    'line_items[0][price_data][product_data][name]': `Đơn hàng ${p.orderCode}`,
    client_reference_id: p.paymentId,
    'metadata[orderCode]': p.orderCode,
    'metadata[paymentId]': p.paymentId,
    success_url: `${web}/thanh-toan/ket-qua?provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${web}/thanh-toan/ket-qua?provider=stripe&cancelled=1&code=${encodeURIComponent(p.orderCode)}`,
    expires_at: String(Math.floor(p.now.getTime() / 1000) + SESSION_TTL_SEC),
  };
  const json = assertOk(
    await http.request('POST', '/checkout/sessions', form, { 'Idempotency-Key': p.paymentId }),
  );
  const session = parseStripeSession(json);
  if (!session || !session.url) throw new StripeApiError(502, null, 'invalid_response');
  return { id: session.id, url: session.url };
}

export async function retrieveSession(http: StripeHttp, id: string): Promise<StripeSession> {
  const json = assertOk(await http.request('GET', `/checkout/sessions/${encodeURIComponent(id)}`));
  const session = parseStripeSession(json);
  if (!session) throw new StripeApiError(502, null, 'invalid_response');
  return session;
}

export async function expireSession(http: StripeHttp, id: string): Promise<void> {
  assertOk(await http.request('POST', `/checkout/sessions/${encodeURIComponent(id)}/expire`, {}));
}

/** Http mặc định theo cấu hình; null khi Stripe chưa bật. */
export function defaultStripeHttp(config: StripeConfig | null): StripeHttp | null {
  return config ? createFetchStripeHttp(config.secretKey) : null;
}

export const stripeAdapter: PaymentProviderAdapter = {
  provider: 'STRIPE',
  isConfigured: (config) => config.stripe !== null,
  async createSession({ payment, order, config, now, stripeHttp }) {
    const http = stripeHttp ?? defaultStripeHttp(config.stripe);
    if (!http) throw new Error('Stripe chưa được cấu hình');
    const session = await createCheckoutSession(http, {
      paymentId: payment.id,
      orderCode: order.code,
      amount: order.grandTotal,
      now,
    });
    return { redirectUrl: session.url, providerRef: session.id };
  },
};

// ---------------------------------------------------------------------------
// Chữ ký webhook (hàm thuần)

export const STRIPE_SIGNATURE_TOLERANCE_SEC = 300;

export interface ParsedStripeSignature {
  timestamp: number;
  signatures: string[];
}

/** `t=<unix>,v1=<hex>[,v1=<hex>...]`; thiếu `t` hợp lệ hoặc thiếu `v1` -> null. */
export function parseStripeSignatureHeader(
  header: string | undefined,
): ParsedStripeSignature | null {
  if (!header) return null;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't' && /^\d{1,12}$/.test(value)) timestamp = Number(value);
    else if (key === 'v1' && /^[0-9a-fA-F]{64}$/.test(value)) signatures.push(value);
  }
  return timestamp === null || signatures.length === 0 ? null : { timestamp, signatures };
}

/** HMAC-SHA256 hex của `${t}.${rawBody}` (dùng đúng byte gốc của body). */
export function computeStripeSignature(
  timestamp: number,
  rawBody: Buffer | string,
  secret: string,
): string {
  return createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
}

export function verifyStripeSignature(
  rawBody: Buffer | string,
  header: string | undefined,
  secret: string,
  nowMs: number = Date.now(),
  toleranceSec: number = STRIPE_SIGNATURE_TOLERANCE_SEC,
): boolean {
  const parsed = parseStripeSignatureHeader(header);
  if (!parsed || !secret) return false;
  if (Math.abs(nowMs / 1000 - parsed.timestamp) > toleranceSec) return false;
  const expected = Buffer.from(computeStripeSignature(parsed.timestamp, rawBody, secret), 'hex');
  // Duyệt hết, không thoát sớm.
  let ok = false;
  for (const sig of parsed.signatures) {
    const got = Buffer.from(sig, 'hex');
    if (got.length === expected.length && timingSafeEqual(got, expected)) ok = true;
  }
  return ok;
}
