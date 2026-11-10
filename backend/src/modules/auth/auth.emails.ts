import { env } from '../../config/env.js';
import { escapeHtml, type MailMessage } from '../../lib/mailer.js';

interface Recipient {
  email: string;
  fullName: string;
}

/** Link chỉ dựng từ WEB_APP_URL (không bao giờ từ header của request). */
const link = (path: string, token: string) =>
  `${env.WEB_APP_URL}${path}?token=${encodeURIComponent(token)}`;

function layout(name: string, intro: string, url: string, cta: string, expiry: string) {
  const safeName = escapeHtml(name);
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#3b2a20">
<h2 style="color:#4a3426">BeanBox</h2>
<p>Xin chào ${safeName},</p>
<p>${intro}</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 20px;background:#4a6741;color:#fff;border-radius:6px;text-decoration:none">${cta}</a></p>
<p>Nếu nút không hoạt động, hãy sao chép liên kết này vào trình duyệt:<br>${escapeHtml(url)}</p>
<p>${expiry}</p>
<p>Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
</div>`;
  return html;
}

export function buildVerifyEmail(to: Recipient, token: string): MailMessage {
  const url = link('/xac-thuc-email', token);
  const intro = 'Cảm ơn bạn đã đăng ký tài khoản BeanBox. Vui lòng xác thực địa chỉ email của bạn.';
  const expiry = 'Liên kết có hiệu lực trong 24 giờ và chỉ dùng được một lần.';
  return {
    to: to.email,
    subject: 'Xác thực email tài khoản BeanBox',
    text: [
      `Xin chào ${to.fullName},`,
      '',
      intro,
      `Xác thực email: ${url}`,
      '',
      expiry,
      'Nếu bạn không yêu cầu, hãy bỏ qua email này.',
    ].join('\n'),
    html: layout(to.fullName, intro, url, 'Xác thực email', expiry),
  };
}

export function buildResetEmail(to: Recipient, token: string): MailMessage {
  const url = link('/dat-lai-mat-khau', token);
  const intro = 'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản BeanBox của bạn.';
  const expiry = 'Liên kết có hiệu lực trong 30 phút và chỉ dùng được một lần.';
  return {
    to: to.email,
    subject: 'Đặt lại mật khẩu BeanBox',
    text: [
      `Xin chào ${to.fullName},`,
      '',
      intro,
      `Đặt lại mật khẩu: ${url}`,
      '',
      expiry,
      'Nếu bạn không yêu cầu, hãy bỏ qua email này.',
    ].join('\n'),
    html: layout(to.fullName, intro, url, 'Đặt lại mật khẩu', expiry),
  };
}
