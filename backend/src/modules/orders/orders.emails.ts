import { env } from '../../config/env.js';
import { escapeHtml, type MailMessage } from '../../lib/mailer.js';
import { formatVnDateTime } from '../../lib/vnTime.js';
import type { OrderDto } from './orders.dto.js';

/** Định dạng VND: 1.234.567 ₫ (không phụ thuộc ICU). */
export const formatVnd = (n: number): string =>
  `${String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ₫`;

/** Link chỉ dựng từ WEB_APP_URL. Guest: chỉ mã đơn, KHÔNG đưa SĐT vào URL. */
export function orderLink(code: string, loggedIn: boolean): string {
  return loggedIn
    ? `${env.WEB_APP_URL}/tai-khoan/don-hang/${encodeURIComponent(code)}`
    : `${env.WEB_APP_URL}/tra-cuu-don-hang?code=${encodeURIComponent(code)}`;
}

const PAYMENT_LABEL: Record<string, string> = {
  COD: 'Thanh toán khi nhận hàng (COD)',
  VNPAY: 'VNPay',
  STRIPE: 'Thẻ quốc tế (Stripe)',
};

export function buildOrderConfirmationEmail(
  order: OrderDto,
  opts: { loggedIn: boolean },
): MailMessage {
  const url = orderLink(order.code, opts.loggedIn);
  const a = order.shippingAddress;
  const address = `${a.line1}, ${a.wardName}, ${a.provinceName}`;
  const payment = PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod;
  const shipLabel = order.shippingMethod === 'EXPRESS' ? 'Nhanh' : 'Tiêu chuẩn';

  // Đơn online chờ thanh toán: ghi hạn thanh toán theo giờ Việt Nam (§13.1).
  const payBefore =
    order.status === 'PENDING_PAYMENT' && order.expiresAt
      ? `Vui lòng thanh toán trước ${formatVnDateTime(new Date(order.expiresAt))} (giờ Việt Nam) để giữ đơn hàng.`
      : null;

  const totals: Array<[string, string]> = [
    ['Tạm tính', formatVnd(order.subtotal)],
    ...(order.discountTotal > 0
      ? ([['Giảm giá', `-${formatVnd(order.discountTotal)}`]] as Array<[string, string]>)
      : []),
    ['Phí vận chuyển', formatVnd(order.shippingFee)],
    ...(order.shippingDiscount > 0
      ? ([['Giảm phí vận chuyển', `-${formatVnd(order.shippingDiscount)}`]] as Array<
          [string, string]
        >)
      : []),
    ['Tổng cộng', formatVnd(order.grandTotal)],
  ];

  const text = [
    `Xin chào ${a.fullName},`,
    '',
    `Cảm ơn bạn đã đặt hàng tại BeanBox. Mã đơn hàng của bạn là ${order.code}.`,
    '',
    'Sản phẩm:',
    ...order.items.map(
      (i) => `- ${i.productName} (${i.variantName}) x ${i.quantity}: ${formatVnd(i.lineTotal)}`,
    ),
    '',
    ...totals.map(([k, v]) => `${k}: ${v}`),
    '',
    `Giao tới: ${a.fullName}, ${a.phone}`,
    address,
    `Vận chuyển: ${shipLabel}`,
    `Thanh toán: ${payment}`,
    ...(payBefore ? [payBefore] : []),
    ...(order.note ? [`Ghi chú: ${order.note}`] : []),
    '',
    `Xem đơn hàng: ${url}`,
  ].join('\n');

  const rows = order.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0">${escapeHtml(i.productName)}<br><span style="color:#7a6a5d">${escapeHtml(i.variantName)}</span></td>` +
        `<td style="padding:6px 8px;text-align:center">x ${i.quantity}</td>` +
        `<td style="padding:6px 0;text-align:right">${formatVnd(i.lineTotal)}</td></tr>`,
    )
    .join('');
  const totalRows = totals
    .map(
      ([k, v]) =>
        `<tr><td style="padding:3px 0">${k}</td><td style="padding:3px 0;text-align:right">${v}</td></tr>`,
    )
    .join('');

  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#3b2a20">
<h2 style="color:#4a3426">BeanBox</h2>
<p>Xin chào ${escapeHtml(a.fullName)},</p>
<p>Cảm ơn bạn đã đặt hàng tại BeanBox. Mã đơn hàng của bạn là <strong>${escapeHtml(order.code)}</strong>.</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #e5dccf;border-bottom:1px solid #e5dccf">${rows}</table>
<table style="width:100%;border-collapse:collapse;margin-top:8px">${totalRows}</table>
<p><strong>Giao tới:</strong> ${escapeHtml(a.fullName)}, ${escapeHtml(a.phone)}<br>${escapeHtml(address)}</p>
<p><strong>Vận chuyển:</strong> ${shipLabel}<br><strong>Thanh toán:</strong> ${escapeHtml(payment)}</p>
${payBefore ? `<p><strong>${escapeHtml(payBefore)}</strong></p>` : ''}
${order.note ? `<p><strong>Ghi chú:</strong> ${escapeHtml(order.note)}</p>` : ''}
<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 20px;background:#4a6741;color:#fff;border-radius:6px;text-decoration:none">Xem đơn hàng</a></p>
<p>Nếu nút không hoạt động, hãy sao chép liên kết này vào trình duyệt:<br>${escapeHtml(url)}</p>
</div>`;

  return {
    to: order.contact.email,
    subject: `BeanBox - Xác nhận đơn hàng ${order.code}`,
    text,
    html,
  };
}
