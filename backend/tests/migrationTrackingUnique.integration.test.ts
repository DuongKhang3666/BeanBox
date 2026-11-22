import { readFileSync } from 'node:fs';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createFixtures } from './checkoutHelpers.js';
import { placeGuestOrder } from './orderTestHelpers.js';

/**
 * D-068: SQL của migration `d068_tracking_number_unique` chạy trên dữ liệu có mã trùng phải báo lỗi rõ,
 * và chuẩn hóa chuỗi rỗng thành NULL. Mọi thay đổi chạy trong MỘT transaction rồi rollback
 * (DDL của Postgres có transaction) nên không để lại dấu vết trên DB test.
 */

const SQL = readFileSync(
  new URL(
    '../prisma/migrations/20261123090000_d068_tracking_number_unique/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
// 3 câu lệnh: UPDATE; khối DO $$ ... $$; CREATE UNIQUE INDEX.
const UPDATE_SQL = /UPDATE "Order"[^;]*;/.exec(SQL)![0];
const DO_SQL = /DO \$\$[\s\S]*?\$\$;/.exec(SQL)![0].replace(/;$/, '');
const INDEX_SQL = /CREATE UNIQUE INDEX[^;]*;/.exec(SQL)![0];

class Rollback extends Error {}

const PREFIX = 'tmig-';
let app: Express;
const fx = createFixtures(() => app, PREFIX);
let ids: string[] = [];

beforeAll(async () => {
  app = createApp({ generalRateLimit: 100_000, authRateLimit: 100_000, orderRateLimit: 100_000 });
  await fx.setup();
  const v = await fx.mkVariant('m1', { stock: 10 });
  for (let i = 0; i < 3; i++) {
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const row = await prisma.order.findUniqueOrThrow({ where: { code: order.code as string } });
    ids.push(row.id);
  }
});
afterAll(async () => {
  await fx.clean();
  ids = [];
  await prisma.$disconnect();
});

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
async function inRolledBackTx(fn: (tx: Tx) => Promise<void>) {
  await expect(
    prisma.$transaction(async (tx) => {
      await fn(tx);
      throw new Rollback('rollback');
    }),
  ).rejects.toThrow('rollback');
}

describe('migration D-068', () => {
  it('tách được 3 câu lệnh mong đợi', () => {
    expect(UPDATE_SQL).toContain('btrim("trackingNumber")');
    expect(DO_SQL).toContain('RAISE EXCEPTION');
    expect(INDEX_SQL).toContain('"Order_trackingNumber_key"');
  });

  it('chỉ mục duy nhất tồn tại sau migrate deploy', async () => {
    const idx = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'Order' AND indexname = 'Order_trackingNumber_key'`;
    expect(idx).toHaveLength(1);
    expect(idx[0]!.indexdef).toContain('UNIQUE');
  });

  it('chỉ mục cho phép nhiều NULL nhưng chặn trùng mã', async () => {
    await inRolledBackTx(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "Order" SET "trackingNumber" = NULL WHERE id = ANY($1)`,
        ids,
      );
      await tx.$executeRawUnsafe(
        `UPDATE "Order" SET "trackingNumber" = 'UNQ-MIG-1' WHERE id = $1`,
        ids[0],
      );
      await expect(
        tx.$executeRawUnsafe(
          `UPDATE "Order" SET "trackingNumber" = 'UNQ-MIG-1' WHERE id = $1`,
          ids[1],
        ),
      ).rejects.toThrow();
    });
  });

  it('dữ liệu cũ có mã trùng -> RAISE EXCEPTION kèm cách tìm bản trùng, không xóa dữ liệu', async () => {
    await inRolledBackTx(async (tx) => {
      await tx.$executeRawUnsafe('DROP INDEX "Order_trackingNumber_key"');
      await tx.$executeRawUnsafe(
        `UPDATE "Order" SET "trackingNumber" = 'DUP-MIG-1' WHERE id = ANY($1)`,
        [ids[0], ids[1]],
      );
      await tx.$executeRawUnsafe(UPDATE_SQL);
      const still = await tx.order.count({ where: { trackingNumber: 'DUP-MIG-1' } });
      expect(still).toBe(2); // không xóa/sửa bản trùng
      let message = '';
      try {
        await tx.$executeRawUnsafe(DO_SQL);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toContain('D-068');
      expect(message).toContain('DUP-MIG-1');
      expect(message).toContain('GROUP BY');
      expect(message).toContain('prisma migrate deploy');
    });
  });

  it('chuỗi rỗng/khoảng trắng -> NULL; không có bản trùng thì khối DO qua và tạo được chỉ mục', async () => {
    await inRolledBackTx(async (tx) => {
      await tx.$executeRawUnsafe('DROP INDEX "Order_trackingNumber_key"');
      await tx.$executeRawUnsafe(`UPDATE "Order" SET "trackingNumber" = '' WHERE id = $1`, ids[0]);
      await tx.$executeRawUnsafe(
        `UPDATE "Order" SET "trackingNumber" = '  ' WHERE id = $1`,
        ids[1],
      );
      await tx.$executeRawUnsafe(
        `UPDATE "Order" SET "trackingNumber" = 'OK-MIG-1' WHERE id = $1`,
        ids[2],
      );
      await tx.$executeRawUnsafe(UPDATE_SQL);
      const rows = await tx.order.findMany({
        where: { id: { in: ids } },
        select: { id: true, trackingNumber: true },
      });
      const by = new Map(rows.map((r) => [r.id, r.trackingNumber]));
      expect(by.get(ids[0]!)).toBeNull();
      expect(by.get(ids[1]!)).toBeNull();
      expect(by.get(ids[2]!)).toBe('OK-MIG-1');
      await tx.$executeRawUnsafe(DO_SQL);
      await tx.$executeRawUnsafe(INDEX_SQL);
    });
  });
});
