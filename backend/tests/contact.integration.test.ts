import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { bearer, clearTestOutbox, testOutbox } from './authHelpers.js';
import { createFixtures, errOf, type Who } from './checkoutHelpers.js';

/** M6b (D-023): POST /contact (api-contract §14.11). */

const PREFIX = 'tm6c-';
const BIG = 100_000;
const STORE_EMAIL = `${PREFIX}store@example.test`;
const SENDER = `${PREFIX}Khach@Example.Test`;
let app: Express;
const fx = createFixtures(() => app, PREFIX);

const base = {
  name: 'Nguyễn Văn An',
  email: SENDER,
  message: 'Tôi muốn hỏi về máy xay cà phê.',
};
const send = (body: Record<string, unknown>, who: Who = {}) =>
  fx.call('post', '/contact', who, body);
const rows = () => prisma.contactMessage.findMany({ where: { email: { startsWith: PREFIX } } });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForStoreMail(timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = testOutbox.filter((m) => m.to === STORE_EMAIL);
    if (found.length > 0) return found[found.length - 1]!;
    await wait(25);
  }
  throw new Error('Không có mail gửi tới cửa hàng');
}

async function cleanup() {
  await prisma.contactMessage.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  app = createApp({
    generalRateLimit: BIG,
    authRateLimit: BIG,
    contactRateLimit: BIG,
  });
  await cleanup();
  await fx.clean();
  const cur = await prisma.setting.findUnique({ where: { key: 'store.contact' } });
  const v = (cur?.value ?? {}) as Record<string, unknown>;
  await fx.setSetting('store.contact', {
    name: 'BeanBox',
    phone: '',
    address: '',
    ...v,
    email: STORE_EMAIL,
  } as never);
});
afterAll(async () => {
  await cleanup();
  await fx.restoreSettings();
  await fx.clean();
  await prisma.$disconnect();
});
beforeEach(async () => {
  clearTestOutbox();
  await cleanup();
});

describe('POST /contact', () => {
  it('khách vãng lai: 201 {received:true}, lưu chuẩn hóa, gửi mail cho cửa hàng', async () => {
    const res = await send({
      ...base,
      phone: '+84 901-234.567',
      subject: '   ',
      message: '<script>alert(1)</script>\nDòng hai & "ba"',
      extra: 'bị bỏ qua',
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { received: true } });

    const saved = await rows();
    expect(saved).toHaveLength(1);
    const m = saved[0]!;
    expect(m.email).toBe(SENDER.toLowerCase());
    expect(m.phone).toBe('0901234567');
    expect(m.subject).toBeNull();
    expect(m.userId).toBeNull();
    expect(m.status).toBe('NEW');
    expect(m.message).toContain('<script>');

    const mail = await waitForStoreMail();
    expect(mail.replyTo).toBe(SENDER.toLowerCase());
    expect(mail.subject).toBe('[BeanBox] Liên hệ mới: (không tiêu đề)');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.text).toContain('0901234567');
    await wait(100);
    expect(testOutbox.filter((x) => x.to === SENDER.toLowerCase() || x.to === SENDER)).toHaveLength(
      0,
    );
    expect(testOutbox).toHaveLength(1);
  });

  it('name chứa HTML được escape trong mail; subject xuất hiện ở tiêu đề mail', async () => {
    const res = await send({
      ...base,
      name: '<script>alert(1)</script>',
      subject: 'Hỏi hàng',
      phone: '',
    });
    expect(res.status).toBe(201);
    const mail = await waitForStoreMail();
    expect(mail.html).not.toContain('<script>');
    expect(mail.subject).toBe('[BeanBox] Liên hệ mới: Hỏi hàng');
    expect((await rows())[0]!.phone).toBeNull();
  });

  it('có Bearer hợp lệ: gắn userId; Bearer sai: 401 và không lưu', async () => {
    const u = await fx.mkUser('member');
    const ok = await send(base, u.who);
    expect(ok.status).toBe(201);
    expect((await rows())[0]!.userId).toBe(u.id);

    await cleanup();
    const bad = await send(base, { auth: bearer('a.b.c') });
    expect(bad.status).toBe(401);
    expect(await rows()).toHaveLength(0);
  });

  it('honeypot: 201, không lưu, không gửi mail', async () => {
    const res = await send({ ...base, website: 'http://spam.example' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { received: true } });
    await wait(150);
    expect(await rows()).toHaveLength(0);
    expect(testOutbox).toHaveLength(0);
  });

  it('website chỉ có khoảng trắng: coi như rỗng, lưu bình thường', async () => {
    const res = await send({ ...base, website: '   ' });
    expect(res.status).toBe(201);
    expect(await rows()).toHaveLength(1);
  });

  describe('validate', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['name 1 ký tự', { name: 'A' }, 'name'],
      ['name có xuống dòng', { name: 'An\nBình' }, 'name'],
      ['subject có CRLF', { subject: 'Hỏi\r\nBcc: x@y.z' }, 'subject'],
      ['subject 151 ký tự', { subject: 'a'.repeat(151) }, 'subject'],
      ['message 9 ký tự', { message: '123456789' }, 'message'],
      ['message 2001 ký tự', { message: 'a'.repeat(2001) }, 'message'],
      ['message có ký tự điều khiển', { message: 'Xin chào\u0001 bạn nhé' }, 'message'],
      ['message có NUL', { message: 'Xin chào\u0000 bạn nhé' }, 'message'],
      ['email sai', { email: 'khong-phai-email' }, 'email'],
      ['phone sai', { phone: '12345' }, 'phone'],
      ['website quá 200', { website: 'a'.repeat(201) }, 'website'],
    ];
    it.each(cases)('%s -> 400', async (_n, over, field) => {
      const res = await send({ ...base, ...over });
      expect(res.status).toBe(400);
      expect(errOf(res).code).toBe('VALIDATION_ERROR');
      const details = (errOf(res) as unknown as { details: Array<{ field: string }> }).details;
      expect(details.map((d) => d.field)).toContain(field);
      expect(await rows()).toHaveLength(0);
    });

    it('message cho phép xuống dòng/tab, 2000 ký tự hợp lệ', async () => {
      expect((await send({ ...base, message: 'Dòng 1\r\nDòng\t2 xin chào' })).status).toBe(201);
      expect((await send({ ...base, message: 'a'.repeat(2000) })).status).toBe(201);
    });
  });
});

describe('rate limit POST /contact', () => {
  it('3 request/cửa sổ: thứ 4 -> 429 RATE_LIMITED + Retry-After; honeypot và Bearer cũng bị tính', async () => {
    const limited = createApp({ generalRateLimit: BIG, authRateLimit: BIG, contactRateLimit: 3 });
    const prev = app;
    app = limited;
    try {
      const u = await fx.mkUser('rl');
      expect((await send({ ...base, website: 'bot' })).status).toBe(201); // honeypot bị tính
      expect((await send(base, u.who)).status).toBe(201); // Bearer bị tính
      expect((await send(base)).status).toBe(201);
      const res = await send(base);
      expect(res.status).toBe(429);
      expect(errOf(res).code).toBe('RATE_LIMITED');
      expect(res.headers['retry-after']).toBeDefined();
      // Có Bearer vẫn bị chặn.
      expect((await send(base, u.who)).status).toBe(429);
      expect(await rows()).toHaveLength(2);
    } finally {
      app = prev;
    }
  });
});
