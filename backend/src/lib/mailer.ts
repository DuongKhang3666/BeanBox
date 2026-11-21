import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Địa chỉ trả lời (Reply-To), tùy chọn. */
  replyTo?: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}

/** Ngữ cảnh chỉ để log khi gửi lỗi (D-056). KHÔNG đưa nội dung, token hay link vào đây. */
export interface MailContext {
  /** Loại mail, ví dụ `order-confirmation`, `order-status`, `verify-email`, `reset-password`, `contact`. */
  kind: string;
  orderCode?: string;
}

/** Hộp thư bộ nhớ cho test (NODE_ENV=test). */
export const testOutbox: MailMessage[] = [];
export const clearTestOutbox = (): void => {
  testOutbox.length = 0;
};

// ---------------------------------------------------------------------------
// Transport SMTP (D-056)

export interface SmtpEnv {
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER?: string | undefined;
  SMTP_PASS?: string | undefined;
  SMTP_SECURE: boolean;
  SMTP_REQUIRE_TLS: boolean;
}

export const SMTP_CONNECTION_TIMEOUT_MS = 10_000;
export const SMTP_GREETING_TIMEOUT_MS = 10_000;
export const SMTP_SOCKET_TIMEOUT_MS = 20_000;

/** Tùy chọn nodemailer từ env; hàm thuần để test không cần mở kết nối. */
export function buildSmtpTransportOptions(e: SmtpEnv) {
  return {
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE,
    requireTLS: e.SMTP_REQUIRE_TLS,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    ...(e.SMTP_USER ? { auth: { user: e.SMTP_USER, pass: e.SMTP_PASS ?? '' } } : {}),
  };
}

function createSmtpMailer(): Mailer {
  const transport = nodemailer.createTransport(buildSmtpTransportOptions(env));
  return {
    async send(msg) {
      await transport.sendMail({ from: env.MAIL_FROM, ...msg });
    },
  };
}

const memoryMailer: Mailer = {
  send(msg) {
    testOutbox.push(msg);
    return Promise.resolve();
  },
};

let current: Mailer | undefined;

export function getMailer(): Mailer {
  current ??= env.NODE_ENV === 'test' ? memoryMailer : createSmtpMailer();
  return current;
}

export function setMailer(m: Mailer | undefined): void {
  current = m;
}

// ---------------------------------------------------------------------------
// Gửi có retry trong tiến trình (D-056)

/** Số lần thử tối đa (gồm lần đầu) và khoảng chờ trước mỗi lần thử lại: 1s, 4s (16s dành cho khi nâng số lần). */
export const MAIL_MAX_ATTEMPTS = 3;
export const MAIL_RETRY_DELAYS_MS: readonly number[] = [1_000, 4_000, 16_000];

const TRANSIENT_CODES = new Set([
  'ECONNECTION',
  'ETIMEDOUT',
  'ESOCKET',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'EAI_AGAIN',
  'EDNS',
]);

/**
 * Lỗi tạm thời (đáng thử lại): mã kết nối/timeout của nodemailer hoặc Node, hoặc SMTP 4xx.
 * Lỗi vĩnh viễn (SMTP 5xx, xác thực, địa chỉ sai, TLS) không retry.
 */
export function isTransientMailError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { responseCode?: unknown; code?: unknown };
  if (typeof e.responseCode === 'number') return e.responseCode >= 400 && e.responseCode < 500;
  return typeof e.code === 'string' && TRANSIENT_CODES.has(e.code);
}

export interface DeliverOptions {
  maxAttempts?: number;
  delaysMs?: readonly number[];
  /** Tiêm hàm chờ để test chạy nhanh. */
  delay?: (ms: number) => Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Gửi và thử lại lỗi tạm thời. Không bao giờ ném lỗi: trả true nếu đã gửi, false nếu bỏ cuộc.
 * Mỗi lần thất bại được log kèm loại mail/orderCode (không log nội dung, token, link).
 * Đánh đổi: retry nằm trong RAM của tiến trình, restart giữa chừng thì mất (outbox để sau).
 */
export async function deliverWithRetry(
  msg: MailMessage,
  ctx: MailContext = { kind: 'unknown' },
  opts: DeliverOptions = {},
): Promise<boolean> {
  const maxAttempts = opts.maxAttempts ?? MAIL_MAX_ATTEMPTS;
  const delays = opts.delaysMs ?? MAIL_RETRY_DELAYS_MS;
  const wait = opts.delay ?? sleep;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await getMailer().send(msg);
      return true;
    } catch (err) {
      const transient = isTransientMailError(err);
      const willRetry = transient && attempt < maxAttempts;
      logger.error(
        {
          err,
          mail: ctx.kind,
          ...(ctx.orderCode ? { orderCode: ctx.orderCode } : {}),
          attempt,
          maxAttempts,
          transient,
          willRetry,
        },
        'Gửi email thất bại',
      );
      if (!willRetry) return false;
      await wait(delays[Math.min(attempt - 1, delays.length - 1)] ?? 0);
    }
  }
  return false;
}

/** Gửi không chờ; lỗi chỉ được log (không log nội dung/link/token), không ném ra luồng request. */
export function sendMailInBackground(msg: MailMessage, ctx?: MailContext): void {
  void deliverWithRetry(msg, ctx).catch(() => undefined);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
