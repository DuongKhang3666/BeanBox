import { describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { clearTestOutbox, testOutbox } from '../src/lib/mailer.js';
import {
  buildOrderStatusEmail,
  notifyOrderStatusChange,
  type StatusEmailOrder,
} from '../src/modules/orders/orders.statusEmails.js';

const base = (over: Partial<StatusEmailOrder> = {}): StatusEmailOrder => ({
  code: 'BB-261110-K7QP',
  status: 'CONFIRMED',
  contact: { email: 'an@example.com' },
  shippingAddress: { fullName: 'Nguyễn Văn An' },
  trackingNumber: null,
  carrier: null,
  cancelReason: null,
  ...over,
});

describe('buildOrderStatusEmail', () => {
  it('chỉ dựng cho CONFIRMED, SHIPPING, DELIVERED, CANCELLED; trạng thái khác -> null', () => {
    for (const s of ['CONFIRMED', 'SHIPPING', 'DELIVERED', 'CANCELLED']) {
      expect(buildOrderStatusEmail(base({ status: s }), { loggedIn: true }), s).not.toBeNull();
    }
    for (const s of ['PENDING', 'PENDING_PAYMENT', 'PROCESSING', 'FAILED_DELIVERY', 'RETURNED']) {
      expect(buildOrderStatusEmail(base({ status: s }), { loggedIn: true }), s).toBeNull();
    }
  });

  it('CONFIRMED: người nhận, tiêu đề, lời chào, có cả text và html', () => {
    const m = buildOrderStatusEmail(base(), { loggedIn: false })!;
    expect(m.to).toBe('an@example.com');
    expect(m.subject).toBe('BeanBox - Đơn hàng BB-261110-K7QP đã được xác nhận');
    expect(m.text).toContain('Xin chào Nguyễn Văn An,');
    expect(m.text).toContain('BB-261110-K7QP');
    expect(m.html).toContain('<strong>BB-261110-K7QP</strong>');
  });

  it('SHIPPING: kèm mã vận đơn và đơn vị vận chuyển nếu có', () => {
    const full = buildOrderStatusEmail(
      base({ status: 'SHIPPING', trackingNumber: 'GHN123456', carrier: 'GHN' }),
      { loggedIn: true },
    )!;
    expect(full.text).toContain('Mã vận đơn: GHN123456');
    expect(full.text).toContain('Đơn vị vận chuyển: GHN');
    expect(full.html).toContain('GHN123456');
    expect(full.subject).toContain('đang được giao');

    const noCarrier = buildOrderStatusEmail(base({ status: 'SHIPPING', trackingNumber: 'T-1' }), {
      loggedIn: true,
    })!;
    expect(noCarrier.text).toContain('Mã vận đơn: T-1');
    expect(noCarrier.text).not.toContain('Đơn vị vận chuyển');
  });

  it('DELIVERED và CANCELLED (kèm lý do)', () => {
    const d = buildOrderStatusEmail(base({ status: 'DELIVERED' }), { loggedIn: true })!;
    expect(d.subject).toContain('đã giao thành công');
    const c = buildOrderStatusEmail(
      base({ status: 'CANCELLED', cancelReason: 'Hết hàng, xin lỗi bạn' }),
      { loggedIn: true },
    )!;
    expect(c.subject).toContain('đã được hủy');
    expect(c.text).toContain('Lý do: Hết hàng, xin lỗi bạn');
    const noReason = buildOrderStatusEmail(base({ status: 'CANCELLED' }), { loggedIn: true })!;
    expect(noReason.text).not.toContain('Lý do');
  });

  it('link: user -> trang tài khoản; guest -> tra cứu theo mã, không có SĐT', () => {
    const user = buildOrderStatusEmail(base(), { loggedIn: true })!;
    const userUrl = `${env.WEB_APP_URL}/tai-khoan/don-hang/BB-261110-K7QP`;
    expect(user.text).toContain(`Xem đơn hàng: ${userUrl}`);
    expect(user.html).toContain(`href="${userUrl}"`);

    const guest = buildOrderStatusEmail(base(), { loggedIn: false })!;
    const guestUrl = `${env.WEB_APP_URL}/tra-cuu-don-hang?code=BB-261110-K7QP`;
    expect(guest.text).toContain(`Xem đơn hàng: ${guestUrl}`);
    expect(guest.html).toContain(`href="${guestUrl}"`);
    expect(guest.text).not.toMatch(/phone|0\d{9}/);
    expect(guest.text).not.toContain('/tai-khoan/');
  });

  it('escape HTML cho tên, lý do, mã vận đơn; text giữ nguyên', () => {
    const evil = '<script>alert("x")</script>';
    const m = buildOrderStatusEmail(
      base({
        status: 'CANCELLED',
        shippingAddress: { fullName: evil },
        cancelReason: `<img src=x onerror=1> & "q"`,
      }),
      { loggedIn: true },
    )!;
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('<img');
    expect(m.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(m.html).toContain('&lt;img src=x onerror=1&gt; &amp; &quot;q&quot;');
    expect(m.text).toContain(evil);

    const s = buildOrderStatusEmail(
      base({ status: 'SHIPPING', trackingNumber: '<b>1</b>', carrier: "A'B" }),
      { loggedIn: true },
    )!;
    expect(s.html).not.toContain('<b>1</b>');
    expect(s.html).toContain('&lt;b&gt;1&lt;/b&gt;');
    expect(s.html).toContain('A&#39;B');
  });
});

describe('notifyOrderStatusChange', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    code: 'BB-261110-AAAA',
    status: 'DELIVERED',
    userId: null as string | null,
    contactEmail: 'tm4e-unit@example.test',
    shippingAddress: { fullName: 'Trần Thị Bình', phone: '0912345678' },
    trackingNumber: null,
    carrier: null,
    cancelReason: null,
    ...over,
  });
  const waitFor = async (pred: () => boolean) => {
    for (let i = 0; i < 80 && !pred(); i++) await new Promise((r) => setTimeout(r, 25));
  };

  it('gửi nền cho trạng thái hợp lệ; guest/user dùng đúng link', async () => {
    clearTestOutbox();
    notifyOrderStatusChange(row());
    notifyOrderStatusChange(row({ userId: 'ckuser1', code: 'BB-261110-BBBB' }));
    await waitFor(() => testOutbox.length >= 2);
    const g = testOutbox.find((m) => m.subject.includes('BB-261110-AAAA'))!;
    const u = testOutbox.find((m) => m.subject.includes('BB-261110-BBBB'))!;
    expect(g.to).toBe('tm4e-unit@example.test');
    expect(g.text).toContain('/tra-cuu-don-hang?code=BB-261110-AAAA');
    expect(g.text).not.toContain('0912345678');
    expect(u.text).toContain('/tai-khoan/don-hang/BB-261110-BBBB');
    clearTestOutbox();
  });

  it('không gửi cho trạng thái khác và không ném lỗi khi dữ liệu hỏng', async () => {
    clearTestOutbox();
    notifyOrderStatusChange(row({ status: 'PROCESSING' }));
    expect(() => notifyOrderStatusChange(row({ shippingAddress: null }))).not.toThrow();
    await new Promise((r) => setTimeout(r, 100));
    expect(testOutbox.filter((m) => m.to === 'tm4e-unit@example.test').length).toBe(1);
    clearTestOutbox();
  });
});
