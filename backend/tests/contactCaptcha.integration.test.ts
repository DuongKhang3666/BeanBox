import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { TurnstileResult, TurnstileVerifier } from '../src/lib/turnstile.js';
import { prisma } from '../src/lib/prisma.js';
import { API } from './authHelpers.js';
import { errOf } from './checkoutHelpers.js';

/** M7 (D-028): captcha Turnstile cho POST /contact và contactCaptcha ở GET /settings/public. */

const PREFIX = 'tm7c-';
const BIG = 100_000;
const SITE_KEY = 'fake-site-key-public';
const SECRET_KEY = 'fake-secret-key-never-leak';
const base = {
  name: 'Nguyễn Văn An',
  email: `${PREFIX}khach@example.test`,
  message: 'Tôi muốn hỏi về máy xay cà phê.',
};

const rows = () => prisma.contactMessage.findMany({ where: { email: { startsWith: PREFIX } } });
const cleanup = () =>
  prisma.contactMessage.deleteMany({ where: { email: { startsWith: PREFIX } } });

function mkApp(verifyResult: TurnstileResult | null) {
  const verify = vi.fn<TurnstileVerifier>(async () => verifyResult ?? 'valid');
  const app: Express = createApp({
    generalRateLimit: BIG,
    authRateLimit: BIG,
    contactRateLimit: BIG,
    ...(verifyResult === null
      ? { captchaConfig: null }
      : { captchaConfig: { siteKey: SITE_KEY, secretKey: SECRET_KEY }, captchaVerify: verify }),
  });
  return { app, verify };
}
const post = (app: Express, body: Record<string, unknown>) =>
  request(app).post(`${API}/contact`).send(body);

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('POST /contact: captcha tắt', () => {
  it('giữ hành vi cũ, bỏ qua captchaToken, không gọi verifier', async () => {
    const { app, verify } = mkApp(null);
    const res = await post(app, { ...base, captchaToken: 'bat-ky' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { received: true } });
    expect(await rows()).toHaveLength(1);
    expect(verify).not.toHaveBeenCalled();
    expect((await post(app, base)).status).toBe(201);
  });
});

describe('POST /contact: captcha bật', () => {
  it('token hợp lệ -> 201, lưu, verifier nhận đúng token', async () => {
    const { app, verify } = mkApp('valid');
    const res = await post(app, { ...base, captchaToken: 'tok-ok' });
    expect(res.status).toBe(201);
    expect(await rows()).toHaveLength(1);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0]![0]).toBe('tok-ok');
  });

  it('thiếu token (hoặc rỗng/khoảng trắng) -> 400 CAPTCHA_FAILED, không lưu, không gọi verifier', async () => {
    const { app, verify } = mkApp('valid');
    for (const extra of [{}, { captchaToken: '' }, { captchaToken: '   ' }]) {
      const res = await post(app, { ...base, ...extra });
      expect(res.status).toBe(400);
      expect(errOf(res).code).toBe('CAPTCHA_FAILED');
      expect(errOf(res).message).toMatch(/captcha/i);
    }
    expect(await rows()).toHaveLength(0);
    expect(verify).not.toHaveBeenCalled();
  });

  it('token sai -> 400 CAPTCHA_FAILED, không lưu', async () => {
    const { app } = mkApp('invalid');
    const res = await post(app, { ...base, captchaToken: 'tok-bad' });
    expect(res.status).toBe(400);
    expect(errOf(res).code).toBe('CAPTCHA_FAILED');
    expect(await rows()).toHaveLength(0);
  });

  it('verify không khả dụng -> 503 SERVICE_UNAVAILABLE, không lưu', async () => {
    const { app } = mkApp('unavailable');
    const res = await post(app, { ...base, captchaToken: 'tok' });
    expect(res.status).toBe(503);
    expect(errOf(res).code).toBe('SERVICE_UNAVAILABLE');
    expect(await rows()).toHaveLength(0);
  });

  it('validate chạy trước captcha: body sai -> 400 VALIDATION_ERROR, verifier không được gọi', async () => {
    const { app, verify } = mkApp('valid');
    const res = await post(app, { ...base, name: 'A', captchaToken: 'tok' });
    expect(res.status).toBe(400);
    expect(errOf(res).code).toBe('VALIDATION_ERROR');
    const long = await post(app, { ...base, captchaToken: 'a'.repeat(2049) });
    expect(long.status).toBe(400);
    expect(errOf(long).code).toBe('VALIDATION_ERROR');
    expect(verify).not.toHaveBeenCalled();
  });

  it('honeypot -> 201 giả, không lưu, verifier KHÔNG được gọi (kể cả thiếu token)', async () => {
    const { app, verify } = mkApp('invalid');
    const res = await post(app, { ...base, website: 'http://spam.example' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { received: true } });
    expect(await rows()).toHaveLength(0);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('GET /settings/public: contactCaptcha', () => {
  it('bật -> { provider, siteKey }, không chứa secret', async () => {
    const { app } = mkApp('valid');
    const res = await request(app).get(`${API}/settings/public`);
    expect(res.status).toBe(200);
    expect(res.body.data.contactCaptcha).toEqual({ provider: 'turnstile', siteKey: SITE_KEY });
    expect(JSON.stringify(res.body)).not.toContain(SECRET_KEY);
  });

  it('tắt -> null', async () => {
    const { app } = mkApp(null);
    const res = await request(app).get(`${API}/settings/public`);
    expect(res.status).toBe(200);
    expect(res.body.data.contactCaptcha).toBeNull();
  });
});
