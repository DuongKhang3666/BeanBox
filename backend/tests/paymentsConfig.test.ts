import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../src/config/env.js';
import { getPaymentConfig, isProviderEnabled } from '../src/config/payments.js';
import { decidePaymentTransition } from '../src/modules/payments/payments.apply.js';

const base = { DATABASE_URL: 'x', JWT_ACCESS_SECRET: 'x'.repeat(32) } as NodeJS.ProcessEnv;

/** parseEnv gọi process.exit(1) khi lỗi: chặn để kiểm tra. */
function expectRejected(extra: Record<string, string>): string {
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('exit');
  }) as never);
  const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    expect(() => parseEnv({ ...base, ...extra })).toThrow('exit');
    expect(exit).toHaveBeenCalledWith(1);
    return String(err.mock.calls[0]?.[0] ?? '');
  } finally {
    exit.mockRestore();
    err.mockRestore();
  }
}

afterEach(() => vi.restoreAllMocks());

describe('parseEnv: cấu hình thanh toán', () => {
  it('STRIPE_SECRET_KEY sk_live_ bị từ chối và thông báo không lộ khóa', () => {
    const secret = 'sk_live_FAKEFAKEFAKE';
    const msg = expectRejected({ STRIPE_SECRET_KEY: secret });
    expect(msg).toContain('STRIPE_SECRET_KEY');
    expect(msg).not.toContain(secret);
  });

  it('STRIPE_SECRET_KEY dạng khác sk_test_ cũng bị từ chối; sk_test_ được nhận', () => {
    expectRejected({ STRIPE_SECRET_KEY: 'rk_test_abc' });
    expect(parseEnv({ ...base, STRIPE_SECRET_KEY: 'sk_test_abc' }).STRIPE_SECRET_KEY).toBe(
      'sk_test_abc',
    );
  });

  it('VNPAY_PAYMENT_URL http bị từ chối; mặc định là sandbox https', () => {
    expect(expectRejected({ VNPAY_PAYMENT_URL: 'http://sandbox.example.test/pay' })).toContain(
      'VNPAY_PAYMENT_URL',
    );
    expectRejected({ VNPAY_PAYMENT_URL: 'not a url' });
    expect(parseEnv(base).VNPAY_PAYMENT_URL).toBe(
      'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    );
  });

  it('VNPAY_RETURN_URL mặc định theo WEB_APP_URL; có giá trị thì giữ nguyên', () => {
    expect(parseEnv({ ...base, WEB_APP_URL: 'https://shop.example.test/' }).VNPAY_RETURN_URL).toBe(
      'https://shop.example.test/thanh-toan/ket-qua?provider=vnpay',
    );
    expect(parseEnv(base).VNPAY_RETURN_URL).toBe(
      'http://localhost:3000/thanh-toan/ket-qua?provider=vnpay',
    );
    expect(
      parseEnv({ ...base, VNPAY_RETURN_URL: 'https://x.example.test/r' }).VNPAY_RETURN_URL,
    ).toBe('https://x.example.test/r');
  });

  it('rate limit: mặc định 10/10/30, đọc được từ env, phải là số nguyên dương', () => {
    expect(parseEnv(base)).toMatchObject({
      ORDER_RATE_LIMIT_PER_MIN: 10,
      COUPON_RATE_LIMIT_PER_MIN: 10,
      QUOTE_RATE_LIMIT_PER_MIN: 30,
    });
    expect(
      parseEnv({ ...base, ORDER_RATE_LIMIT_PER_MIN: '200', QUOTE_RATE_LIMIT_PER_MIN: '300' }),
    ).toMatchObject({ ORDER_RATE_LIMIT_PER_MIN: 200, QUOTE_RATE_LIMIT_PER_MIN: 300 });
    expectRejected({ ORDER_RATE_LIMIT_PER_MIN: '0' });
    expectRejected({ COUPON_RATE_LIMIT_PER_MIN: 'abc' });
  });
});

describe('getPaymentConfig', () => {
  const env = parseEnv(base);

  it('thiếu cấu hình -> tắt; COD luôn bật', () => {
    const cfg = getPaymentConfig(env);
    expect(cfg).toEqual({ vnpay: null, stripe: null });
    expect(isProviderEnabled(cfg, 'COD')).toBe(true);
    expect(isProviderEnabled(cfg, 'VNPAY')).toBe(false);
    expect(isProviderEnabled(cfg, 'STRIPE')).toBe(false);
  });

  it('VNPay cần cả TMN_CODE và HASH_SECRET', () => {
    expect(getPaymentConfig({ ...env, VNPAY_TMN_CODE: 'TESTTMN01' }).vnpay).toBeNull();
    expect(getPaymentConfig({ ...env, VNPAY_HASH_SECRET: 'test-hash-secret' }).vnpay).toBeNull();
    const cfg = getPaymentConfig({
      ...env,
      VNPAY_TMN_CODE: 'TESTTMN01',
      VNPAY_HASH_SECRET: 'test-hash-secret',
    });
    expect(cfg.vnpay).toEqual({
      tmnCode: 'TESTTMN01',
      hashSecret: 'test-hash-secret',
      paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      returnUrl: 'http://localhost:3000/thanh-toan/ket-qua?provider=vnpay',
    });
  });

  it('Stripe bật khi có khóa; webhookSecret tùy chọn', () => {
    expect(getPaymentConfig({ ...env, STRIPE_SECRET_KEY: 'sk_test_x' }).stripe).toEqual({
      secretKey: 'sk_test_x',
      webhookSecret: null,
    });
    expect(
      getPaymentConfig({
        ...env,
        STRIPE_SECRET_KEY: 'sk_test_x',
        STRIPE_WEBHOOK_SECRET: 'whsec_test',
      }).stripe?.webhookSecret,
    ).toBe('whsec_test');
  });
});

describe('decidePaymentTransition (máy trạng thái Payment)', () => {
  it('PENDING -> áp dụng cả hai kết quả', () => {
    expect(decidePaymentTransition('PENDING', 'SUCCEEDED')).toBe('APPLY');
    expect(decidePaymentTransition('PENDING', 'FAILED')).toBe('APPLY');
  });
  it('FAILED -> SUCCEEDED được (thành công muộn); FAILED lặp là trùng', () => {
    expect(decidePaymentTransition('FAILED', 'SUCCEEDED')).toBe('APPLY');
    expect(decidePaymentTransition('FAILED', 'FAILED')).toBe('DUPLICATE');
  });
  it('SUCCEEDED/REFUNDED: thành công lặp là trùng; thất bại đến sau bị bỏ qua', () => {
    expect(decidePaymentTransition('SUCCEEDED', 'SUCCEEDED')).toBe('DUPLICATE');
    expect(decidePaymentTransition('SUCCEEDED', 'FAILED')).toBe('IGNORE');
    expect(decidePaymentTransition('REFUNDED', 'SUCCEEDED')).toBe('DUPLICATE');
    expect(decidePaymentTransition('REFUNDED', 'FAILED')).toBe('IGNORE');
  });
});
