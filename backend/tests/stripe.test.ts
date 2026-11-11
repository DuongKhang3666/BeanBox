import { describe, expect, it } from 'vitest';
import {
  computeStripeSignature,
  createCheckoutSession,
  createFetchStripeHttp,
  expireSession,
  parseStripeSession,
  parseStripeSignatureHeader,
  retrieveSession,
  stripeRawPayload,
  verifyStripeSignature,
  type StripeHttp,
} from '../src/modules/payments/stripe.js';

// Giá trị test tự đặt, KHÔNG phải secret thật.
const SECRET = 'whsec_test_fake';
const NOW = Date.UTC(2026, 10, 11, 8, 0, 0);
const T = Math.floor(NOW / 1000);
const BODY = '{ "id":"evt_1",  "type":"checkout.session.completed" }';

const header = (t: number, body: string, secret = SECRET, extra = '') =>
  `t=${t},v1=${computeStripeSignature(t, body, secret)}${extra}`;

describe('verifyStripeSignature', () => {
  it('chữ ký đúng -> true', () => {
    expect(verifyStripeSignature(BODY, header(T, BODY), SECRET, NOW)).toBe(true);
    expect(verifyStripeSignature(Buffer.from(BODY), header(T, BODY), SECRET, NOW)).toBe(true);
  });

  it('sai secret -> false', () => {
    expect(verifyStripeSignature(BODY, header(T, BODY, 'whsec_other_fake'), SECRET, NOW)).toBe(
      false,
    );
    expect(verifyStripeSignature(BODY, header(T, BODY), '', NOW)).toBe(false);
  });

  it('body bị sửa 1 byte -> false', () => {
    const h = header(T, BODY);
    expect(verifyStripeSignature(BODY.replace('evt_1', 'evt_2'), h, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(`${BODY} `, h, SECRET, NOW)).toBe(false);
  });

  it('timestamp bị đổi trong header -> false', () => {
    const sig = computeStripeSignature(T, BODY, SECRET);
    expect(verifyStripeSignature(BODY, `t=${T + 1},v1=${sig}`, SECRET, NOW)).toBe(false);
  });

  it('t quá cũ hoặc ở tương lai quá 300 giây -> false; đúng biên 300 -> true', () => {
    expect(verifyStripeSignature(BODY, header(T - 301, BODY), SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, header(T + 301, BODY), SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, header(T - 300, BODY), SECRET, NOW)).toBe(true);
    expect(verifyStripeSignature(BODY, header(T + 300, BODY), SECRET, NOW)).toBe(true);
  });

  it('header thiếu hoặc méo -> false', () => {
    const sig = computeStripeSignature(T, BODY, SECRET);
    for (const h of [
      undefined,
      '',
      'garbage',
      `v1=${sig}`,
      `t=${T}`,
      `t=abc,v1=${sig}`,
      `t=${T},v1=zz`,
      `t=${T},v1=${sig.slice(0, 62)}`,
      `t=${T},v0=${sig}`,
      `t=-5,v1=${sig}`,
    ]) {
      expect(verifyStripeSignature(BODY, h, SECRET, NOW), String(h)).toBe(false);
    }
  });

  it('nhiều v1: khớp bất kỳ cái nào là hợp lệ, dù đứng trước hay sau', () => {
    const good = computeStripeSignature(T, BODY, SECRET);
    const bad = computeStripeSignature(T, BODY, 'whsec_old_fake');
    expect(verifyStripeSignature(BODY, `t=${T},v1=${bad},v1=${good}`, SECRET, NOW)).toBe(true);
    expect(verifyStripeSignature(BODY, `t=${T},v1=${good},v1=${bad}`, SECRET, NOW)).toBe(true);
    expect(verifyStripeSignature(BODY, `t=${T},v1=${bad},v1=${bad}`, SECRET, NOW)).toBe(false);
  });

  it('chịu được khoảng trắng quanh dấu phẩy', () => {
    const sig = computeStripeSignature(T, BODY, SECRET);
    expect(verifyStripeSignature(BODY, ` t=${T} , v1=${sig} `, SECRET, NOW)).toBe(true);
  });
});

describe('parseStripeSignatureHeader', () => {
  it('đọc t và các v1', () => {
    const a = 'a'.repeat(64);
    const b = 'b'.repeat(64);
    expect(parseStripeSignatureHeader(`t=123,v1=${a},v0=x,v1=${b}`)).toEqual({
      timestamp: 123,
      signatures: [a, b],
    });
  });
});

interface Call {
  method: string;
  path: string;
  form?: Record<string, string> | undefined;
  headers?: Record<string, string> | undefined;
}

function fakeHttp(respond: (c: Call) => { status: number; json: unknown }) {
  const calls: Call[] = [];
  const http: StripeHttp = {
    request(method, path, form, headers) {
      const c: Call = { method, path, form, headers };
      calls.push(c);
      return Promise.resolve(respond(c));
    },
  };
  return { http, calls };
}

describe('createCheckoutSession', () => {
  it('gửi đúng form §13.2, không có email/SĐT', async () => {
    const { http, calls } = fakeHttp(() => ({
      status: 200,
      json: { id: 'cs_test_abc', url: 'https://checkout.example.test/pay/cs_test_abc' },
    }));
    const now = new Date(NOW);
    const out = await createCheckoutSession(http, {
      paymentId: 'ckpay1',
      orderCode: 'BB-261111-K7QP',
      amount: 317000,
      now,
      webAppUrl: 'https://shop.example.test',
    });
    expect(out).toEqual({
      id: 'cs_test_abc',
      url: 'https://checkout.example.test/pay/cs_test_abc',
    });
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.method).toBe('POST');
    expect(c.path).toBe('/checkout/sessions');
    expect(c.headers).toEqual({ 'Idempotency-Key': 'ckpay1' });
    expect(c.form).toMatchObject({
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'vnd',
      'line_items[0][price_data][unit_amount]': '317000',
      'line_items[0][price_data][product_data][name]': 'Đơn hàng BB-261111-K7QP',
      client_reference_id: 'ckpay1',
      'metadata[orderCode]': 'BB-261111-K7QP',
      'metadata[paymentId]': 'ckpay1',
      success_url:
        'https://shop.example.test/thanh-toan/ket-qua?provider=stripe&session_id={CHECKOUT_SESSION_ID}',
      cancel_url:
        'https://shop.example.test/thanh-toan/ket-qua?provider=stripe&cancelled=1&code=BB-261111-K7QP',
    });
    const expires = Number(c.form!.expires_at);
    expect(expires - T).toBeGreaterThanOrEqual(30 * 60);
    expect(expires - T).toBeLessThanOrEqual(31 * 60 + 30);
    expect(Object.keys(c.form!).join(' ')).not.toMatch(/email|phone|address|customer/i);
  });

  it('HTTP lỗi hoặc thiếu url -> ném StripeApiError, message không chứa body', async () => {
    const bad = fakeHttp(() => ({
      status: 400,
      json: {
        error: {
          type: 'invalid_request_error',
          code: 'parameter_invalid',
          message: 'SECRET-DETAIL',
        },
      },
    }));
    const p = { paymentId: 'p', orderCode: 'BB-1', amount: 1000, now: new Date(NOW) };
    const err = await createCheckoutSession(bad.http, p).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('400');
    expect((err as Error).message).not.toContain('SECRET-DETAIL');

    const noUrl = fakeHttp(() => ({ status: 200, json: { id: 'cs_test_x' } }));
    await expect(createCheckoutSession(noUrl.http, p)).rejects.toThrow();
  });
});

describe('retrieveSession / expireSession', () => {
  it('retrieve: GET đúng path và parse các trường', async () => {
    const { http, calls } = fakeHttp(() => ({
      status: 200,
      json: {
        id: 'cs_test_abc',
        payment_status: 'paid',
        status: 'complete',
        amount_total: 220000,
        currency: 'VND',
        client_reference_id: 'ckpay1',
        metadata: { paymentId: 'ckpay1', orderCode: 'BB-1' },
        payment_intent: 'pi_123',
      },
    }));
    const s = await retrieveSession(http, 'cs_test_abc');
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/checkout/sessions/cs_test_abc' });
    expect(s).toMatchObject({
      id: 'cs_test_abc',
      paymentStatus: 'paid',
      amountTotal: 220000,
      currency: 'vnd',
      clientReferenceId: 'ckpay1',
      metadataPaymentId: 'ckpay1',
      paymentIntent: 'pi_123',
    });
    expect(stripeRawPayload(s)).toEqual({
      id: 'cs_test_abc',
      payment_status: 'paid',
      amount_total: 220000,
      currency: 'vnd',
      payment_intent: 'pi_123',
    });
  });

  it('expire: POST /expire; lỗi HTTP -> ném', async () => {
    const ok = fakeHttp(() => ({ status: 200, json: { id: 'cs_test_abc', status: 'expired' } }));
    await expireSession(ok.http, 'cs_test_abc');
    expect(ok.calls[0]).toMatchObject({
      method: 'POST',
      path: '/checkout/sessions/cs_test_abc/expire',
    });
    const bad = fakeHttp(() => ({ status: 500, json: null }));
    await expect(expireSession(bad.http, 'cs_test_abc')).rejects.toThrow();
  });

  it('parseStripeSession: thiếu id -> null; payment_intent dạng object', () => {
    expect(parseStripeSession({})).toBeNull();
    expect(parseStripeSession(null)).toBeNull();
    expect(parseStripeSession({ id: 'cs_1', payment_intent: { id: 'pi_9' } })?.paymentIntent).toBe(
      'pi_9',
    );
  });
});

describe('createFetchStripeHttp (fetch giả, không mạng)', () => {
  it('POST: Bearer, form-urlencoded, header thêm, có AbortSignal; GET: không body', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = ((url: string, init: RequestInit) => {
      seen.push({ url, init });
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }) as unknown as typeof fetch;
    const http = createFetchStripeHttp('sk_test_fake', { fetchImpl });

    const r = await http.request(
      'POST',
      '/checkout/sessions',
      { a: 'x y', 'b[c]': 'é' },
      {
        'Idempotency-Key': 'k1',
      },
    );
    expect(r).toEqual({ status: 200, json: { ok: true } });
    const post = seen[0]!;
    expect(post.url).toBe('https://api.stripe.com/v1/checkout/sessions');
    const h = post.init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer sk_test_fake');
    expect(h['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(h['Idempotency-Key']).toBe('k1');
    expect(post.init.body).toBe('a=x+y&b%5Bc%5D=%C3%A9');
    expect(post.init.signal).toBeInstanceOf(AbortSignal);

    await http.request('GET', '/checkout/sessions/cs_test_1');
    const get = seen[1]!;
    expect(get.init.method).toBe('GET');
    expect(get.init.body).toBeUndefined();
    expect((get.init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('body không phải JSON -> json null, không ném', async () => {
    const fetchImpl = (() =>
      Promise.resolve(new Response('<html>', { status: 502 }))) as unknown as typeof fetch;
    const http = createFetchStripeHttp('sk_test_fake', { fetchImpl });
    expect(await http.request('GET', '/x')).toEqual({ status: 502, json: null });
  });
});
