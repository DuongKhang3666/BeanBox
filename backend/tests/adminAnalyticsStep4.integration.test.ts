import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { prisma } from '../src/lib/prisma.js';
import { getCoupons } from '../src/modules/admin/analytics/analytics.coupons.js';
import { getBreakdown } from '../src/modules/admin/analytics/analytics.breakdown.js';
import { getOverview } from '../src/modules/admin/analytics/analytics.service.js';
import { getTopCustomers, getTopProducts } from '../src/modules/admin/analytics/analytics.top.js';
import { API } from './authHelpers.js';
import { createFixtures, errOf, type Who } from './checkoutHelpers.js';

const PREFIX = 'tm13-';
const BIG = 100_000;

let app: Express;
const fx = createFixtures(() => app, PREFIX);
let admin: { id: string; who: Who };
let staff: { id: string; who: Who };
let customer: { id: string; who: Who; email: string };
let base: { id: string; productId: string };

let seq = 0;
const codes: string[] = [];
const at = (iso: string) => new Date(iso);

async function mkOrder(o: {
  email: string;
  userId?: string;
  status?: 'DELIVERED' | 'CANCELLED' | 'RETURNED' | 'PENDING';
  paid?: string; // ISO; có -> PAID
  total?: number;
  couponId?: string | null;
  couponCode?: string | null;
  discountTotal?: number;
  shippingDiscount?: number;
  variantId?: string;
  productId?: string;
  productName?: string;
  address?: Prisma.InputJsonObject;
}) {
  const total = o.total ?? 100000;
  const code = `BB-T13${++seq}-${randomUUID().slice(0, 6)}`;
  codes.push(code);
  const created = o.paid ?? '2036-03-11T03:00:00Z';
  return prisma.order.create({
    data: {
      code,
      userId: o.userId ?? null,
      contactEmail: o.email,
      contactPhone: '0912345678',
      status: o.status ?? 'DELIVERED',
      paymentStatus: o.paid ? 'PAID' : 'UNPAID',
      paymentMethod: 'COD',
      shippingMethod: 'STANDARD',
      shippingAddress: o.address ?? { fullName: 'Khách Mẫu', phone: '0912345678' },
      // grandTotal = subtotal - discountTotal + shippingFee - shippingDiscount (CHECK); phí ship = giảm ship.
      subtotal: total + (o.discountTotal ?? 0),
      shippingFee: o.shippingDiscount ?? 0,
      discountTotal: o.discountTotal ?? 0,
      shippingDiscount: o.shippingDiscount ?? 0,
      couponId: o.couponId ?? null,
      couponCode: o.couponCode ?? null,
      grandTotal: total,
      idempotencyKey: randomUUID(),
      requestFingerprint: 'x',
      createdAt: at(created),
      paidAt: o.paid ? at(o.paid) : null,
      items: {
        create: [
          {
            productId: o.productId ?? base.productId,
            variantId: o.variantId ?? base.id,
            productName: o.productName ?? 'Tên cũ',
            variantName: 'bt',
            sku: `SKU-${randomUUID().slice(0, 8)}`,
            unitPrice: total,
            quantity: 1,
            lineTotal: total,
          },
        ],
      },
    },
  });
}

beforeAll(async () => {
  app = createApp({ generalRateLimit: BIG, authRateLimit: BIG, exportRateLimit: BIG });
  await fx.setup();
  admin = await fx.mkUser('admin');
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  staff = await fx.mkUser('staff');
  await prisma.user.update({ where: { id: staff.id }, data: { role: 'STAFF' } });
  customer = await fx.mkUser('cust');
  const v = await fx.mkVariant('base', { stock: 1000 });
  base = { id: v.id, productId: v.productId };
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { action: 'analytics.export', actorId: { in: [admin.id, staff.id, customer.id] } },
  });
  await prisma.payment.deleteMany({ where: { order: { code: { in: codes } } } });
  await fx.clean();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------------------------
describe('coupons - hiệu quả mã giảm giá', () => {
  // 2036-03-15T10:00Z = 17:00 ngày 15/03 giờ VN. Kỳ này 10..15/03, kỳ trước 04..09/03.
  const NOW = new Date('2036-03-15T10:00:00.000Z');
  const Q = { from: '2036-03-10', to: '2036-03-15' } as const;
  const e = (k: string) => `${PREFIX}c-${k}@example.test`;
  let c1: { id: string; code: string };
  let c2: { id: string; code: string };
  let c3: { id: string; code: string };
  let c4: { id: string; code: string };

  beforeAll(async () => {
    c1 = await fx.mkCoupon('pct', { type: 'PERCENT', value: 10 });
    c2 = await fx.mkCoupon('ship', { type: 'FREESHIP', value: 0 });
    c3 = await fx.mkCoupon('gone', { type: 'FIXED', value: 15000 });
    c4 = await fx.mkCoupon('prevonly', { type: 'FIXED', value: 8000 });
    const cur = (d: number) => `2036-03-${d}T03:00:00Z`;
    const prev = (d: string) => `2036-03-${d}T03:00:00Z`;
    // C1: hai đơn (có shippingDiscount ở một đơn: KHÔNG tính vào "giảm" vì không phải freeship).
    await mkOrder({
      email: e('a'),
      paid: cur(11),
      total: 200000,
      couponId: c1.id,
      couponCode: c1.code,
      discountTotal: 20000,
      shippingDiscount: 5000,
    });
    await mkOrder({
      email: e('b'),
      paid: cur(12),
      total: 300000,
      couponId: c1.id,
      couponCode: c1.code,
      discountTotal: 30000,
    });
    // C2 FREESHIP: giảm = shippingDiscount.
    await mkOrder({
      email: e('c'),
      paid: cur(13),
      total: 100000,
      couponId: c2.id,
      couponCode: c2.code,
      shippingDiscount: 30000,
    });
    // C3 FIXED: bị xóa sau khi tạo đơn -> couponId về null, còn snapshot couponCode.
    await mkOrder({
      email: e('d'),
      paid: cur(14),
      total: 150000,
      couponId: c3.id,
      couponCode: c3.code,
      discountTotal: 15000,
    });
    await prisma.coupon.delete({ where: { id: c3.id } });
    // Không dùng mã: aov = 200000.
    await mkOrder({ email: e('e'), paid: cur(12), total: 100000 });
    await mkOrder({ email: e('f'), paid: cur(13), total: 300000 });
    // Bị loại: CANCELLED, COD chưa thu, RETURNED (đều có mã C1).
    await mkOrder({
      email: e('g'),
      paid: cur(12),
      status: 'CANCELLED',
      total: 999000,
      couponId: c1.id,
      couponCode: c1.code,
      discountTotal: 99000,
    });
    await mkOrder({
      email: e('h'),
      status: 'PENDING',
      total: 888000,
      couponId: c1.id,
      couponCode: c1.code,
      discountTotal: 88000,
    });
    await mkOrder({
      email: e('i'),
      paid: cur(14),
      status: 'RETURNED',
      total: 777000,
      couponId: c1.id,
      couponCode: c1.code,
      discountTotal: 77000,
    });
    // Kỳ trước: C1 một đơn, C4 một đơn (chỉ kỳ trước: không liệt kê), một đơn không mã.
    await mkOrder({
      email: e('j'),
      paid: prev('05'),
      total: 100000,
      couponId: c1.id,
      couponCode: c1.code,
      discountTotal: 10000,
    });
    await mkOrder({
      email: e('k'),
      paid: prev('06'),
      total: 80000,
      couponId: c4.id,
      couponCode: c4.code,
      discountTotal: 8000,
    });
    await mkOrder({ email: e('l'), paid: prev('07'), total: 50000 });
  });

  it('summary: đơn có/không mã, tỷ lệ, AOV có/không mã, tổng giảm, kỳ trước', async () => {
    const d = await getCoupons(Q, NOW);
    expect(d.range).toMatchObject({ from: '2036-03-10', to: '2036-03-15', days: 6 });
    expect(d.previousRange).toEqual({ from: '2036-03-04', to: '2036-03-09' });
    expect(d.sort).toBe('revenue');
    expect(d.limit).toBe(10);
    const s = d.summary;
    expect(s.ordersWithCoupon).toEqual({ current: 4, previous: 2, changePct: 100 });
    expect(s.ordersWithoutCoupon).toEqual({ current: 2, previous: 1, changePct: 100 });
    expect(s.couponRate.current).toBe(0.6667);
    expect(s.couponRate.previous).toBe(0.6667);
    expect(s.couponRate.changePts).toBe(0);
    // (200000 + 300000 + 100000 + 150000) / 4
    expect(s.aovWithCoupon.current).toBe(187500);
    expect(s.aovWithCoupon.previous).toBe(90000);
    expect(s.aovWithoutCoupon.current).toBe(200000);
    expect(s.aovWithoutCoupon.previous).toBe(50000);
    // 20000 + 30000 (C1; shippingDiscount 5000 bị bỏ) + 30000 (FREESHIP) + 15000 (mã đã xóa)
    expect(s.totalDiscount.current).toBe(95000);
    expect(s.totalDiscount.previous).toBe(18000);
  });

  it('items: gộp theo mã, mã đã xóa gộp theo snapshot, FREESHIP cộng shippingDiscount, loại đơn không tính', async () => {
    const d = await getCoupons(Q, NOW);
    expect(d.items.map((i) => i.code)).toEqual([c1.code, c3.code, c2.code]);
    const [i1, i3, i2] = d.items as [
      (typeof d.items)[number],
      (typeof d.items)[number],
      (typeof d.items)[number],
    ];
    expect(i1).toMatchObject({
      couponId: c1.id,
      type: 'PERCENT',
      isActive: true,
      deleted: false,
      uses: 2,
      discount: 50000,
      revenue: 500000,
      aov: 250000,
      previousUses: 1,
      previousRevenue: 100000,
      changePct: 400,
    });
    expect(i2).toMatchObject({
      couponId: c2.id,
      type: 'FREESHIP',
      deleted: false,
      uses: 1,
      discount: 30000,
      revenue: 100000,
      previousUses: 0,
      previousRevenue: 0,
      changePct: null,
    });
    expect(i3).toMatchObject({
      couponId: null,
      code: c3.code,
      type: null,
      isActive: null,
      deleted: true,
      uses: 1,
      discount: 15000,
      revenue: 150000,
    });
    // Mã chỉ có ở kỳ trước không được liệt kê.
    expect(d.items.some((i) => i.code === c4.code)).toBe(false);
  });

  it('sort uses / discount và limit', async () => {
    const byUses = await getCoupons({ ...Q, sort: 'uses' }, NOW);
    expect(byUses.items[0]!.code).toBe(c1.code);
    expect(byUses.items.map((i) => i.uses)).toEqual([2, 1, 1]);
    const byDiscount = await getCoupons({ ...Q, sort: 'discount' }, NOW);
    expect(byDiscount.items.map((i) => i.discount)).toEqual([50000, 30000, 15000]);
    expect(byDiscount.items[1]!.code).toBe(c2.code);
    const limited = await getCoupons({ ...Q, limit: 2 }, NOW);
    expect(limited.items).toHaveLength(2);
    expect(limited.limit).toBe(2);
    // Summary không bị cắt bởi limit.
    expect(limited.summary.ordersWithCoupon.current).toBe(4);
  });

  it('khoảng không có đơn: 0, không lỗi', async () => {
    const d = await getCoupons({ from: '2036-01-01', to: '2036-01-05' }, NOW);
    expect(d.items).toEqual([]);
    expect(d.summary.couponRate).toEqual({ current: 0, previous: 0, changePts: null });
    expect(d.summary.aovWithCoupon.current).toBe(0);
  });

  it('HTTP: 401, 403 staff, 200 admin; 400 sort/limit/lặp', async () => {
    const p = '/admin/analytics/coupons';
    expect((await request(app).get(`${API}${p}`)).status).toBe(401);
    expect((await fx.call('get', p, staff.who)).status).toBe(403);
    const ok = await fx.call('get', `${p}?from=2021-01-01&to=2021-01-05`, admin.who);
    expect(ok.status).toBe(200);
    expect(ok.headers['cache-control']).toBe('no-store');
    for (const bad of [
      'sort=abc',
      'limit=0',
      'limit=51',
      'limit=1&limit=2',
      'sort=uses&sort=uses',
    ]) {
      const r = await fx.call('get', `${p}?${bad}`, admin.who);
      expect(r.status, bad).toBe(400);
      expect(errOf(r).code).toBe('VALIDATION_ERROR');
    }
  });
});

// ---------------------------------------------------------------------------------------------
/** Parser CSV tối thiểu (RFC 4180) để so sánh với JSON. Bỏ BOM. */
function parseCsv(text: string): string[][] {
  const s = text.startsWith('﻿') ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' && s[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

describe('export CSV', () => {
  const E = '/admin/analytics/export';
  // Dữ liệu quá khứ (HTTP dùng "hôm nay" thật): 2021-03-10..15, kỳ trước 04..09.
  const RANGE = 'from=2021-03-10&to=2021-03-15';
  const R = { from: '2021-03-10', to: '2021-03-15' } as const;
  const evil = ['=HYPERLINK("http://evil.test","x")', '+1', '-1+1', '@SUM(A1)', '\t=1'];
  const ADDRESS_MARK = 'ĐỊA-CHỈ-NHẠY-CẢM';
  const PHONE_MARK = '0987654321';
  let userFullName: string;

  const auditCount = (actorId?: string) =>
    prisma.auditLog.count({
      where: { action: 'analytics.export', ...(actorId ? { actorId } : {}) },
    });
  const get = (qs: string, who: Who = admin.who) => fx.call('get', `${E}?${qs}`, who);
  const body = (r: request.Response) => (r.text ?? '') as string;

  beforeAll(async () => {
    userFullName = '=cmd|x'; // tên khách độc hại
    await prisma.user.update({ where: { id: customer.id }, data: { fullName: userFullName } });
    const day = (d: number) => `2021-03-${d}T03:00:00Z`;
    // Mỗi sản phẩm độc hại có một đơn đã thanh toán trong kỳ.
    let i = 0;
    for (const name of evil) {
      const v = await fx.mkVariant(`evil${i}`, { stock: 100 });
      await prisma.product.update({ where: { id: v.productId }, data: { name } });
      await mkOrder({
        email: `${PREFIX}x-${i}@example.test`,
        paid: day(11 + (i % 4)),
        total: 100000 + i * 10000,
        productId: v.productId,
        variantId: v.id,
        productName: name,
      });
      i++;
    }
    // Khách đăng ký: SĐT/địa chỉ phải không lọt vào CSV.
    await mkOrder({
      email: customer.email,
      userId: customer.id,
      paid: day(12),
      total: 250000,
      address: {
        fullName: 'Người nhận',
        phone: PHONE_MARK,
        line1: ADDRESS_MARK,
        provinceCode: '79',
        provinceName: 'Thành phố Hồ Chí Minh',
      },
    });
    // Kỳ trước.
    await mkOrder({
      email: `${PREFIX}x-prev@example.test`,
      paid: '2021-03-06T03:00:00Z',
      total: 90000,
    });
    // Biến thể hết hàng để xuất inventory.
    const oos = await fx.mkVariant('oos', { stock: 0 });
    await prisma.product.update({
      where: { id: oos.productId },
      data: { name: '-Hết hàng, "đặc biệt"' },
    });
  });

  describe('quyền và validate - không ghi audit', () => {
    it('401 không đăng nhập, 403 customer và staff (JSON lỗi, không phải CSV)', async () => {
      const before = await auditCount();
      const noAuth = await request(app).get(`${API}${E}?report=overview&${RANGE}`);
      expect(noAuth.status).toBe(401);
      expect(noAuth.headers['content-type']).toMatch(/application\/json/);
      expect(noAuth.headers['cache-control']).toBe('no-store');
      const cu = await get(`report=overview&${RANGE}`, customer.who);
      expect(cu.status).toBe(403);
      const st = await get(`report=overview&${RANGE}`, staff.who);
      expect(st.status).toBe(403);
      expect(errOf(st).code).toBe('FORBIDDEN');
      expect(st.headers['content-type']).toMatch(/application\/json/);
      expect(await auditCount()).toBe(before);
    });

    const bad: Array<[string, string, string]> = [
      ['thiếu report', RANGE, 'report'],
      ['report sai', `report=nope&${RANGE}`, 'report'],
      ['report lặp', `report=overview&report=series&${RANGE}`, 'report'],
      ['breakdown thiếu dimension', `report=breakdown&${RANGE}`, 'dimension'],
      ['breakdown dimension sai', `report=breakdown&dimension=x&${RANGE}`, 'dimension'],
      ['inventory thiếu list', 'report=inventory', 'list'],
      ['inventory list sai', 'report=inventory&list=x', 'list'],
      ['inventory slowDays 6', 'report=inventory&list=slowMovers&slowDays=6', 'slowDays'],
      ['inventory slowDays 366', 'report=inventory&list=slowMovers&slowDays=366', 'slowDays'],
      ['inventory nhận from', `report=inventory&list=lowStock&${RANGE}`, ''],
      ['limit 201', `report=top-products&limit=201&${RANGE}`, 'limit'],
      ['limit 0', `report=top-products&limit=0&${RANGE}`, 'limit'],
      ['limit lặp', `report=top-customers&limit=1&limit=2&${RANGE}`, 'limit'],
      ['sort sai', `report=coupons&sort=abc&${RANGE}`, 'sort'],
      ['sort không áp dụng', `report=overview&sort=revenue&${RANGE}`, ''],
      ['dimension không áp dụng', `report=overview&dimension=brand&${RANGE}`, ''],
      ['from sai', 'report=overview&from=2021-02-30', 'from'],
      ['from lặp', 'report=customers&from=2021-01-01&from=2021-01-02', 'from'],
      ['quá 366 ngày', 'report=operations&from=2020-01-01&to=2022-01-01', 'to'],
      ['to sau hôm nay', 'report=series&to=2099-01-01', 'to'],
    ];
    it.each(bad)('400 VALIDATION_ERROR: %s', async (_n, qs, field) => {
      const before = await auditCount();
      const r = await get(qs);
      expect(r.status).toBe(400);
      expect(errOf(r).code).toBe('VALIDATION_ERROR');
      expect(r.headers['content-type']).toMatch(/application\/json/);
      const details = (errOf(r) as unknown as { details: Array<{ field: string }> }).details;
      expect(details.map((x) => x.field)).toContain(field);
      expect(await auditCount()).toBe(before);
    });
  });

  describe('header và định dạng', () => {
    it('200: text/csv, attachment, tên file an toàn, no-store, nosniff, BOM, CRLF', async () => {
      const r = await get(`report=top-products&${RANGE}`);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(r.headers['content-disposition']).toBe(
        'attachment; filename="beanbox-top-products-2021-03-10_2021-03-15.csv"',
      );
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      const t = body(r);
      expect(t.charCodeAt(0)).toBe(0xfeff);
      expect(t.split('\r\n')[0]).toBe(
        '﻿Hạng,Sản phẩm,Danh mục,Doanh thu (VND),Số lượng,Số đơn,Ghi chú',
      );
      expect(t.endsWith('\r\n')).toBe(true);
    });

    it('tên file theo dimension / list; inventory dùng ngày hôm nay', async () => {
      const b = await get(`report=breakdown&dimension=paymentMethod&${RANGE}`);
      expect(b.headers['content-disposition']).toBe(
        'attachment; filename="beanbox-breakdown-payment-method-2021-03-10_2021-03-15.csv"',
      );
      const inv = await get('report=inventory&list=outOfStock');
      expect(inv.status).toBe(200);
      expect(inv.headers['content-disposition']).toMatch(
        /^attachment; filename="beanbox-inventory-out-of-stock-\d{4}-\d{2}-\d{2}\.csv"$/,
      );
    });

    it('mọi report trả 200 với tiêu đề tiếng Việt', async () => {
      const qs: Record<string, string> = {
        overview: `report=overview&${RANGE}`,
        series: `report=series&${RANGE}`,
        breakdown: `report=breakdown&dimension=category&${RANGE}`,
        'top-products': `report=top-products&${RANGE}`,
        'top-customers': `report=top-customers&${RANGE}`,
        coupons: `report=coupons&${RANGE}`,
        customers: `report=customers&${RANGE}`,
        operations: `report=operations&${RANGE}`,
        inventory: 'report=inventory&list=slowMovers&slowDays=30',
      };
      for (const [name, q] of Object.entries(qs)) {
        const r = await get(q);
        expect(r.status, name).toBe(200);
        expect(parseCsv(body(r)).length, name).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('số liệu CSV khớp JSON', () => {
    it('overview: bảng chỉ số', async () => {
      const dto = await getOverview(R);
      const rows = parseCsv(body(await get(`report=overview&${RANGE}`)));
      expect(rows[0]).toEqual([
        'Chỉ số',
        'Kỳ này',
        'Kỳ trước',
        'Thay đổi (%)',
        'Thay đổi (điểm %)',
      ]);
      const byLabel = new Map(rows.slice(1).map((r) => [r[0]!, r]));
      expect(byLabel.get('Doanh thu (VND)')!.slice(1, 3)).toEqual([
        String(dto.kpis.revenue.current),
        String(dto.kpis.revenue.previous),
      ]);
      expect(Number(byLabel.get('Doanh thu (VND)')![1])).toBeGreaterThan(0);
      expect(byLabel.get('Đơn đã thanh toán')![1]).toBe(String(dto.kpis.paidOrders.current));
      const cancel = byLabel.get('Tỷ lệ hủy (%)')!;
      expect(cancel[1]).toBe(String(Math.round(dto.kpis.cancelRate.current * 10000) / 100));
      expect(cancel[3]).toBe('');
    });

    it('series: tổng doanh thu bằng kpis, kỳ trước theo chỉ số bucket', async () => {
      const dto = await getOverview(R);
      const rows = parseCsv(body(await get(`report=series&${RANGE}`)));
      expect(rows).toHaveLength(1 + Math.max(dto.series.length, dto.previousSeries.length));
      const sum = rows.slice(1).reduce((s, r) => s + Number(r[2]), 0);
      expect(sum).toBe(dto.kpis.revenue.current);
      const prevSum = rows.slice(1).reduce((s, r) => s + Number(r[7] || 0), 0);
      expect(prevSum).toBe(dto.kpis.revenue.previous);
      expect(rows[1]!.slice(0, 2)).toEqual(['2021-03-10', '2021-03-10']);
    });

    it('breakdown: các nhóm + dòng Tổng', async () => {
      const dto = await getBreakdown({ ...R, dimension: 'paymentMethod' });
      const rows = parseCsv(body(await get(`report=breakdown&dimension=paymentMethod&${RANGE}`)));
      expect(rows[0]![0]).toBe('Phương thức thanh toán');
      expect(rows).toHaveLength(dto.groups.length + 2);
      expect(rows[1]!.slice(0, 3)).toEqual([
        dto.groups[0]!.label,
        String(dto.groups[0]!.revenue),
        String(dto.groups[0]!.orders),
      ]);
      expect(rows.at(-1)).toEqual([
        'Tổng',
        String(dto.total.revenue),
        String(dto.total.orders),
        '',
        '',
        String(dto.previousTotal.revenue),
        dto.previousTotal.revenue === 0 ? '' : expect.any(String),
      ]);
    });

    it('top-products: khớp JSON; limit mặc định 100, mở rộng quá 50', async () => {
      const dto = await getTopProducts({ ...R, limit: 100 });
      const rows = parseCsv(body(await get(`report=top-products&${RANGE}`)));
      expect(rows).toHaveLength(dto.items.length + 1);
      expect(dto.items.length).toBeGreaterThanOrEqual(6);
      // Cột số là số nguyên không định dạng.
      for (const [i, it] of dto.items.entries()) {
        const r = rows[i + 1]!;
        expect(r[0]).toBe(String(i + 1));
        expect(r[3]).toBe(String(it.revenue));
        expect(r[4]).toBe(String(it.quantity));
        expect(r[5]).toBe(String(it.orders));
      }
      const two = parseCsv(body(await get(`report=top-products&limit=2&${RANGE}`)));
      expect(two).toHaveLength(3);
    });

    it('coupons / customers / operations: bảng đúng tiêu đề', async () => {
      const c = parseCsv(body(await get(`report=coupons&${RANGE}`)));
      expect(c[0]![0]).toBe('Mã giảm giá');
      const cu = parseCsv(body(await get(`report=customers&${RANGE}`)));
      expect(cu.map((r) => r[0])).toEqual([
        'Chỉ số',
        'Khách mua hàng',
        'Khách mua lần đầu',
        'Khách quay lại',
        'Tỷ lệ mua lại (%)',
        'Doanh thu khách mới (VND)',
        'Doanh thu khách quay lại (VND)',
      ]);
      const op = parseCsv(body(await get(`report=operations&${RANGE}`)));
      expect(op.map((r) => r[0])).toEqual(
        expect.arrayContaining([
          'Đơn hủy (tổng)',
          'Đơn hủy: Khách hủy',
          'Tỷ lệ trả hàng (%)',
          'Số tiền hoàn (VND)',
          'Từ lúc xác nhận đến lúc giao: trung bình (giờ)',
        ]),
      );
    });

    it('inventory: có biến thể hết hàng, tên bắt đầu "-" được vô hiệu và bọc ngoặc', async () => {
      const r = await get('report=inventory&list=outOfStock');
      const t = body(r);
      expect(t).toContain(`"'-Hết hàng, ""đặc biệt"""`);
      const rows = parseCsv(t);
      expect(rows[0]).toEqual([
        'Sản phẩm',
        'Biến thể',
        'SKU',
        'Tồn kho',
        'Ngưỡng sắp hết',
        'Giá niêm yết (VND)',
        'Giá trị tồn (VND)',
        'Bán gần nhất',
      ]);
      const mine = rows.find((x) => x[0]!.includes('Hết hàng, "đặc biệt"'))!;
      expect(mine[3]).toBe('0');
      expect(mine[6]).toBe('0');
    });
  });

  describe('bảo mật nội dung', () => {
    it('top-products: tên sản phẩm độc hại bị vô hiệu (không ô nào bắt đầu bằng ký tự công thức)', async () => {
      const t = body(await get(`report=top-products&${RANGE}`));
      const rows = parseCsv(t);
      const names = rows.slice(1).map((r) => r[1]!);
      for (const n of evil) expect(names).toContain(`'${n}`);
      for (const r of rows) {
        for (const cell of r) expect(/^[=+\-@\t\r]/.test(cell), cell).toBe(false);
      }
      expect(t).toContain(`"'=HYPERLINK(""http://evil.test"",""x"")"`);
    });

    it('top-customers: có email, không có SĐT/địa chỉ/userId; tên độc hại bị vô hiệu', async () => {
      const dto = await getTopCustomers({ ...R, limit: 100 });
      const t = body(await get(`report=top-customers&${RANGE}`));
      const rows = parseCsv(t);
      expect(rows[0]).toEqual([
        'Hạng',
        'Loại khách',
        'Tên',
        'Email',
        'Số đơn',
        'Doanh thu (VND)',
        'Giá trị đơn trung bình (VND)',
        'Thanh toán gần nhất',
      ]);
      expect(rows).toHaveLength(dto.items.length + 1);
      expect(t).toContain(customer.email);
      expect(t).toContain(`'${userFullName}`);
      expect(t).not.toContain(PHONE_MARK);
      expect(t).not.toContain('0912345678');
      expect(t).not.toContain(ADDRESS_MARK);
      expect(t).not.toContain(customer.id);
      for (const r of rows)
        for (const cell of r) expect(/^[=+\-@\t\r]/.test(cell), cell).toBe(false);
    });
  });

  describe('audit', () => {
    it('mỗi lần xuất thành công ghi đúng 1 dòng analytics.export, không chứa dữ liệu khách', async () => {
      const before = await auditCount(admin.id);
      const r1 = await get(`report=top-customers&sort=orders&limit=5&${RANGE}`);
      expect(r1.status).toBe(200);
      expect(await auditCount(admin.id)).toBe(before + 1);
      const row = await prisma.auditLog.findFirst({
        where: { action: 'analytics.export', actorId: admin.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(row).toMatchObject({ entity: 'analytics', entityId: 'top-customers' });
      expect(row!.ip).toBeTruthy();
      const diff = row!.diff as Record<string, [unknown, unknown]>;
      expect(diff.report).toEqual([null, 'top-customers']);
      expect(diff.from).toEqual([null, '2021-03-10']);
      expect(diff.to).toEqual([null, '2021-03-15']);
      expect(diff.sort).toEqual([null, 'orders']);
      expect(diff.limit).toEqual([null, 5]);
      expect(diff.rows?.[1]).toBe(parseCsv(body(r1)).length - 1);
      const json = JSON.stringify(row!.diff);
      expect(json).not.toContain(customer.email);
      expect(json).not.toContain('@example.test');
      // Lần xuất thứ hai: thêm đúng 1 dòng nữa.
      await get('report=inventory&list=slowMovers&slowDays=60');
      expect(await auditCount(admin.id)).toBe(before + 2);
      const inv = await prisma.auditLog.findFirst({
        where: { action: 'analytics.export', actorId: admin.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(inv!.entityId).toBe('inventory');
      const d2 = inv!.diff as Record<string, [unknown, unknown]>;
      expect(d2.list).toEqual([null, 'slowMovers']);
      expect(d2.slowDays).toEqual([null, 60]);
    });
  });

  describe('rate limit riêng', () => {
    it('429 sau khi vượt hạn mức, JSON lỗi + Retry-After; 403 không tiêu hạn mức', async () => {
      const small = createApp({ generalRateLimit: BIG, authRateLimit: BIG, exportRateLimit: 2 });
      const call = (who: Who) =>
        request(small)
          .get(`${API}${E}?report=customers&${RANGE}`)
          .set('Origin', 'http://localhost:3000')
          .set(who.auth ?? {});
      // Staff bị 403 nhiều lần (đặt SAU requireAdmin) không ăn quota.
      for (let i = 0; i < 4; i++) expect((await call(staff.who)).status).toBe(403);
      expect((await call(admin.who)).status).toBe(200);
      expect((await call(admin.who)).status).toBe(200);
      const limited = await call(admin.who);
      expect(limited.status).toBe(429);
      expect(limited.headers['content-type']).toMatch(/application\/json/);
      expect(errOf(limited).code).toBe('RATE_LIMITED');
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
      expect(
        (errOf(limited) as unknown as { details: { retryAfterSec: number } }).details.retryAfterSec,
      ).toBeGreaterThan(0);
      // Limiter của app khác (store riêng) không bị ảnh hưởng.
      expect((await get(`report=customers&${RANGE}`)).status).toBe(200);
    });

    it('mặc định 10 lần/phút', async () => {
      const app10 = createApp({ generalRateLimit: BIG, authRateLimit: BIG });
      const call = () =>
        request(app10)
          .get(`${API}${E}?report=customers&${RANGE}`)
          .set('Origin', 'http://localhost:3000')
          .set(admin.who.auth ?? {});
      for (let i = 0; i < 10; i++) expect((await call()).status).toBe(200);
      expect((await call()).status).toBe(429);
    });
  });
});
