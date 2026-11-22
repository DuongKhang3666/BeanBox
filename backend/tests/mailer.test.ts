import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../src/config/env.js';
import { logger } from '../src/lib/logger.js';
import {
  buildSmtpTransportOptions,
  deliverWithRetry,
  isTransientMailError,
  sendMailInBackground,
  setMailer,
  testOutbox,
  type MailMessage,
} from '../src/lib/mailer.js';

/** R-06 (D-056): tùy chọn transport theo env, retry lỗi tạm thời, không ném lỗi ra luồng request. */

const GOOD_SECRET = 'Zq7' + 'k9'.repeat(20);
const base = { DATABASE_URL: 'x', JWT_ACCESS_SECRET: GOOD_SECRET } as NodeJS.ProcessEnv;
const prod = {
  ...base,
  NODE_ENV: 'production',
  INTERNAL_API_SECRET: GOOD_SECRET,
  TOTP_ENCRYPTION_KEY: 'a1'.repeat(32),
};

const MSG: MailMessage = {
  to: 'khach@example.test',
  subject: 'Đặt lại mật khẩu',
  text: 'NOI-DUNG-BI-MAT https://beanbox.test/dat-lai-mat-khau?token=TOKEN-BI-MAT',
  html: '<p>NOI-DUNG-BI-MAT</p>',
};

const tempErr = (code = 'ECONNECTION') => Object.assign(new Error('boom'), { code });
const smtpErr = (responseCode: number) =>
  Object.assign(new Error('smtp'), { code: 'EENVELOPE', responseCode });

afterEach(() => {
  setMailer(undefined);
  vi.restoreAllMocks();
});

describe('parseEnv: SMTP_SECURE / SMTP_REQUIRE_TLS', () => {
  it('mặc định: secure=false; requireTLS=false khi không phải production', () => {
    for (const NODE_ENV of ['development', 'test'] as const) {
      const e = parseEnv({ ...base, NODE_ENV });
      expect(e.SMTP_SECURE).toBe(false);
      expect(e.SMTP_REQUIRE_TLS).toBe(false);
    }
  });

  it('production: requireTLS mặc định true; đặt false tường minh thì tôn trọng', () => {
    expect(parseEnv(prod).SMTP_REQUIRE_TLS).toBe(true);
    expect(parseEnv({ ...prod, SMTP_REQUIRE_TLS: 'false' }).SMTP_REQUIRE_TLS).toBe(false);
    expect(parseEnv({ ...base, SMTP_REQUIRE_TLS: 'true' }).SMTP_REQUIRE_TLS).toBe(true);
  });

  it('SMTP_SECURE=true bật TLS ngầm định; chuỗi rỗng coi như chưa đặt', () => {
    expect(parseEnv({ ...base, SMTP_SECURE: 'true' }).SMTP_SECURE).toBe(true);
    expect(parseEnv({ ...base, SMTP_SECURE: '' }).SMTP_SECURE).toBe(false);
    expect(parseEnv({ ...prod, SMTP_REQUIRE_TLS: '' }).SMTP_REQUIRE_TLS).toBe(true);
  });

  it('giá trị không phải true/false -> lỗi cấu hình', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => parseEnv({ ...base, SMTP_SECURE: 'yes' })).toThrow('exit');
    expect(String(err.mock.calls[0]?.[0])).toContain('SMTP_SECURE');
    exit.mockRestore();
  });
});

describe('buildSmtpTransportOptions', () => {
  const smtp = { SMTP_HOST: 'smtp.example.test', SMTP_PORT: 465, SMTP_SECURE: true };

  it('truyền secure, requireTLS và các timeout 10s/10s/20s', () => {
    const o = buildSmtpTransportOptions({ ...smtp, SMTP_REQUIRE_TLS: false });
    expect(o).toEqual({
      host: 'smtp.example.test',
      port: 465,
      secure: true,
      requireTLS: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  });

  it('có SMTP_USER thì kèm auth (pass mặc định rỗng); không có thì không có khóa auth', () => {
    const withUser = buildSmtpTransportOptions({
      ...smtp,
      SMTP_SECURE: false,
      SMTP_REQUIRE_TLS: true,
      SMTP_USER: 'u',
    });
    expect(withUser).toMatchObject({
      secure: false,
      requireTLS: true,
      auth: { user: 'u', pass: '' },
    });
    expect(buildSmtpTransportOptions({ ...smtp, SMTP_REQUIRE_TLS: false })).not.toHaveProperty(
      'auth',
    );
  });

  it('khớp giá trị parse từ env production', () => {
    const e = parseEnv({ ...prod, SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587' });
    expect(buildSmtpTransportOptions(e)).toMatchObject({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      requireTLS: true,
    });
  });
});

describe('isTransientMailError', () => {
  it('mã kết nối/timeout và SMTP 4xx là tạm thời', () => {
    for (const code of ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNRESET', 'ECONNREFUSED']) {
      expect(isTransientMailError(tempErr(code))).toBe(true);
    }
    expect(isTransientMailError(smtpErr(421))).toBe(true);
    expect(isTransientMailError(smtpErr(450))).toBe(true);
  });

  it('SMTP 5xx, xác thực, TLS và giá trị lạ là vĩnh viễn', () => {
    expect(isTransientMailError(smtpErr(550))).toBe(false);
    expect(isTransientMailError(smtpErr(535))).toBe(false);
    expect(isTransientMailError(tempErr('EAUTH'))).toBe(false);
    expect(isTransientMailError(tempErr('ETLS'))).toBe(false);
    expect(isTransientMailError(new Error('x'))).toBe(false);
    expect(isTransientMailError('lỗi')).toBe(false);
    expect(isTransientMailError(null)).toBe(false);
  });
});

describe('deliverWithRetry', () => {
  const noWait = () => vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());

  it('lỗi tạm thời 2 lần rồi thành công: 3 lần gọi, chờ 1s rồi 4s', async () => {
    const send = vi
      .fn<(m: MailMessage) => Promise<void>>()
      .mockRejectedValueOnce(tempErr())
      .mockRejectedValueOnce(smtpErr(451))
      .mockResolvedValueOnce();
    setMailer({ send });
    const delay = noWait();
    await expect(deliverWithRetry(MSG, { kind: 'order-status' }, { delay })).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(3);
    expect(delay.mock.calls.map((c) => c[0])).toEqual([1_000, 4_000]);
  });

  it('lỗi 5xx không retry', async () => {
    const send = vi.fn<(m: MailMessage) => Promise<void>>().mockRejectedValue(smtpErr(550));
    setMailer({ send });
    const delay = noWait();
    await expect(deliverWithRetry(MSG, { kind: 'order-status' }, { delay })).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it('hết lượt: dừng ở 3 lần, trả false, không ném lỗi', async () => {
    const send = vi.fn<(m: MailMessage) => Promise<void>>().mockRejectedValue(tempErr('ETIMEDOUT'));
    setMailer({ send });
    const delay = noWait();
    await expect(deliverWithRetry(MSG, { kind: 'contact' }, { delay })).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenCalledTimes(2);
  });

  it('log mỗi lần thất bại kèm loại mail và orderCode, KHÔNG log nội dung/token/link', async () => {
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const send = vi.fn<(m: MailMessage) => Promise<void>>().mockRejectedValue(tempErr());
    setMailer({ send });
    await deliverWithRetry(
      MSG,
      { kind: 'order-status', orderCode: 'BB-261110-K7QP' },
      {
        delay: noWait(),
      },
    );
    expect(errorLog).toHaveBeenCalledTimes(3);
    expect(errorLog.mock.calls[0]![0]).toMatchObject({
      mail: 'order-status',
      orderCode: 'BB-261110-K7QP',
      attempt: 1,
      maxAttempts: 3,
      transient: true,
      willRetry: true,
    });
    expect(errorLog.mock.calls[2]![0]).toMatchObject({ attempt: 3, willRetry: false });
    const logged = JSON.stringify(errorLog.mock.calls, (k, v: unknown) =>
      k === 'err' ? String((v as Error).message) : v,
    );
    for (const secret of ['NOI-DUNG-BI-MAT', 'TOKEN-BI-MAT', 'dat-lai-mat-khau', 'khach@example']) {
      expect(logged).not.toContain(secret);
    }
  });

  it('send ném đồng bộ cũng được xử lý như lỗi (không ném ra ngoài)', async () => {
    setMailer({
      send: () => {
        throw smtpErr(554);
      },
    });
    await expect(deliverWithRetry(MSG, undefined, { delay: noWait() })).resolves.toBe(false);
  });

  it('gửi thành công ngay: một lần gọi, không chờ', async () => {
    const send = vi.fn<(m: MailMessage) => Promise<void>>().mockResolvedValue();
    setMailer({ send });
    const delay = noWait();
    await expect(deliverWithRetry(MSG, undefined, { delay })).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });
});

describe('sendMailInBackground', () => {
  it('không ném lỗi dù mailer hỏng và trả về ngay; mailer bộ nhớ nhận mail ở NODE_ENV=test', async () => {
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    setMailer({ send: () => Promise.reject(smtpErr(550)) });
    expect(() => sendMailInBackground(MSG, { kind: 'contact' })).not.toThrow();
    await vi.waitFor(() => expect(errorLog).toHaveBeenCalledTimes(1));

    setMailer(undefined);
    const before = testOutbox.length;
    sendMailInBackground(MSG);
    await vi.waitFor(() => expect(testOutbox.length).toBe(before + 1));
  });
});
