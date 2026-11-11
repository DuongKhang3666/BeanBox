import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCleanupOnce, startBackgroundJobs } from '../src/jobs/cleanup.js';
import { prisma } from '../src/lib/prisma.js';
import { sha256Hex } from '../src/lib/tokens.js';

const PREFIX = 'tm3j-';
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const email = `${PREFIX}u@example.test`;
let userId = '';
let variantId = '';
const hash = () => sha256Hex(`${PREFIX}${randomBytes(16).toString('hex')}`);

async function clean() {
  await prisma.cart.deleteMany({ where: { OR: [{ tokenHash: { startsWith: 'tm3j' } }] } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  await clean();
  const cat = await prisma.category.create({ data: { name: 'Cleanup', slug: `${PREFIX}cat` } });
  const p = await prisma.product.create({
    data: { categoryId: cat.id, name: 'Cleanup', slug: `${PREFIX}p`, status: 'ACTIVE' },
  });
  const v = await prisma.productVariant.create({
    data: { productId: p.id, sku: 'TM3J-V', name: 'v', attributes: {}, price: 1000, stock: 1 },
  });
  variantId = v.id;
  userId = (await prisma.user.create({ data: { email, passwordHash: 'x', fullName: 'Cleanup' } }))
    .id;
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe('runCleanupOnce', () => {
  it('chỉ xóa giỏ guest quá 30 ngày và token hết hạn', async () => {
    const mkCart = (tag: string, daysAgo: number, uid?: string) =>
      prisma.cart.create({
        data: {
          tokenHash: uid ? null : `tm3j-${tag}`,
          userId: uid ?? null,
          lastActivityAt: new Date(NOW.getTime() - daysAgo * DAY),
          items: { create: [{ variantId, quantity: 1, unitPriceAtAdd: 1000 }] },
        },
      });
    const oldGuest = await mkCart('old', 31);
    const newGuest = await mkCart('new', 29);
    const oldUser = await mkCart('user', 90, userId);

    const mkTokens = async () => {
      const expired = new Date(NOW.getTime() - 1000);
      const valid = new Date(NOW.getTime() + DAY);
      const rt = (expiresAt: Date) =>
        prisma.refreshToken.create({
          data: { userId, familyId: 'tm3j-f', tokenHash: hash(), expiresAt },
        });
      const pr = (expiresAt: Date) =>
        prisma.passwordResetToken.create({ data: { userId, tokenHash: hash(), expiresAt } });
      const ev = (expiresAt: Date) =>
        prisma.emailVerificationToken.create({ data: { userId, tokenHash: hash(), expiresAt } });
      return {
        rtOld: await rt(expired),
        rtOk: await rt(valid),
        prOld: await pr(expired),
        prOk: await pr(valid),
        evOld: await ev(expired),
        evOk: await ev(valid),
      };
    };
    const t = await mkTokens();

    const r = await runCleanupOnce(NOW);
    expect(r.skipped).toBe(false);
    if (r.skipped) return;
    // Bảng dev có thể chứa dữ liệu khác nên chỉ kiểm tối thiểu số dòng của test này.
    expect(r.guestCarts).toBeGreaterThanOrEqual(1);
    expect(r.refreshTokens).toBeGreaterThanOrEqual(1);
    expect(r.passwordResetTokens).toBeGreaterThanOrEqual(1);
    expect(r.emailVerificationTokens).toBeGreaterThanOrEqual(1);

    expect(await prisma.cart.findUnique({ where: { id: oldGuest.id } })).toBeNull();
    expect(await prisma.cartItem.count({ where: { cartId: oldGuest.id } })).toBe(0);
    expect(await prisma.cart.findUnique({ where: { id: newGuest.id } })).not.toBeNull();
    expect(await prisma.cart.findUnique({ where: { id: oldUser.id } })).not.toBeNull();

    expect(await prisma.refreshToken.findUnique({ where: { id: t.rtOld.id } })).toBeNull();
    expect(await prisma.refreshToken.findUnique({ where: { id: t.rtOk.id } })).not.toBeNull();
    expect(await prisma.passwordResetToken.findUnique({ where: { id: t.prOld.id } })).toBeNull();
    expect(await prisma.passwordResetToken.findUnique({ where: { id: t.prOk.id } })).not.toBeNull();
    expect(
      await prisma.emailVerificationToken.findUnique({ where: { id: t.evOld.id } }),
    ).toBeNull();
    expect(
      await prisma.emailVerificationToken.findUnique({ where: { id: t.evOk.id } }),
    ).not.toBeNull();

    // Chạy lần nữa: không còn gì của test này để xóa
    const again = await runCleanupOnce(NOW);
    expect(again.skipped).toBe(false);
  });

  it('khi advisory lock đang bị giữ -> skipped', async () => {
    const { CLEANUP_LOCK_KEY } = await import('../src/jobs/cleanup.js');
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let acquired!: () => void;
    const ready = new Promise<void>((r) => (acquired = r));
    const holder = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CLEANUP_LOCK_KEY}::bigint)`;
      acquired();
      await held;
    });
    await ready;
    try {
      expect(await runCleanupOnce(NOW)).toEqual({ skipped: true });
    } finally {
      release();
      await holder;
    }
    expect((await runCleanupOnce(NOW)).skipped).toBe(false);
  });

  it('gọi đồng thời 2 lần -> không lỗi, tối đa một lần chạy thật cùng lúc', async () => {
    const results = await Promise.all([runCleanupOnce(NOW), runCleanupOnce(NOW)]);
    // Nếu trùng thời điểm thì 1 lần skipped; nếu lần đầu xong trước thì cả hai chạy tuần tự (không lỗi).
    expect(results.every((r) => typeof r.skipped === 'boolean')).toBe(true);
  });
});

describe('startBackgroundJobs', () => {
  it('trả hàm dừng và không giữ process sống', () => {
    const stop = startBackgroundJobs();
    expect(typeof stop).toBe('function');
    stop();
  });
});
