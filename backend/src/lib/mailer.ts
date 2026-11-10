import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}

/** Hộp thư bộ nhớ cho test (NODE_ENV=test). */
export const testOutbox: MailMessage[] = [];
export const clearTestOutbox = (): void => {
  testOutbox.length = 0;
};

function createSmtpMailer(): Mailer {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false, // Mailpit không dùng TLS ngầm định; STARTTLS tự nâng cấp nếu server hỗ trợ
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } } : {}),
  });
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

/** Gửi không chờ; lỗi chỉ được log (không log nội dung/link/token). */
export function sendMailInBackground(msg: MailMessage): void {
  void Promise.resolve()
    .then(() => getMailer().send(msg))
    .catch((err: unknown) => {
      logger.error({ err, to: msg.to }, 'Gửi email thất bại');
    });
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
