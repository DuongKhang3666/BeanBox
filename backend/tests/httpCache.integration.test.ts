import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp, uploadCacheControl } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import {
  getShopSettings,
  invalidateShopSettingsCache,
  setShopSettingsCacheTtl,
} from '../src/modules/settings/settings.service.js';

/** D-075: /uploads (tên ngẫu nhiên vs cố định) và cache getShopSettings. */

const HEX = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'bb-uploads-'));
  mkdirSync(path.join(dir, 'products', '2026', '11'), { recursive: true });
  mkdirSync(path.join(dir, 'seed'), { recursive: true });
  writeFileSync(path.join(dir, 'products', '2026', '11', `${HEX}.webp`), 'x');
  writeFileSync(path.join(dir, 'products', '2026', '11', 'ten-tu-dat.webp'), 'x');
  writeFileSync(path.join(dir, 'seed', 'hat-ca-phe.svg'), '<svg/>');
  writeFileSync(path.join(dir, 'seed', `${HEX}.svg`), '<svg/>');
  writeFileSync(path.join(dir, '.secret'), 'x');
  app = createApp({ uploadsDir: dir, generalRateLimit: 100_000, authRateLimit: 100_000 });
});
afterAll(async () => {
  rmSync(dir, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('/uploads Cache-Control', () => {
  it('uploadCacheControl: chỉ 32 hex thường + đuôi ảnh hợp lệ mới immutable', () => {
    const immutable = 'public, max-age=31536000, immutable';
    const daily = 'public, max-age=86400';
    expect(uploadCacheControl(`/x/products/2026/11/${HEX}.jpg`)).toBe(immutable);
    expect(uploadCacheControl(`C:\\x\\${HEX}.png`)).toBe(immutable);
    expect(uploadCacheControl(`/x/${HEX}.svg`)).toBe(daily);
    expect(uploadCacheControl(`/x/${HEX.toUpperCase()}.jpg`)).toBe(daily);
    expect(uploadCacheControl(`/x/${HEX.slice(1)}.jpg`)).toBe(daily);
    expect(uploadCacheControl(`/x/${HEX}0.jpg`)).toBe(daily);
    expect(uploadCacheControl('/x/seed/ca-phe.svg')).toBe(daily);
  });

  it('tên hex ngẫu nhiên -> immutable 1 năm, vẫn nosniff', async () => {
    const res = await request(app).get(`/uploads/products/2026/11/${HEX}.webp`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('tên cố định (ảnh seed, ảnh đặt tên tay) -> 1 ngày, vẫn nosniff', async () => {
    for (const p of ['/uploads/seed/hat-ca-phe.svg', '/uploads/products/2026/11/ten-tu-dat.webp']) {
      const res = await request(app).get(p);
      expect(res.status, p).toBe(200);
      expect(res.headers['cache-control'], p).toBe('public, max-age=86400');
      expect(res.headers['x-content-type-options'], p).toBe('nosniff');
    }
  });

  it('hex nhưng đuôi svg (không phải do server sinh) -> không immutable', async () => {
    const res = await request(app).get(`/uploads/seed/${HEX}.svg`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
  });

  it('dotfile bị từ chối và file không có -> 404, không gắn cache ảnh', async () => {
    for (const p of ['/uploads/.secret', '/uploads/khong-co.png']) {
      const res = await request(app).get(p);
      expect(res.status, p).toBe(404);
      expect(res.headers['cache-control'] ?? '', p).not.toMatch(/immutable|max-age=86400/);
    }
  });
});

describe('getShopSettings cache trong tiến trình', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    setShopSettingsCacheTtl(0);
  });

  it('2 lần đọc trong TTL -> 1 truy vấn; invalidate -> đọc lại', async () => {
    setShopSettingsCacheTtl(30_000);
    const spy = vi.spyOn(prisma.setting, 'findMany');
    const a = await getShopSettings();
    const b = await getShopSettings();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
    // Trả bản sao: sửa kết quả không làm hỏng cache
    const original = a.shippingRates.inner.STANDARD;
    a.shippingRates.inner.STANDARD = original + 1;
    expect((await getShopSettings()).shippingRates.inner.STANDARD).toBe(original);
    expect(spy).toHaveBeenCalledTimes(1);
    invalidateShopSettingsCache();
    await getShopSettings();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('hết TTL -> đọc lại (đồng hồ giả)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    setShopSettingsCacheTtl(30_000);
    const spy = vi.spyOn(prisma.setting, 'findMany');
    await getShopSettings();
    vi.advanceTimersByTime(29_000);
    await getShopSettings();
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    await getShopSettings();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('đọc trong transaction không dùng cache (tạo đơn luôn thấy giá trị mới nhất)', async () => {
    setShopSettingsCacheTtl(30_000);
    await getShopSettings();
    await prisma.$transaction(async (tx) => {
      const spy = vi.spyOn(tx.setting, 'findMany');
      await getShopSettings(tx);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});
