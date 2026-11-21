import { PrismaPg } from '@prisma/adapter-pg';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import { analyticsPrisma, prisma } from '../src/lib/prisma.js';
import { isQueryCanceled } from '../src/modules/admin/analytics/analytics.errors.js';
import { API } from './authHelpers.js';
import { createFixtures, errOf, type Who } from './checkoutHelpers.js';

/** R-08 (D-058): pool riêng + statement_timeout cho analytics; 57014 -> 503 ANALYTICS_TIMEOUT. */

const PREFIX = 'tm1a-';
const BIG = 100_000;
let app: Express;
const fx = createFixtures(() => app, PREFIX);
let admin: { id: string; who: Who };

/** Lỗi đúng dạng Prisma 7 + adapter-pg trả ra khi Postgres hủy truy vấn (đã quan sát thực tế). */
const canceledError = () =>
  new Prisma.PrismaClientKnownRequestError('Raw query failed. Code: `57014`.', {
    code: 'P2010',
    clientVersion: 'test',
    meta: {
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '57014',
          originalMessage: 'canceling statement due to statement timeout',
          kind: 'postgres',
          code: '57014',
        },
      },
    },
  });

beforeAll(async () => {
  app = createApp({ generalRateLimit: BIG, authRateLimit: BIG, exportRateLimit: BIG });
  await fx.setup();
  admin = await fx.mkUser('admin');
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
});
afterAll(async () => {
  await fx.clean();
  await prisma.$disconnect();
  await analyticsPrisma.$disconnect();
});
afterEach(() => vi.restoreAllMocks());

describe('cấu hình client analytics', () => {
  it('statement_timeout ở mức kết nối: analytics theo env, pool chính không giới hạn', async () => {
    const rows = await analyticsPrisma.$queryRaw<Array<{ statement_timeout: string }>>`
      SHOW statement_timeout`;
    expect(rows[0]!.statement_timeout).toBe(`${env.ANALYTICS_STATEMENT_TIMEOUT_MS / 1000}s`);
    const main = await prisma.$queryRaw<Array<{ statement_timeout: string }>>`
      SHOW statement_timeout`;
    expect(main[0]!.statement_timeout).toBe('0');
  });

  it('truy vấn quá timeout thật bị Postgres hủy và nhận diện được là 57014', async () => {
    const short = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: env.DATABASE_URL,
        max: 1,
        statement_timeout: 1000,
      }),
    });
    try {
      const err = await short.$queryRaw`SELECT pg_sleep(5)`.then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).not.toBeNull();
      expect(isQueryCanceled(err)).toBe(true);
      // Kết nối vẫn dùng được sau khi bị hủy.
      expect(await short.$queryRaw`SELECT 1 AS ok`).toEqual([{ ok: 1 }]);
    } finally {
      await short.$disconnect();
    }
  }, 20_000);

  it('isQueryCanceled: nhận dạng các dạng bọc lỗi, bỏ qua lỗi khác và vòng tham chiếu', () => {
    expect(isQueryCanceled(canceledError())).toBe(true);
    expect(isQueryCanceled({ code: '57014' })).toBe(true);
    expect(isQueryCanceled({ cause: { originalCode: '57014' } })).toBe(true);
    expect(isQueryCanceled(new Error('khác'))).toBe(false);
    expect(isQueryCanceled({ code: '23505' })).toBe(false);
    expect(isQueryCanceled(null)).toBe(false);
    expect(isQueryCanceled('57014')).toBe(false);
    const loop: Record<string, unknown> = {};
    loop.cause = loop;
    expect(isQueryCanceled(loop)).toBe(false);
  });
});

describe('ánh xạ lỗi timeout ở route analytics', () => {
  const ENDPOINTS = [
    '/admin/analytics/overview',
    '/admin/analytics/breakdown?dimension=category',
    '/admin/analytics/top-products',
    '/admin/analytics/top-customers',
    '/admin/analytics/customers',
    '/admin/analytics/operations',
    '/admin/analytics/inventory',
    '/admin/analytics/coupons',
    '/admin/analytics/export?report=overview',
  ];

  it.each(ENDPOINTS)('%s: 57014 -> 503 ANALYTICS_TIMEOUT tiếng Việt, no-store', async (path) => {
    vi.spyOn(analyticsPrisma, '$queryRaw').mockRejectedValue(canceledError());
    const res = await fx.call('get', path, admin.who);
    expect(res.status).toBe(503);
    expect(errOf(res)).toEqual({
      code: 'ANALYTICS_TIMEOUT',
      message: 'Truy vấn phân tích quá lâu, hãy thu hẹp khoảng ngày',
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('lỗi khác 57014 vẫn là 500 INTERNAL_ERROR (không bị nuốt)', async () => {
    vi.spyOn(analyticsPrisma, '$queryRaw').mockRejectedValue(new Error('hỏng khác'));
    const res = await fx.call('get', '/admin/analytics/overview', admin.who);
    expect(res.status).toBe(500);
    expect(errOf(res).code).toBe('INTERNAL_ERROR');
  });

  it('không đổi kết quả: các route vẫn 200 khi truy vấn chạy bình thường qua pool riêng', async () => {
    const spy = vi.spyOn(analyticsPrisma, '$queryRaw');
    const res = await fx.call('get', '/admin/analytics/overview', admin.who);
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalled();
    // Quyền không đổi: chưa đăng nhập vẫn 401.
    expect((await request(app).get(`${API}/admin/analytics/overview`)).status).toBe(401);
  });
});
