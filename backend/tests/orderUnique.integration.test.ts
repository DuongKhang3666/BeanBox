import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { uniqueTarget } from '../src/modules/orders/orders.service.js';
import { createFixtures, dataOf } from './checkoutHelpers.js';

// Cho phép ép mã đơn đầu tiên trùng để kiểm nhánh retry khi va chạm `code`.
vi.mock('../src/lib/orderCode.js', async (importOriginal) => {
  const m = await importOriginal<typeof import('../src/lib/orderCode.js')>();
  return { ...m, generateOrderCode: vi.fn(m.generateOrderCode) };
});
const { generateOrderCode } = await import('../src/lib/orderCode.js');

const PREFIX = 'tm8u-';
let app: Express;
const fx = createFixtures(() => app, PREFIX);

beforeAll(async () => {
  app = createApp({
    generalRateLimit: 100_000,
    authRateLimit: 100_000,
    couponRateLimit: 100_000,
    quoteRateLimit: 100_000,
    orderRateLimit: 100_000,
  });
  await fx.setup();
});
afterAll(async () => {
  await fx.clean();
  await prisma.$disconnect();
});

async function catchP2002(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  throw new Error('Kỳ vọng lỗi unique nhưng không có lỗi');
}

describe('uniqueTarget (P2002 qua driver adapter)', () => {
  it('đọc được lỗi unique thật: tên index cho cột code và idempotencyKey', async () => {
    const v = await fx.mkVariant('u1', { stock: 5 });
    const who = await fx.guestWith([[v.id, 1]]);
    const res = await fx.postOrder(who, fx.guestOrderBody());
    expect(res.status).toBe(201);
    const row = await prisma.order.findUniqueOrThrow({ where: { code: dataOf(res).code } });

    const dupCode = await catchP2002(() =>
      prisma.order.create({
        data: { ...row, id: randomUUID(), idempotencyKey: randomUUID() } as never,
      }),
    );
    const t1 = uniqueTarget(dupCode);
    expect(t1).toContain('code');
    expect(t1).not.toContain('idempotencyKey');

    const dupKey = await catchP2002(() =>
      prisma.order.create({
        data: { ...row, id: randomUUID(), code: `BB-000000-${randomUUID().slice(0, 4)}` } as never,
      }),
    );
    const t2 = uniqueTarget(dupKey);
    expect(t2).toContain('idempotencyKey');
    expect(t2).not.toContain('code');
  });

  it('hiểu cả dạng meta.target cũ, và trả null cho lỗi khác', () => {
    const mk = (code: string, meta?: Record<string, unknown>) =>
      new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'test', meta });
    expect(uniqueTarget(mk('P2002', { target: ['idempotencyKey'] }))).toBe('idempotencyKey');
    expect(uniqueTarget(mk('P2002', { target: 'Order_code_key' }))).toBe('Order_code_key');
    expect(
      uniqueTarget(
        mk('P2002', { driverAdapterError: { cause: { constraint: { fields: ['code'] } } } }),
      ),
    ).toBe('code');
    expect(uniqueTarget(mk('P2002'))).toBe('');
    expect(uniqueTarget(mk('P2003'))).toBeNull();
    expect(uniqueTarget(new Error('boom'))).toBeNull();
  });
});

describe('POST /orders - va chạm mã đơn', () => {
  it('trùng mã đơn: sinh mã mới và chạy lại, vẫn 201 với mã khác', async () => {
    const v = await fx.mkVariant('u2', { stock: 5 });
    const first = await fx.postOrder(await fx.guestWith([[v.id, 1]]), fx.guestOrderBody());
    expect(first.status).toBe(201);
    const existingCode = dataOf(first).code as string;

    vi.mocked(generateOrderCode).mockReturnValueOnce(existingCode);
    const second = await fx.postOrder(await fx.guestWith([[v.id, 1]]), fx.guestOrderBody());
    expect(second.status).toBe(201);
    expect(dataOf(second).code).not.toBe(existingCode);
    const count = await prisma.order.count({ where: { items: { some: { variantId: v.id } } } });
    expect(count).toBe(2);
  });
});
