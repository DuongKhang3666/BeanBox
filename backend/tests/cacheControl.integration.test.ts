import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp, isPublicCacheable } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// B1: mặc định no-store cho /api/v1; chỉ GET công khai (catalog, locations, settings...) được bỏ qua.
const app = createApp({ generalRateLimit: 100_000, authRateLimit: 100_000 });
const API = '/api/v1';

afterAll(() => prisma.$disconnect());

describe('Cache-Control: no-store cho response riêng tư', () => {
  it.each([
    ['GET', '/me'],
    ['GET', '/me/orders'],
    ['GET', '/me/addresses'],
    ['GET', '/me/wishlist'],
    ['GET', '/cart'],
    ['GET', '/orders/track?code=BB-000000-AAAAAA&phone=0901234567'],
    ['POST', '/auth/login'],
    ['POST', '/auth/refresh'],
    ['GET', '/products/khong-ton-tai/reviews/me'],
    ['GET', '/admin/orders'],
    ['POST', '/contact'],
    ['POST', '/products'],
  ] as const)('%s %s có no-store (kể cả khi 401/404/400)', async (method, path) => {
    const res = await request(app)[method.toLowerCase() as 'get' | 'post'](`${API}${path}`);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('POST /auth/login sai thông tin (401) có no-store', async () => {
    const res = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: 'khong-co@example.test', password: 'Matkhau123' });
    expect(res.status).toBe(401);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /me không token -> 401 + no-store', async () => {
    const res = await request(app).get(`${API}/me`);
    expect(res.status).toBe(401);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /orders/track không khớp -> 404 + no-store', async () => {
    const res = await request(app).get(
      `${API}/orders/track?code=BB-000000-AAAAAA&phone=0901234567`,
    );
    expect(res.status).toBe(404);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

const PUBLIC_CATALOG = 'public, max-age=30, s-maxage=60, stale-while-revalidate=120';

describe('D-075: catalog công khai có Cache-Control ngắn khi thành công', () => {
  it('GET /products, /categories, /brands -> 200 và đúng header', async () => {
    for (const path of ['/products', '/categories', '/brands', '/search/suggest?q=ca']) {
      const res = await request(app).get(`${API}${path}`);
      expect(res.status, path).toBe(200);
      expect(res.headers['cache-control'], path).toBe(PUBLIC_CATALOG);
    }
  });

  it('HEAD /products cũng có header cache', async () => {
    const res = await request(app).head(`${API}/products`);
    expect(res.headers['cache-control']).toBe(PUBLIC_CATALOG);
  });

  it.each([
    '/products/khong-ton-tai/bought-together',
    '/products/compare',
    '/categories/khong-ton-tai',
    '/search/suggest',
  ])('GET %s lỗi 4xx -> no-store, không bao giờ public', async (path) => {
    const res = await request(app).get(`${API}${path}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /products/khong-ton-tai -> 404 + no-store', async () => {
    const res = await request(app).get(`${API}/products/khong-ton-tai`);
    expect(res.status).toBe(404);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /products?page=abc -> 400 + no-store', async () => {
    const res = await request(app).get(`${API}/products?page=abc`);
    expect(res.status).toBe(400);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('request kèm Authorization vẫn nhận cùng header (catalog không phụ thuộc người gọi)', async () => {
    const res = await request(app).get(`${API}/products`).set('Authorization', 'Bearer x');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe(PUBLIC_CATALOG);
  });

  it('route riêng tư đứng cạnh catalog vẫn no-store (hồi quy: router catalog mount ở gốc API)', async () => {
    for (const p of [
      '/cart',
      '/me',
      '/me/orders',
      '/wishlist',
      '/admin/orders',
      '/checkout/quote',
    ]) {
      const res = await request(app).get(`${API}${p}`);
      expect(res.headers['cache-control'], p).toBe('no-store');
    }
    const post = await request(app).post(`${API}/cart/items`).send({});
    expect(post.headers['cache-control']).toBe('no-store');
  });

  it('GET /products/:slug/reviews lỗi 404 -> no-store', async () => {
    const res = await request(app).get(`${API}/products/khong-ton-tai/reviews`);
    expect(res.status).toBe(404);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /settings/public và /locations giữ Cache-Control do route tự đặt', async () => {
    const s = await request(app).get(`${API}/settings/public`);
    expect(s.status).toBe(200);
    expect(s.headers['cache-control']).toBe('public, max-age=300');
    const l = await request(app).get(`${API}/locations/provinces`);
    expect(l.headers['cache-control']).toMatch(/public/);
  });

  it('GET /health và /health/live không bị ép no-store', async () => {
    for (const p of ['/health', '/health/live']) {
      const res = await request(app).get(`${API}${p}`);
      expect(res.headers['cache-control']).not.toBe('no-store');
    }
  });
});

describe('isPublicCacheable', () => {
  it('chỉ GET/HEAD và đúng path công khai', () => {
    expect(isPublicCacheable('GET', '/products')).toBe(true);
    expect(isPublicCacheable('HEAD', '/products/ca-phe')).toBe(true);
    expect(isPublicCacheable('GET', '/products/ca-phe/reviews')).toBe(true);
    expect(isPublicCacheable('GET', '/products/ca-phe/bought-together')).toBe(true);
    expect(isPublicCacheable('POST', '/products/ca-phe/bought-together')).toBe(false);
    expect(isPublicCacheable('GET', '/products/ca-phe/bought-together/x')).toBe(false);
    expect(isPublicCacheable('GET', '/products/compare')).toBe(true);
    expect(isPublicCacheable('POST', '/products/compare')).toBe(false);
    expect(isPublicCacheable('GET', '/categories/dung-cu')).toBe(true);
    expect(isPublicCacheable('POST', '/products/ca-phe/reviews')).toBe(false);
    expect(isPublicCacheable('GET', '/products/ca-phe/reviews/me')).toBe(false);
    expect(isPublicCacheable('GET', '/me')).toBe(false);
    expect(isPublicCacheable('GET', '/me/orders')).toBe(false);
    expect(isPublicCacheable('GET', '/cart')).toBe(false);
    expect(isPublicCacheable('GET', '/admin/products')).toBe(false);
    expect(isPublicCacheable('GET', '/payments/vnpay/return')).toBe(false);
  });
});
