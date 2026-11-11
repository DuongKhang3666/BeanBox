import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { clearTestOutbox, testOutbox } from '../src/lib/mailer.js';
import { prisma } from '../src/lib/prisma.js';
import { createFixtures, errOf, type Who } from './checkoutHelpers.js';
import { placeGuestOrder, placeUserOrder } from './orderTestHelpers.js';

const PREFIX = 'tm4e-';
let app: Express;
const fx = createFixtures(() => app, PREFIX);
const BIG = {
  generalRateLimit: 100_000,
  authRateLimit: 100_000,
  trackRateLimit: 100_000,
  couponRateLimit: 100_000,
  quoteRateLimit: 100_000,
  orderRateLimit: 100_000,
  guestCancelRateLimit: 100_000,
  uploadRateLimit: 100_000,
};

let staff: { id: string; who: Who };
let variantId: string;

const patchStatus = (code: string, body: Record<string, unknown>) =>
  fx.call('patch', `/admin/orders/${code}/status`, staff.who, body);

async function cleanAudit() {
  const orders = await prisma.order.findMany({
    where: { contactEmail: { startsWith: PREFIX } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { entity: 'Order', entityId: { in: orders.map((o) => o.id) } },
  });
}

/** Mail đơn hàng gửi cho `to` về đơn `code` (bỏ qua mail xác thực tài khoản, xác nhận đặt hàng). */
const statusMails = (to: string, code: string) =>
  testOutbox.filter(
    (m) => m.to === to && m.subject.includes(code) && !m.subject.includes('Xác nhận đơn hàng'),
  );

async function mailFor(to: string, code: string, count = 1) {
  for (let i = 0; i < 80 && statusMails(to, code).length < count; i++) {
    await new Promise((r) => setTimeout(r, 25));
  }
  return statusMails(to, code);
}
const settle = () => new Promise((r) => setTimeout(r, 150));

beforeAll(async () => {
  app = createApp(BIG);
  await cleanAudit();
  await fx.setup();
  const u = await fx.mkUser('staff');
  await prisma.user.update({ where: { id: u.id }, data: { role: 'STAFF' } });
  staff = u;
  variantId = (await fx.mkVariant('mail', { stock: 500, price: 100000 })).id;
});
afterAll(async () => {
  await cleanAudit();
  await fx.clean();
  await prisma.$disconnect();
});

describe('email đổi trạng thái qua PATCH /admin/orders/:code/status', () => {
  it('guest: CONFIRMED, PROCESSING (không mail), SHIPPING, DELIVERED với đúng người nhận và link', async () => {
    const { order } = await placeGuestOrder(fx, [[variantId, 1]]);
    const code = order.code as string;
    const to = order.contact.email as string;
    const guestLink = `${env.WEB_APP_URL}/tra-cuu-don-hang?code=${code}`;

    let res = await patchStatus(code, { fromStatus: 'PENDING', toStatus: 'CONFIRMED' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const confirmed = await mailFor(to, code, 1);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]!.subject).toContain('đã được xác nhận');
    expect(confirmed[0]!.text).toContain(guestLink);
    expect(confirmed[0]!.html).toContain(guestLink);
    expect(confirmed[0]!.text).not.toContain('0901234567');

    res = await patchStatus(code, { fromStatus: 'CONFIRMED', toStatus: 'PROCESSING' });
    expect(res.status).toBe(200);
    await settle();
    expect(statusMails(to, code)).toHaveLength(1); // PROCESSING không gửi mail

    res = await patchStatus(code, {
      fromStatus: 'PROCESSING',
      toStatus: 'SHIPPING',
      trackingNumber: 'GHN-998877',
      carrier: 'GHN Express',
    });
    expect(res.status).toBe(200);
    const shipping = (await mailFor(to, code, 2))[1]!;
    expect(shipping.subject).toContain('đang được giao');
    expect(shipping.text).toContain('Mã vận đơn: GHN-998877');
    expect(shipping.text).toContain('Đơn vị vận chuyển: GHN Express');
    expect(shipping.text).toContain(guestLink);

    res = await patchStatus(code, { fromStatus: 'SHIPPING', toStatus: 'DELIVERED' });
    expect(res.status).toBe(200);
    const delivered = (await mailFor(to, code, 3))[2]!;
    expect(delivered.subject).toContain('đã giao thành công');
    expect(statusMails(to, code)).toHaveLength(3);
  });

  it('CANCELLED kèm lý do; user đã đăng nhập nhận link trang tài khoản', async () => {
    const user = await fx.mkUser('buyer');
    const order = await placeUserOrder(fx, user, [[variantId, 1]]);
    const code = order.code as string;
    const to = order.contact.email as string;
    expect(to).toBe(user.email);

    const res = await patchStatus(code, {
      fromStatus: 'PENDING',
      toStatus: 'CANCELLED',
      note: 'Hết hàng <b>tạm thời</b>',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const mails = await mailFor(to, code, 1);
    expect(mails).toHaveLength(1);
    const m = mails[0]!;
    expect(m.subject).toContain('đã được hủy');
    expect(m.text).toContain('Lý do: Hết hàng <b>tạm thời</b>');
    expect(m.html).toContain('Hết hàng &lt;b&gt;tạm thời&lt;/b&gt;');
    expect(m.html).not.toContain('<b>tạm thời</b>');
    const userLink = `${env.WEB_APP_URL}/tai-khoan/don-hang/${code}`;
    expect(m.text).toContain(userLink);
    expect(m.text).not.toContain('tra-cuu-don-hang');
  });

  it('hủy không ghi chú dùng lý do mặc định', async () => {
    const { order } = await placeGuestOrder(fx, [[variantId, 1]]);
    const code = order.code as string;
    const to = order.contact.email as string;
    expect((await patchStatus(code, { fromStatus: 'PENDING', toStatus: 'CANCELLED' })).status).toBe(
      200,
    );
    const [m] = await mailFor(to, code, 1);
    expect(m!.text).toContain('Lý do: Cửa hàng hủy đơn');
  });

  it('chuyển bị lỗi (409 / 400) không gửi mail và không đổi đơn', async () => {
    const { order } = await placeGuestOrder(fx, [[variantId, 1]]);
    const code = order.code as string;
    const to = order.contact.email as string;
    clearTestOutbox();

    // Chuyển trạng thái không hợp lệ.
    let res = await patchStatus(code, { fromStatus: 'PENDING', toStatus: 'DELIVERED' });
    expect(res.status).toBe(409);
    expect(errOf(res).code).toBe('INVALID_STATUS_TRANSITION');
    // Trạng thái cũ không khớp (admin xem dữ liệu cũ).
    res = await patchStatus(code, { fromStatus: 'CONFIRMED', toStatus: 'CANCELLED' });
    expect(res.status).toBe(409);
    expect(errOf(res).code).toBe('CONFLICT');
    // Thiếu mã vận đơn.
    await patchStatus(code, { fromStatus: 'PENDING', toStatus: 'CONFIRMED' });
    await patchStatus(code, { fromStatus: 'CONFIRMED', toStatus: 'PROCESSING' });
    clearTestOutbox();
    res = await patchStatus(code, { fromStatus: 'PROCESSING', toStatus: 'SHIPPING' });
    expect(res.status).toBe(400);
    // Đơn không tồn tại.
    res = await patchStatus('BB-261110-ZZZZ', { fromStatus: 'PENDING', toStatus: 'CONFIRMED' });
    expect(res.status).toBe(404);

    await settle();
    expect(testOutbox.filter((m) => m.to === to)).toHaveLength(0);
    const row = await prisma.order.findUniqueOrThrow({ where: { code } });
    expect(row.status).toBe('PROCESSING');
  });

  it('FAILED_DELIVERY không gửi mail', async () => {
    const { order } = await placeGuestOrder(fx, [[variantId, 1]]);
    const code = order.code as string;
    const to = order.contact.email as string;
    for (const [from, toStatus, extra] of [
      ['PENDING', 'CONFIRMED', {}],
      ['CONFIRMED', 'PROCESSING', {}],
      ['PROCESSING', 'SHIPPING', { trackingNumber: 'T-1' }],
    ] as const) {
      expect((await patchStatus(code, { fromStatus: from, toStatus, ...extra })).status).toBe(200);
    }
    await mailFor(to, code, 2);
    clearTestOutbox();
    const res = await patchStatus(code, {
      fromStatus: 'SHIPPING',
      toStatus: 'FAILED_DELIVERY',
      note: 'Khách không nghe máy',
    });
    expect(res.status).toBe(200);
    await settle();
    expect(statusMails(to, code)).toHaveLength(0);
  });
});
