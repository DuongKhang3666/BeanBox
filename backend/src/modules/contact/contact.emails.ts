import { escapeHtml, type MailMessage } from '../../lib/mailer.js';

/** Email thông báo tin nhắn liên hệ cho cửa hàng (chỉ gửi cho store.contact.email). */

export interface ContactMailInput {
  to: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
}

const stripCrlf = (s: string) => s.replace(/[\r\n]+/g, ' ');

export function buildContactNotification(i: ContactMailInput): MailMessage {
  const subjectLine = i.subject ? stripCrlf(i.subject) : '(không tiêu đề)';
  const subject = stripCrlf(`[BeanBox] Liên hệ mới: ${subjectLine}`);
  const phone = i.phone ?? '(không có)';
  const title = i.subject ?? '(không tiêu đề)';

  const text = [
    'Có tin nhắn liên hệ mới từ website.',
    '',
    `Họ tên: ${i.name}`,
    `Email: ${i.email}`,
    `Số điện thoại: ${phone}`,
    `Tiêu đề: ${title}`,
    '',
    'Nội dung:',
    i.message,
  ].join('\n');

  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#6b5a4a"><strong>${label}</strong></td><td>${escapeHtml(value)}</td></tr>`;
  const html = [
    '<div style="font-family:Arial,sans-serif;color:#3b2a1d">',
    '<p>Có tin nhắn liên hệ mới từ website.</p>',
    '<table>',
    row('Họ tên', i.name),
    row('Email', i.email),
    row('Số điện thoại', phone),
    row('Tiêu đề', title),
    '</table>',
    '<p><strong>Nội dung:</strong></p>',
    `<div style="white-space:pre-wrap">${escapeHtml(i.message)}</div>`,
    '</div>',
  ].join('');

  return { to: i.to, subject, text, html, replyTo: i.email };
}
