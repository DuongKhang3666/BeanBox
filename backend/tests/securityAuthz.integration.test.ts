import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { API, bearer } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';
import { placeGuestOrder, placeUserOrder } from './orderTestHelpers.js';

/**
 * M6 (D-020): ma trận phân quyền tự động. Duyệt router stack của app thật nên route mới
 * thêm vào mà chưa được phân loại ở dưới sẽ làm test thất bại (mặc định: bắt buộc đăng nhập).
 */

const PREFIX = 'tm6s-';
const BIG = 100_000;
let app: Express;
const fx = createFixtures(() => app, PREFIX);

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
interface RouteInfo {
  method: Method;
  /** Đường dẫn đầy đủ (có tiền tố mount), đã bỏ dấu `/` cuối. */
  path: string;
  key: string; // "METHOD /path"
}

// --- Duyệt router stack (Express 4) ---------------------------------------------------------

interface Layer {
  route?: { path: unknown; methods: Record<string, boolean> };
  name: string;
  regexp: RegExp & { fast_slash?: boolean };
  handle: { stack?: Layer[] };
}

function mountPathOf(layer: Layer): string {
  if (layer.regexp.fast_slash) return '';
  const m = /^\^((?:\\\/[\w-]+)+)\\\/\?\(\?=\\\/\|\$\)$/.exec(layer.regexp.source);
  if (!m?.[1]) throw new Error(`Không đọc được mount path từ ${layer.regexp.source}`);
  return m[1].replace(/\\\//g, '/');
}

function walk(stack: Layer[], prefix: string, out: RouteInfo[]): void {
  for (const layer of stack) {
    if (layer.route) {
      const p = layer.route.path;
      if (typeof p !== 'string') throw new Error('Route path không phải chuỗi');
      const full = (prefix + p).replace(/(.)\/+$/, '$1');
      for (const method of Object.keys(layer.route.methods) as Method[]) {
        out.push({ method, path: full, key: `${method.toUpperCase()} ${full}` });
      }
    } else if (layer.name === 'router' && layer.handle.stack) {
      walk(layer.handle.stack, prefix + mountPathOf(layer), out);
    }
  }
}

function discoverRoutes(a: Express): RouteInfo[] {
  const router = (a as unknown as { _router: { stack: Layer[] } })._router;
  const out: RouteInfo[] = [];
  walk(router.stack, '', out);
  return out;
}

const concrete = (p: string) => p.replace(/:[A-Za-z]+/g, 'x');

// --- Phân loại tường minh --------------------------------------------------------------------

const A = `${API}`;
/** Public thật sự: không cần đăng nhập. IPN/webhook xác thực bằng chữ ký; track/forgot... có rate limit. */
const PUBLIC = new Set<string>([
  `GET ${A}/health`,
  `GET ${A}/categories`,
  `GET ${A}/categories/:slug`,
  `GET ${A}/brands`,
  `GET ${A}/products`,
  `GET ${A}/products/:slug`,
  `GET ${A}/search/suggest`,
  `GET ${A}/products/:slug/reviews`,
  `GET ${A}/locations/provinces`,
  `GET ${A}/locations/provinces/:code/wards`,
  `GET ${A}/orders/track`,
  `GET ${A}/settings/public`,
  `POST ${A}/csp-report`,
  `POST ${A}/auth/register`,
  `POST ${A}/auth/login`,
  `POST ${A}/auth/forgot-password`,
  `POST ${A}/auth/reset-password`,
  `POST ${A}/auth/verify-email`,
  `GET ${A}/payments/vnpay/ipn`,
  `GET ${A}/payments/vnpay/return`,
  `POST ${A}/payments/stripe/webhook`,
  `POST ${A}/payments/stripe/sync`,
]);
/** Dùng cookie bb_rt, bảo vệ bằng kiểm Origin (không có Origin -> 403 INVALID_ORIGIN). */
const COOKIE_ORIGIN = new Set<string>([`POST ${A}/auth/refresh`, `POST ${A}/auth/logout`]);
/** Optional: khách (kèm X-Cart-Token hoặc SĐT) hoặc user đều dùng được; token sai -> 401. */
const OPTIONAL = new Set<string>([
  `GET ${A}/cart`,
  `DELETE ${A}/cart`,
  `POST ${A}/cart/items`,
  `PATCH ${A}/cart/items/:itemId`,
  `DELETE ${A}/cart/items/:itemId`,
  `POST ${A}/cart/apply-coupon`,
  `DELETE ${A}/cart/coupon`,
  `POST ${A}/checkout/quote`,
  `POST ${A}/orders`,
  `POST ${A}/orders/:code/cancel`,
  `POST ${A}/payments/vnpay/create`,
  `POST ${A}/payments/stripe/create-session`,
  `POST ${A}/contact`,
]);
/** Bắt buộc đăng nhập, nêu tường minh trong yêu cầu M6 (chặn ai đó chuyển nhầm sang OPTIONAL). */
const MUST_BE_AUTH = [
  `GET ${A}/me`,
  `PATCH ${A}/me`,
  `GET ${A}/me/addresses`,
  `POST ${A}/me/addresses`,
  `PATCH ${A}/me/addresses/:id`,
  `DELETE ${A}/me/addresses/:id`,
  `POST ${A}/me/addresses/:id/default`,
  `GET ${A}/me/orders`,
  `GET ${A}/orders/:code`,
  `POST ${A}/cart/merge`,
  `PATCH ${A}/reviews/:id`,
  `POST ${A}/products/:slug/reviews`,
  `GET ${A}/products/:slug/reviews/me`,
  `GET ${A}/me/wishlist`,
  `GET ${A}/me/wishlist/ids`,
  `POST ${A}/me/wishlist`,
  `DELETE ${A}/me/wishlist/:productId`,
  `POST ${A}/auth/change-password`,
  `POST ${A}/auth/resend-verification`,
];
/** Chỉ ADMIN (STAFF -> 403). */
const ADMIN_ONLY = new Set<string>([
  `DELETE ${A}/admin/products/:id`,
  `DELETE ${A}/admin/categories/:id`,
  `DELETE ${A}/admin/brands/:id`,
  `DELETE ${A}/admin/coupons/:id`,
  `POST ${A}/admin/products/:id/restore`,
  `POST ${A}/admin/orders/:code/refunds`,
  `GET ${A}/admin/audit-logs`,
  `GET ${A}/admin/settings`,
  `PUT ${A}/admin/settings`,
  `GET ${A}/admin/users`,
  `GET ${A}/admin/users/:id`,
  `PATCH ${A}/admin/users/:id/status`,
  `PATCH ${A}/admin/users/:id/role`,
]);

const ADMIN_PREFIX = `${API}/admin/`;
const isAdminRoute = (r: RouteInfo) => r.path.startsWith(ADMIN_PREFIX);

let routes: RouteInfo[] = [];
let admin: { id: string; who: Who };
let staff: { id: string; who: Who };
let alice: { id: string; email: string; who: Who };
let bob: { id: string; email: string; who: Who };

const send = (r: RouteInfo, who: Who = {}, headers: Record<string, string> = {}) => {
  let req = request(app)[r.method](concrete(r.path)).set(headers);
  if (who.auth) req = req.set(who.auth);
  return req;
};

async function cleanReviews() {
  await prisma.review.deleteMany({ where: { user: { email: { startsWith: PREFIX } } } });
}

beforeAll(async () => {
  app = createApp({
    generalRateLimit: BIG,
    authRateLimit: BIG,
    guestCancelRateLimit: BIG,
    trackRateLimit: BIG,
    couponRateLimit: BIG,
    quoteRateLimit: BIG,
    orderRateLimit: BIG,
    uploadRateLimit: BIG,
    reviewRateLimit: BIG,
    contactRateLimit: BIG,
    cspReportRateLimit: BIG,
    paymentCreateRateLimit: BIG,
    paymentReturnRateLimit: BIG,
    paymentSyncRateLimit: BIG,
  });
  routes = discoverRoutes(app);
  await cleanReviews();
  await fx.setup();
  admin = await fx.mkUser('admin');
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  staff = await fx.mkUser('staff');
  await prisma.user.update({ where: { id: staff.id }, data: { role: 'STAFF' } });
  alice = await fx.mkUser('alice');
  bob = await fx.mkUser('bob');
});
afterAll(async () => {
  await cleanReviews();
  await prisma.wishlist.deleteMany({ where: { user: { email: { startsWith: PREFIX } } } });
  await fx.restoreSettings();
  await fx.clean();
  await prisma.$disconnect();
});

describe('khám phá route', () => {
  it('thấy đủ route của app (không rỗng, không trùng)', () => {
    expect(routes.length).toBeGreaterThan(80);
    expect(new Set(routes.map((r) => r.key)).size).toBe(routes.length);
    expect(routes.some((r) => r.key === `GET ${A}/admin/orders`)).toBe(true);
    expect(routes.some((r) => r.key === `POST ${A}/admin/uploads`)).toBe(true);
  });

  it('mọi mục khai báo tường minh đều tồn tại thật (không có mục thừa/lỗi thời)', () => {
    const keys = new Set(routes.map((r) => r.key));
    for (const k of [...PUBLIC, ...COOKIE_ORIGIN, ...OPTIONAL, ...MUST_BE_AUTH, ...ADMIN_ONLY]) {
      expect(keys.has(k), `route khai báo nhưng không tồn tại: ${k}`).toBe(true);
    }
  });

  it('public/optional không nằm dưới /admin hay /me', () => {
    for (const k of [...PUBLIC, ...OPTIONAL, ...COOKIE_ORIGIN, ...MUST_BE_AUTH]) {
      if (k.includes('/admin/')) throw new Error(`route admin không được khai báo public: ${k}`);
    }
    for (const k of [...PUBLIC, ...OPTIONAL]) expect(k).not.toMatch(/\/me(\/|$)/);
    for (const k of MUST_BE_AUTH) {
      expect(PUBLIC.has(k) || OPTIONAL.has(k) || COOKIE_ORIGIN.has(k)).toBe(false);
    }
  });
});

describe('route yêu cầu đăng nhập: không token -> 401', () => {
  it('mọi route không thuộc public/optional/cookie đều trả 401 khi không có token', async () => {
    const protectedRoutes = routes.filter(
      (r) => !PUBLIC.has(r.key) && !OPTIONAL.has(r.key) && !COOKIE_ORIGIN.has(r.key),
    );
    expect(protectedRoutes.length).toBeGreaterThan(50);
    const failures: string[] = [];
    for (const r of protectedRoutes) {
      const res = await send(r);
      if (res.status !== 401 || errOf(res)?.code !== 'UNAUTHORIZED') {
        failures.push(`${r.key} -> ${res.status}`);
      }
    }
    // Route mới chưa phân loại mà mở cho khách sẽ lộ ra ở đây (2xx/4xx khác 401).
    expect(failures).toEqual([]);
  });

  it('token rác / sai chữ ký / alg=none -> 401 trên route bắt buộc đăng nhập', async () => {
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: admin.id, role: 'ADMIN', sid: 'x' }),
    ).toString('base64url')}.`;
    for (const t of ['garbage', 'a.b.c', none]) {
      for (const k of [`GET ${A}/me`, `GET ${A}/admin/orders`, `GET ${A}/me/wishlist`]) {
        const r = routes.find((x) => x.key === k)!;
        const res = await send(r, { auth: bearer(t) });
        expect(res.status, `${k} với token ${t.slice(0, 8)}`).toBe(401);
      }
    }
  });

  it('route optional: token sai -> 401 (không âm thầm coi là khách)', async () => {
    for (const k of OPTIONAL) {
      const r = routes.find((x) => x.key === k)!;
      const res = await send(r, { auth: bearer('a.b.c') });
      expect(res.status, k).toBe(401);
    }
  });

  it('route cookie (refresh/logout): thiếu hoặc sai Origin -> 403 INVALID_ORIGIN', async () => {
    for (const k of COOKIE_ORIGIN) {
      const r = routes.find((x) => x.key === k)!;
      for (const h of [{}, { Origin: 'null' }, { Origin: 'https://evil.example' }] as Array<
        Record<string, string>
      >) {
        const res = await send(r, {}, h);
        expect(res.status, `${k} ${JSON.stringify(h)}`).toBe(403);
        expect(errOf(res).code).toBe('INVALID_ORIGIN');
      }
    }
  });
});

describe('/api/v1/admin/*: CUSTOMER 403, STAFF 403 ở route Admin-only', () => {
  it('mọi route admin: không token 401, token sai 401', async () => {
    const adminRoutes = routes.filter(isAdminRoute);
    expect(adminRoutes.length).toBeGreaterThanOrEqual(35);
    for (const r of adminRoutes) {
      expect((await send(r)).status, r.key).toBe(401);
      expect((await send(r, { auth: bearer('a.b.c') })).status, r.key).toBe(401);
    }
  });

  it('mọi route admin: CUSTOMER -> 403 FORBIDDEN', async () => {
    for (const r of routes.filter(isAdminRoute)) {
      const res = await send(r, alice.who);
      expect(res.status, r.key).toBe(403);
      expect(errOf(res).code).toBe('FORBIDDEN');
    }
  });

  it('route Admin-only: STAFF -> 403; route còn lại: STAFF không bị 403 (danh sách khớp code)', async () => {
    const adminRoutes = routes.filter(isAdminRoute);
    for (const r of adminRoutes) {
      const res = await send(r, staff.who);
      if (ADMIN_ONLY.has(r.key)) expect(res.status, r.key).toBe(403);
      else expect(res.status, `${r.key} (STAFF)`).not.toBe(403);
      expect(res.status, r.key).toBeLessThan(500);
    }
  });

  it('ADMIN qua được tầng quyền ở các route Admin-only (không 401/403)', async () => {
    for (const k of ADMIN_ONLY) {
      const r = routes.find((x) => x.key === k)!;
      const res = await send(r, admin.who);
      expect([401, 403], k).not.toContain(res.status);
      expect(res.status, k).toBeLessThan(500);
    }
  });

  it('response admin (kể cả 401/403) không được cache', async () => {
    const r = routes.find((x) => x.key === `GET ${A}/admin/orders`)!;
    for (const who of [{}, alice.who]) {
      expect((await send(r, who)).headers['cache-control']).toBe('no-store');
    }
  });
});

describe('IDOR: user B truy cập tài nguyên của user A', () => {
  it('địa chỉ: sửa/xóa/đặt mặc định -> 404, dữ liệu không đổi', async () => {
    const addr = await fx.mkAddress(alice.id);
    const before = await prisma.address.findUniqueOrThrow({ where: { id: addr.id } });

    const patch = await fx.call('patch', `/me/addresses/${addr.id}`, bob.who, {
      fullName: 'Kẻ xấu',
    });
    const del = await fx.call('delete', `/me/addresses/${addr.id}`, bob.who);
    const def = await fx.call('post', `/me/addresses/${addr.id}/default`, bob.who);
    for (const res of [patch, del, def]) {
      expect(res.status).toBe(404);
      expect(errOf(res).code).toBe('NOT_FOUND');
    }
    const after = await prisma.address.findUniqueOrThrow({ where: { id: addr.id } });
    expect(after).toEqual(before);

    // B không thấy địa chỉ của A trong danh sách
    const list = await fx.call('get', '/me/addresses', bob.who);
    expect(dataOf(list)).toEqual([]);
  });

  it('đơn hàng: xem/hủy -> 404 (kể cả STAFF/ADMIN xem /orders/:code), đơn không bị hủy', async () => {
    const v = await fx.mkVariant('idor-order', { stock: 20 });
    const order = await placeUserOrder(fx, alice, [[v.id, 1]]);

    for (const who of [bob.who, staff.who, admin.who]) {
      const get = await fx.call('get', `/orders/${order.code}`, who);
      expect(get.status).toBe(404);
      expect(errOf(get).code).toBe('NOT_FOUND');
      const cancel = await fx.call('post', `/orders/${order.code}/cancel`, who, {
        phone: '0912345678', // dù biết SĐT đơn, user đăng nhập khác vẫn chỉ hủy đơn của chính mình
      });
      expect(cancel.status).toBe(404);
    }
    const row = await prisma.order.findUniqueOrThrow({ where: { code: order.code as string } });
    expect(row.status).not.toBe('CANCELLED');

    // Danh sách đơn của B không có đơn của A
    const mine = await fx.call('get', '/me/orders', bob.who);
    expect(JSON.stringify(dataOf(mine))).not.toContain(order.code as string);

    // Khách vãng bằng SĐT cũng không hủy được đơn gắn tài khoản
    const guestCancel = await fx.call(
      'post',
      `/orders/${order.code}/cancel`,
      {},
      {
        phone: '0912345678',
      },
    );
    expect(guestCancel.status).toBe(404);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { code: order.code as string } })).status,
    ).not.toBe('CANCELLED');
  });

  it('review: B sửa review của A -> 404, nội dung giữ nguyên', async () => {
    const v = await fx.mkVariant('idor-review');
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: v.productId },
      select: { id: true, slug: true },
    });
    const order = await prisma.order.create({
      data: {
        code: `BB-T6S1-${randomUUID().slice(0, 6)}`,
        userId: alice.id,
        contactEmail: alice.email,
        contactPhone: '0912345678',
        status: 'DELIVERED',
        paymentMethod: 'COD',
        shippingMethod: 'STANDARD',
        shippingAddress: {},
        subtotal: 100000,
        shippingFee: 0,
        grandTotal: 100000,
        idempotencyKey: randomUUID(),
        requestFingerprint: 'x',
        items: {
          create: [
            {
              productId: product.id,
              variantId: v.id,
              productName: 'SP',
              variantName: 'BT',
              sku: 'SKU',
              unitPrice: 100000,
              quantity: 1,
              lineTotal: 100000,
            },
          ],
        },
      },
    });
    expect(order.id).toBeTruthy();
    const created = await fx.call('post', `/products/${product.slug}/reviews`, alice.who, {
      rating: 5,
      content: 'Rất tốt',
    });
    expect(created.status).toBe(201);
    const id = dataOf(created).id as string;

    const patch = await fx.call('patch', `/reviews/${id}`, bob.who, { rating: 1, content: 'xấu' });
    expect(patch.status).toBe(404);
    const row = await prisma.review.findUniqueOrThrow({ where: { id } });
    expect(row.rating).toBe(5);
    expect(row.content).toBe('Rất tốt');

    // B không có đánh giá của chính mình trên sản phẩm này
    const mine = await fx.call('get', `/products/${product.slug}/reviews/me`, bob.who);
    expect(JSON.stringify(mine.body)).not.toContain(id);
  });

  it('dòng giỏ: user B và khách khác không sửa/xóa được dòng giỏ của A', async () => {
    const v = await fx.mkVariant('idor-cart');
    const added = await fx.add(alice.who, v.id, 2);
    expect(added.status).toBe(201);
    const itemId = (dataOf(added).items as Array<{ id: string }>)[0]!.id;

    const guest = await fx.guestWith([[v.id, 1]]);
    for (const who of [bob.who, guest]) {
      const patch = await fx.call('patch', `/cart/items/${itemId}`, who, { quantity: 9 });
      const del = await fx.call('delete', `/cart/items/${itemId}`, who);
      expect(patch.status).toBe(404);
      expect(del.status).toBe(404);
    }
    const row = await prisma.cartItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(row.quantity).toBe(2);
  });

  it('wishlist: B xóa mục của A không ảnh hưởng; danh sách tách riêng', async () => {
    const v = await fx.mkVariant('idor-wish');
    expect(
      (await fx.call('post', '/me/wishlist', alice.who, { productId: v.productId })).status,
    ).toBeLessThan(300);

    const del = await fx.call('delete', `/me/wishlist/${v.productId}`, bob.who);
    expect([200, 204, 404]).toContain(del.status);
    expect(
      await prisma.wishlist.count({ where: { userId: alice.id, productId: v.productId } }),
    ).toBe(1);
    const bobIds = await fx.call('get', '/me/wishlist/ids', bob.who);
    expect(dataOf(bobIds).productIds).toEqual([]);
  });

  it('khách tra cứu/hủy đơn sai SĐT -> 404 cùng thông báo với đơn không tồn tại', async () => {
    const v = await fx.mkVariant('idor-guest', { stock: 20 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]], {}, '0901234567');
    const code = order.code as string;

    const trackWrong = await fx.call('get', `/orders/track?code=${code}&phone=0912345678`);
    const trackMissing = await fx.call('get', '/orders/track?code=BB-261111-ZZZZ&phone=0912345678');
    const cancelWrong = await fx.call(
      'post',
      `/orders/${code}/cancel`,
      {},
      { phone: '0912345678' },
    );
    const cancelMissing = await fx.call(
      'post',
      '/orders/BB-261111-ZZZZ/cancel',
      {},
      { phone: '0912345678' },
    );
    for (const res of [trackWrong, trackMissing, cancelWrong, cancelMissing]) {
      expect(res.status).toBe(404);
    }
    expect(errOf(trackWrong)).toEqual(errOf(trackMissing));
    expect(errOf(cancelWrong)).toEqual(errOf(cancelMissing));
    expect(errOf(trackWrong)).toEqual(errOf(cancelWrong));
    expect((await prisma.order.findUniqueOrThrow({ where: { code } })).status).not.toBe(
      'CANCELLED',
    );
  });
});
