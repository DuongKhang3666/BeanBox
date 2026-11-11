import type { Prisma } from '@prisma/client';
import { escapeHtml, sendMailInBackground, type MailMessage } from '../../lib/mailer.js';
import { orderLink } from './orders.emails.js';
import { toShippingAddress } from './orders.dto.js';

/** Email đổi trạng thái đơn (api-contract §13.9). Chỉ CONFIRMED, SHIPPING, DELIVERED, CANCELLED. */

export const STATUS_EMAIL_STATUSES = ['CONFIRMED', 'SHIPPING', 'DELIVERED', 'CANCELLED'] as const;

/** Phần của OrderDto mà email cần (OrderDto thỏa cấu trúc này). */
export interface StatusEmailOrder {
  code: string;
  status: string;
  contact: { email: string };
  shippingAddress: { fullName: string };
  trackingNumber: string | null;
  carrier: string | null;
  cancelReason: string | null;
}

/** Hàng `Order` (Prisma) hoặc tương đương: đủ để gửi mail sau khi transaction commit. */
export interface OrderRowLike {
  code: string;
  status: string;
  userId: string | null;
  contactEmail: string;
  shippingAddress: unknown;
  trackingNumber: string | null;
  carrier: string | null;
  cancelReason: string | null;
}

interface Copy {
  subject: string;
  headline: string;
  lines: (o: StatusEmailOrder) => string[];
}

const COPY: Record<(typeof STATUS_EMAIL_STATUSES)[number], Copy> = {
  CONFIRMED: {
    subject: 'Đơn hàng {code} đã được xác nhận',
    headline: 'Đơn hàng của bạn đã được xác nhận',
    lines: () => ['BeanBox đang chuẩn bị hàng cho bạn. Chúng tôi sẽ báo khi đơn được giao đi.'],
  },
  SHIPPING: {
    subject: 'Đơn hàng {code} đang được giao',
    headline: 'Đơn hàng của bạn đang trên đường giao',
    lines: (o) => [
      'Đơn hàng đã được bàn giao cho đơn vị vận chuyển.',
      ...(o.carrier ? [`Đơn vị vận chuyển: ${o.carrier}`] : []),
      ...(o.trackingNumber ? [`Mã vận đơn: ${o.trackingNumber}`] : []),
    ],
  },
  DELIVERED: {
    subject: 'Đơn hàng {code} đã giao thành công',
    headline: 'Đơn hàng đã được giao thành công',
    lines: () => ['Cảm ơn bạn đã mua sắm tại BeanBox. Chúc bạn có những tách cà phê thật ngon!'],
  },
  CANCELLED: {
    subject: 'Đơn hàng {code} đã được hủy',
    headline: 'Đơn hàng của bạn đã được hủy',
    lines: (o) => [
      ...(o.cancelReason ? [`Lý do: ${o.cancelReason}`] : []),
      'Nếu bạn đã thanh toán trực tuyến, BeanBox sẽ liên hệ để hoàn tiền. Cần hỗ trợ, hãy trả lời email này.',
    ],
  },
};

/** Trả null nếu trạng thái không cần gửi mail. */
export function buildOrderStatusEmail(
  order: StatusEmailOrder,
  opts: { loggedIn: boolean },
): MailMessage | null {
  const copy = (COPY as Record<string, Copy | undefined>)[order.status];
  if (!copy) return null;
  const url = orderLink(order.code, opts.loggedIn);
  const name = order.shippingAddress.fullName;
  const lines = copy.lines(order);

  const text = [
    `Xin chào ${name},`,
    '',
    `${copy.headline} (mã đơn ${order.code}).`,
    ...lines,
    '',
    `Xem đơn hàng: ${url}`,
  ].join('\n');

  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#3b2a20">
<h2 style="color:#4a3426">BeanBox</h2>
<p>Xin chào ${escapeHtml(name)},</p>
<p>${escapeHtml(copy.headline)} (mã đơn <strong>${escapeHtml(order.code)}</strong>).</p>
${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('\n')}
<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 20px;background:#4a6741;color:#fff;border-radius:6px;text-decoration:none">Xem đơn hàng</a></p>
<p>Nếu nút không hoạt động, hãy sao chép liên kết này vào trình duyệt:<br>${escapeHtml(url)}</p>
</div>`;

  return {
    to: order.contact.email,
    subject: `BeanBox - ${copy.subject.replace('{code}', order.code)}`,
    text,
    html,
  };
}

/**
 * Gửi nền email đổi trạng thái; gọi SAU khi transaction commit. Không ném lỗi
 * (lỗi build/gửi chỉ bị bỏ qua hoặc được mailer log). `loggedIn` = đơn có `userId`.
 */
export function notifyOrderStatusChange(order: OrderRowLike): void {
  try {
    const msg = buildOrderStatusEmail(
      {
        code: order.code,
        status: order.status,
        contact: { email: order.contactEmail },
        shippingAddress: toShippingAddress(order.shippingAddress as Prisma.JsonValue),
        trackingNumber: order.trackingNumber,
        carrier: order.carrier,
        cancelReason: order.cancelReason,
      },
      { loggedIn: order.userId !== null },
    );
    if (msg) sendMailInBackground(msg);
  } catch {
    // Không để lỗi dựng email ảnh hưởng đơn hàng.
  }
}
