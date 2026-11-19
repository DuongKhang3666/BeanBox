import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { maskAuthorName } from '../src/modules/reviews/reviews.shared.js';
import { API, bearer, ORIGIN } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

const PREFIX = 'tm6a-';
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
  reviewRateLimit: 100_000,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
type User = { id: string; email: string; who: Who };

let admin: User;
let staff: User;
let alice: User;
let bob: User;
let seq = 0;

const DAY = 24 * 3600 * 1000;

function call(
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  path: string,
  who: Who = {},
  body?: Record<string, unknown>,
  target: Express = app,
) {
  let r = request(target)[method](`${API}${path}`).set('Origin', ORIGIN);
  if (who.auth) r = r.set(who.auth);
  if (body) r = r.send(body);
  return r;
}

async function mkRole(key: string, role: 'STAFF' | 'ADMIN' | 'CUSTOMER'): Promise<User> {
  const u = await fx.mkUser(key);
  if (role !== 'CUSTOMER') await prisma.user.update({ where: { id: u.id }, data: { role } });
  return u;
}

/** Sản phẩm ACTIVE mới + biến thể; trả id/slug. */
async function mkProduct(key: string, status: 'ACTIVE' | 'DRAFT' = 'ACTIVE') {
  const v = await fx.mkVariant(key, { status });
  const p = await prisma.product.findUniqueOrThrow({
    where: { id: v.productId },
    select: { id: true, slug: true },
  });
  return { ...p, variantId: v.id };
}

/** Tạo đơn của user với 1 dòng thuộc sản phẩm (ghi thẳng DB). */
async function mkOrder(
  user: User,
  p: { id: string; variantId: string },
  status: 'DELIVERED' | 'SHIPPING' | 'CANCELLED' = 'DELIVERED',
  createdAt?: Date,
) {
  const order = await prisma.order.create({
    data: {
      code: `BB-T6A${++seq}-${randomUUID().slice(0, 6)}`,
      userId: user.id,
      contactEmail: user.email,
      contactPhone: '0912345678',
      status,
      paymentMethod: 'COD',
      shippingMethod: 'STANDARD',
      shippingAddress: {},
      subtotal: 100000,
      shippingFee: 0,
      grandTotal: 100000,
      idempotencyKey: randomUUID(),
      requestFingerprint: 'x',
      ...(createdAt ? { createdAt } : {}),
      items: {
        create: [
          {
            productId: p.id,
            variantId: p.variantId,
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
    include: { items: true },
  });
  return order.items[0]!;
}

const postReview = (slug: string, who: Who, body: Record<string, unknown>) =>
  call('post', `/products/${slug}/reviews`, who, body);
const getReviews = (slug: string, q = '') => call('get', `/products/${slug}/reviews${q}`);
const productRating = (id: string) =>
  prisma.product.findUniqueOrThrow({
    where: { id },
    select: { ratingAvg: true, ratingCount: true },
  });

async function cleanAll() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { entity: 'Review', actorId: { in: users.map((u) => u.id) } },
  });
  // Review -> OrderItem/User là Restrict: xóa trước khi fixture dọn đơn và user
  await prisma.review.deleteMany({ where: { user: { email: { startsWith: PREFIX } } } });
}

beforeAll(async () => {
  app = createApp(BIG);
  await cleanAll();
  await fx.setup();
  admin = await mkRole('admin', 'ADMIN');
  staff = await mkRole('staff', 'STAFF');
  alice = await mkRole('alice', 'CUSTOMER'); // fullName mặc định "Nguyễn Văn An"
  bob = await mkRole('bob', 'CUSTOMER');
});
afterAll(async () => {
  await cleanAll();
  await fx.clean();
  await prisma.$disconnect();
});

describe('maskAuthorName', () => {
  it('che theo contract', () => {
    expect(maskAuthorName('Nguyễn Văn An')).toBe('An N. V.');
    expect(maskAuthorName('Trần Bình')).toBe('Bình T.');
    expect(maskAuthorName('Khang')).toBe('Khang');
    expect(maskAuthorName('  lê   thị  hoa ')).toBe('hoa L. T.');
    expect(maskAuthorName('Đặng Văn Ơn')).toBe('Ơn Đ. V.');
  });
});

describe('xác thực và phạm vi sản phẩm', () => {
  it('401 khi thiếu token ở /me, POST, PATCH', async () => {
    const p = await mkProduct('auth');
    expect((await call('get', `/products/${p.slug}/reviews/me`)).status).toBe(401);
    expect((await postReview(p.slug, {}, { rating: 5 })).status).toBe(401);
    expect((await call('patch', '/reviews/abc', {}, { rating: 5 })).status).toBe(401);
    expect(
      (await call('get', `/products/${p.slug}/reviews/me`, { auth: bearer('x.y.z') })).status,
    ).toBe(401);
  });

  it('slug không tồn tại hoặc sản phẩm DRAFT/đã xóa -> 404 (list, me, POST)', async () => {
    const draft = await mkProduct('draft', 'DRAFT');
    const gone = await mkProduct('gone');
    await mkOrder(alice, draft);
    await mkOrder(alice, gone);
    await prisma.product.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    for (const slug of [draft.slug, gone.slug, 'khong-ton-tai-' + PREFIX]) {
      expect((await getReviews(slug)).status).toBe(404);
      expect((await call('get', `/products/${slug}/reviews/me`, alice.who)).status).toBe(404);
      const post = await postReview(slug, alice.who, { rating: 5 });
      expect(post.status).toBe(404);
      expect(errOf(post).code).toBe('NOT_FOUND');
    }
  });
});

describe('điều kiện được đánh giá', () => {
  it('chưa mua -> NOT_PURCHASED; /me báo canReview=false', async () => {
    const p = await mkProduct('np');
    const res = await postReview(p.slug, alice.who, { rating: 5, content: 'x' });
    expect(res.status).toBe(409);
    expect(errOf(res).code).toBe('REVIEW_NOT_ALLOWED');
    expect(errOf(res).details).toEqual({ reason: 'NOT_PURCHASED' });
    const me = dataOf(await call('get', `/products/${p.slug}/reviews/me`, alice.who));
    expect(me).toEqual({ canReview: false, reason: 'NOT_PURCHASED', review: null, canEdit: false });
  });

  it('đơn chưa DELIVERED hoặc của người khác -> NOT_PURCHASED', async () => {
    const p = await mkProduct('np2');
    await mkOrder(alice, p, 'SHIPPING');
    await mkOrder(alice, p, 'CANCELLED');
    await mkOrder(bob, p, 'DELIVERED'); // đơn đã giao nhưng của bob
    const res = await postReview(p.slug, alice.who, { rating: 4 });
    expect(res.status).toBe(409);
    expect(errOf(res).details).toEqual({ reason: 'NOT_PURCHASED' });
    expect(await prisma.review.count({ where: { productId: p.id } })).toBe(0);
  });

  it('validate: rating và content', async () => {
    const p = await mkProduct('val');
    await mkOrder(alice, p);
    for (const body of [
      {},
      { rating: 0 },
      { rating: 6 },
      { rating: 3.5 },
      { rating: '5' },
      { rating: 5, content: 'a'.repeat(2001) },
      { rating: 5, content: 123 },
      { rating: 5, content: 'a\u0000b' },
    ]) {
      const res = await postReview(p.slug, alice.who, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(errOf(res).code).toBe('VALIDATION_ERROR');
    }
    expect(await prisma.review.count({ where: { productId: p.id } })).toBe(0);
  });
});

describe('tạo, sửa, trùng lặp', () => {
  it('tạo thành công: PUBLISHED, trim, ẩn danh, cập nhật denorm; lần 2 -> ALREADY_REVIEWED', async () => {
    const p = await mkProduct('ok');
    const item = await mkOrder(alice, p);
    expect(dataOf(await call('get', `/products/${p.slug}/reviews/me`, alice.who)).canReview).toBe(
      true,
    );

    const res = await postReview(p.slug, alice.who, { rating: 5, content: '  Thơm, hậu ngọt.  ' });
    expect(res.status).toBe(201);
    const r = dataOf(res) as Json;
    expect(r).toMatchObject({
      rating: 5,
      content: 'Thơm, hậu ngọt.',
      authorName: 'An N. V.',
      verifiedPurchase: true,
      status: 'PUBLISHED',
      images: [],
      reply: null,
      repliedAt: null,
    });
    expect((await prisma.review.findUniqueOrThrow({ where: { id: r.id } })).orderItemId).toBe(
      item.id,
    );
    expect(await productRating(p.id)).toEqual({ ratingAvg: 5, ratingCount: 1 });

    const again = await postReview(p.slug, alice.who, { rating: 1 });
    expect(again.status).toBe(409);
    expect(errOf(again).details).toEqual({ reason: 'ALREADY_REVIEWED' });

    const me = dataOf(await call('get', `/products/${p.slug}/reviews/me`, alice.who));
    expect(me).toMatchObject({
      canReview: false,
      reason: 'ALREADY_REVIEWED',
      canEdit: true,
      review: { id: r.id, status: 'PUBLISHED' },
    });
  });

  it('mua nhiều lần vẫn chỉ 1 đánh giá; orderItemId = dòng DELIVERED sớm nhất', async () => {
    const p = await mkProduct('multi');
    const late = await mkOrder(alice, p, 'DELIVERED', new Date(Date.now() - 1 * DAY));
    const early = await mkOrder(alice, p, 'DELIVERED', new Date(Date.now() - 5 * DAY));
    const res = await postReview(p.slug, alice.who, { rating: 4 });
    expect(res.status).toBe(201);
    const row = await prisma.review.findUniqueOrThrow({ where: { id: dataOf(res).id } });
    expect(row.orderItemId).toBe(early.id);
    expect(row.orderItemId).not.toBe(late.id);
    expect((await postReview(p.slug, alice.who, { rating: 4 })).status).toBe(409);
  });

  it('2 POST song song -> đúng 1 thành công, 1 conflict', async () => {
    const p = await mkProduct('race');
    await mkOrder(bob, p);
    await mkOrder(bob, p);
    const results = await Promise.all([
      postReview(p.slug, bob.who, { rating: 5, content: 'a' }),
      postReview(p.slug, bob.who, { rating: 3, content: 'b' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(errOf(loser).code).toBe('REVIEW_NOT_ALLOWED');
    expect(errOf(loser).details).toEqual({ reason: 'ALREADY_REVIEWED' });
    expect(await prisma.review.count({ where: { productId: p.id, userId: bob.id } })).toBe(1);
    expect((await productRating(p.id)).ratingCount).toBe(1);
  });

  it('sửa: cập nhật rating/content, denorm đổi; người khác sửa -> 404; id lạ -> 404', async () => {
    const p = await mkProduct('edit');
    await mkOrder(alice, p);
    const id = dataOf(await postReview(p.slug, alice.who, { rating: 5, content: 'cũ' })).id;
    const before = await prisma.review.findUniqueOrThrow({ where: { id } });

    const edited = await call('patch', `/reviews/${id}`, alice.who, {
      rating: 2,
      content: ' mới ',
    });
    expect(edited.status).toBe(200);
    expect(dataOf(edited)).toMatchObject({ id, rating: 2, content: 'mới', status: 'PUBLISHED' });
    expect(new Date(dataOf(edited).updatedAt).getTime()).toBeGreaterThanOrEqual(
      before.updatedAt.getTime(),
    );
    expect(await productRating(p.id)).toEqual({ ratingAvg: 2, ratingCount: 1 });

    // chỉ content
    const onlyContent = await call('patch', `/reviews/${id}`, alice.who, {
      content: 'chỉ nội dung',
    });
    expect(dataOf(onlyContent)).toMatchObject({ rating: 2, content: 'chỉ nội dung' });

    // IDOR
    const other = await call('patch', `/reviews/${id}`, bob.who, { rating: 1 });
    expect(other.status).toBe(404);
    expect(errOf(other).code).toBe('NOT_FOUND');
    expect((await call('patch', '/reviews/khongco', alice.who, { rating: 1 })).status).toBe(404);
    expect((await prisma.review.findUniqueOrThrow({ where: { id } })).rating).toBe(2);

    // validate
    expect((await call('patch', `/reviews/${id}`, alice.who, {})).status).toBe(400);
    expect((await call('patch', `/reviews/${id}`, alice.who, { rating: 9 })).status).toBe(400);
  });

  it('sửa quá 30 ngày -> 409 REVIEW_EDIT_EXPIRED; canEdit=false; còn trong hạn thì sửa được', async () => {
    const p = await mkProduct('expire');
    await mkOrder(alice, p);
    const id = dataOf(await postReview(p.slug, alice.who, { rating: 5 })).id;

    await prisma.review.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - 29 * DAY) },
    });
    expect((await call('patch', `/reviews/${id}`, alice.who, { rating: 4 })).status).toBe(200);

    await prisma.review.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - 31 * DAY) },
    });
    const res = await call('patch', `/reviews/${id}`, alice.who, { rating: 1 });
    expect(res.status).toBe(409);
    expect(errOf(res).code).toBe('REVIEW_EDIT_EXPIRED');
    expect((await prisma.review.findUniqueOrThrow({ where: { id } })).rating).toBe(4);
    const me = dataOf(await call('get', `/products/${p.slug}/reviews/me`, alice.who));
    expect(me.canEdit).toBe(false);
    expect(me.review.id).toBe(id);
  });
});

describe('danh sách công khai', () => {
  it('summary/distribution trên toàn bộ PUBLISHED, lọc rating, sắp xếp, phân trang', async () => {
    const p = await mkProduct('list');
    const ratings = [5, 5, 4, 1];
    const authors: User[] = [];
    for (const [i, rating] of ratings.entries()) {
      const u = await mkRole(`lister${i}`, 'CUSTOMER');
      authors.push(u);
      await mkOrder(u, p);
      const res = await postReview(p.slug, u.who, { rating, content: `Đánh giá ${i}` });
      expect(res.status).toBe(201);
      // tách createdAt để thứ tự ổn định
      await prisma.review.update({
        where: { id: dataOf(res).id },
        data: { createdAt: new Date(Date.now() - (ratings.length - i) * 60_000) },
      });
    }

    const all = await getReviews(p.slug);
    expect(all.status).toBe(200);
    expect(all.body.meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 4,
      totalPages: 1,
      summary: { ratingAvg: 3.8, ratingCount: 4, distribution: { 1: 1, 2: 0, 3: 0, 4: 1, 5: 2 } },
    });
    expect((all.body.data as Json[]).map((r) => r.content)).toEqual([
      'Đánh giá 3',
      'Đánh giá 2',
      'Đánh giá 1',
      'Đánh giá 0',
    ]);

    const five = await getReviews(p.slug, '?rating=5');
    expect(five.body.meta.total).toBe(2);
    expect(five.body.meta.summary.ratingCount).toBe(4); // không bị lọc ảnh hưởng
    const fourFive = await getReviews(p.slug, '?rating=4,5');
    expect(fourFive.body.meta.total).toBe(3);

    const highest = await getReviews(p.slug, '?sort=highest');
    expect((highest.body.data as Json[]).map((r) => r.rating)).toEqual([5, 5, 4, 1]);
    const lowest = await getReviews(p.slug, '?sort=lowest');
    expect((lowest.body.data as Json[]).map((r) => r.rating)).toEqual([1, 4, 5, 5]);

    const page2 = await getReviews(p.slug, '?pageSize=3&page=2');
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.meta).toMatchObject({ page: 2, pageSize: 3, total: 4, totalPages: 2 });
    expect((await getReviews(p.slug, '?page=9')).body.data).toEqual([]);

    for (const bad of ['?rating=6', '?rating=a', '?sort=x', '?pageSize=0', '?page=0']) {
      expect((await getReviews(p.slug, bad)).status, bad).toBe(400);
    }

    // Không lộ email/userId
    const text = JSON.stringify(all.body);
    for (const u of authors) {
      expect(text).not.toContain(u.id);
      expect(text).not.toContain(u.email);
    }
    expect(text).not.toContain('@example.test');
    expect(Object.keys(all.body.data[0]).sort()).toEqual(
      [
        'authorName',
        'content',
        'createdAt',
        'id',
        'rating',
        'reply',
        'repliedAt',
        'updatedAt',
        'verifiedPurchase',
      ].sort(),
    );
  });

  it('chưa có review: summary rỗng, ratingAvg=0', async () => {
    const p = await mkProduct('empty');
    const res = await getReviews(p.slug);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.summary).toEqual({
      ratingAvg: 0,
      ratingCount: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });

  it('authorName che đúng với tên một từ và nhiều từ', async () => {
    const p = await mkProduct('mask');
    const u1 = await mkRole('mask1', 'CUSTOMER');
    const u2 = await mkRole('mask2', 'CUSTOMER');
    await prisma.user.update({ where: { id: u1.id }, data: { fullName: 'Khang' } });
    await prisma.user.update({ where: { id: u2.id }, data: { fullName: 'Lê Thị Hoa Mai' } });
    for (const u of [u1, u2]) {
      await mkOrder(u, p);
      expect((await postReview(p.slug, u.who, { rating: 5 })).status).toBe(201);
    }
    const names = ((await getReviews(p.slug)).body.data as Json[]).map((r) => r.authorName).sort();
    expect(names).toEqual(['Khang', 'Mai L. T. H.']);
  });
});

describe('kiểm duyệt (admin)', () => {
  it('phân quyền: 401, 403 customer, 200 staff/admin', async () => {
    expect((await call('get', '/admin/reviews')).status).toBe(401);
    const c = await call('get', '/admin/reviews', alice.who);
    expect(c.status).toBe(403);
    expect(errOf(c).code).toBe('FORBIDDEN');
    expect((await call('get', '/admin/reviews?pageSize=1', staff.who)).status).toBe(200);
    expect((await call('get', '/admin/reviews?pageSize=1', admin.who)).status).toBe(200);
    expect((await call('patch', '/admin/reviews/x', alice.who, { status: 'HIDDEN' })).status).toBe(
      403,
    );
    expect((await call('put', '/admin/reviews/x/reply', alice.who, { reply: 'a' })).status).toBe(
      403,
    );
    expect((await call('delete', '/admin/reviews/x/reply', alice.who)).status).toBe(403);
  });

  it('ẩn/hiện: cập nhật denorm, ẩn khỏi public nhưng hiện ở /me, sửa khi ẩn giữ HIDDEN, audit', async () => {
    const p = await mkProduct('mod');
    const u1 = await mkRole('mod1', 'CUSTOMER');
    const u2 = await mkRole('mod2', 'CUSTOMER');
    await mkOrder(u1, p);
    await mkOrder(u2, p);
    const r1 = dataOf(await postReview(p.slug, u1.who, { rating: 5 })).id as string;
    const r2 = dataOf(await postReview(p.slug, u2.who, { rating: 2 })).id as string;
    expect(await productRating(p.id)).toEqual({ ratingAvg: 3.5, ratingCount: 2 });

    const hide = await call('patch', `/admin/reviews/${r2}`, staff.who, { status: 'HIDDEN' });
    expect(hide.status).toBe(200);
    expect(dataOf(hide)).toMatchObject({
      id: r2,
      status: 'HIDDEN',
      images: [],
      product: { id: p.id, slug: p.slug },
      author: { id: u2.id, email: u2.email, fullName: 'Nguyễn Văn An' },
      authorName: 'An N. V.',
    });
    expect(await productRating(p.id)).toEqual({ ratingAvg: 5, ratingCount: 1 });

    const pub = await getReviews(p.slug);
    expect((pub.body.data as Json[]).map((r) => r.id)).toEqual([r1]);
    expect(pub.body.meta.summary.ratingCount).toBe(1);
    expect(pub.body.meta.summary.distribution[2]).toBe(0);

    const me = dataOf(await call('get', `/products/${p.slug}/reviews/me`, u2.who));
    expect(me.review).toMatchObject({ id: r2, status: 'HIDDEN' });
    expect(me.reason).toBe('ALREADY_REVIEWED');

    // tác giả sửa review đang HIDDEN: giữ HIDDEN, không đổi denorm
    const edit = await call('patch', `/reviews/${r2}`, u2.who, { rating: 1 });
    expect(edit.status).toBe(200);
    expect(dataOf(edit)).toMatchObject({ rating: 1, status: 'HIDDEN' });
    expect(await productRating(p.id)).toEqual({ ratingAvg: 5, ratingCount: 1 });

    // ẩn lại khi đã ẩn: 200, không audit thêm
    const again = await call('patch', `/admin/reviews/${r2}`, staff.who, { status: 'HIDDEN' });
    expect(again.status).toBe(200);

    // hiện lại: tính theo rating mới (1)
    const show = await call('patch', `/admin/reviews/${r2}`, admin.who, { status: 'PUBLISHED' });
    expect(show.status).toBe(200);
    expect(dataOf(show).status).toBe('PUBLISHED');
    expect(await productRating(p.id)).toEqual({ ratingAvg: 3, ratingCount: 2 });

    const audits = await prisma.auditLog.findMany({
      where: { entity: 'Review', entityId: r2 },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((a) => a.action)).toEqual(['review.hide', 'review.show']);
    expect(audits[0]).toMatchObject({
      actorId: staff.id,
      diff: { status: ['PUBLISHED', 'HIDDEN'] },
    });
    expect(audits[1]).toMatchObject({
      actorId: admin.id,
      diff: { status: ['HIDDEN', 'PUBLISHED'] },
    });

    // validate + 404
    expect((await call('patch', `/admin/reviews/${r2}`, staff.who, { status: 'X' })).status).toBe(
      400,
    );
    expect(
      (await call('patch', '/admin/reviews/khongco', staff.who, { status: 'HIDDEN' })).status,
    ).toBe(404);
  });

  it('reply: đặt, ghi đè, xóa, idempotent; hiện ở public; audit không chứa nội dung', async () => {
    const p = await mkProduct('reply');
    const u = await mkRole('reply1', 'CUSTOMER');
    await mkOrder(u, p);
    const id = dataOf(await postReview(p.slug, u.who, { rating: 4, content: 'Ổn' })).id as string;

    const put = await call('put', `/admin/reviews/${id}/reply`, staff.who, {
      reply: '  Cảm ơn bạn!  ',
    });
    expect(put.status).toBe(200);
    expect(dataOf(put).reply).toBe('Cảm ơn bạn!');
    const firstAt = dataOf(put).repliedAt as string;
    expect(firstAt).toBeTruthy();

    const pub = (await getReviews(p.slug)).body.data[0];
    expect(pub).toMatchObject({ reply: 'Cảm ơn bạn!', repliedAt: firstAt });

    const over = await call('put', `/admin/reviews/${id}/reply`, admin.who, {
      reply: 'Xin lỗi bạn',
    });
    expect(dataOf(over).reply).toBe('Xin lỗi bạn');
    expect(new Date(dataOf(over).repliedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(firstAt).getTime(),
    );

    for (const body of [{}, { reply: '   ' }, { reply: 'a'.repeat(1001) }, { reply: 5 }]) {
      expect((await call('put', `/admin/reviews/${id}/reply`, staff.who, body)).status).toBe(400);
    }
    expect(
      (await call('put', '/admin/reviews/khongco/reply', staff.who, { reply: 'a' })).status,
    ).toBe(404);

    const del = await call('delete', `/admin/reviews/${id}/reply`, staff.who);
    expect(del.status).toBe(200);
    expect(dataOf(del)).toMatchObject({ reply: null, repliedAt: null });
    const del2 = await call('delete', `/admin/reviews/${id}/reply`, staff.who);
    expect(del2.status).toBe(200);
    expect(dataOf(del2).reply).toBeNull();
    expect((await call('delete', '/admin/reviews/khongco/reply', staff.who)).status).toBe(404);

    const audits = await prisma.auditLog.findMany({
      where: { entity: 'Review', entityId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((a) => a.action)).toEqual([
      'review.reply',
      'review.reply',
      'review.reply_delete',
    ]);
    const dump = JSON.stringify(audits.map((a) => a.diff));
    expect(dump).not.toContain('Cảm ơn');
    expect(dump).not.toContain('Ổn');
  });

  it('lọc: status, rating, productId, q (escape LIKE), hasReply, phân trang', async () => {
    const p = await mkProduct('filter');
    const users = [];
    const specs = [
      { rating: 5, content: 'Giảm 100% mệt mỏi' },
      { rating: 3, content: 'Bình thường_thôi' },
      { rating: 5, content: 'Rất THƠM' },
    ];
    const ids: string[] = [];
    for (const [i, s] of specs.entries()) {
      const u = await mkRole(`flt${i}`, 'CUSTOMER');
      users.push(u);
      await mkOrder(u, p);
      ids.push(dataOf(await postReview(p.slug, u.who, s)).id as string);
    }
    await call('patch', `/admin/reviews/${ids[1]!}`, staff.who, { status: 'HIDDEN' });
    await call('put', `/admin/reviews/${ids[2]!}/reply`, staff.who, { reply: 'Cảm ơn' });

    const list = async (qs: string) => {
      const res = await call('get', `/admin/reviews?productId=${p.id}${qs}`, staff.who);
      expect(res.status, qs).toBe(200);
      return res.body as { data: Json[]; meta: Json };
    };
    const idsOf = (b: { data: Json[] }) => b.data.map((r) => r.id as string).sort();

    expect((await list('')).meta.total).toBe(3);
    expect(idsOf(await list('&status=HIDDEN'))).toEqual([ids[1]!]);
    expect((await list('&status=PUBLISHED')).meta.total).toBe(2);
    expect((await list('&rating=5')).meta.total).toBe(2);
    expect(idsOf(await list('&rating=3'))).toEqual([ids[1]!]);
    expect(idsOf(await list('&q=thơm'))).toEqual([ids[2]!]); // không phân biệt hoa thường
    expect(idsOf(await list('&q=' + encodeURIComponent('%')))).toEqual([ids[0]!]);
    expect(idsOf(await list('&q=' + encodeURIComponent('_')))).toEqual([ids[1]!]);
    expect((await list('&q=' + encodeURIComponent('\\'))).meta.total).toBe(0);
    expect(idsOf(await list('&hasReply=true'))).toEqual([ids[2]!]);
    expect((await list('&hasReply=false')).meta.total).toBe(2);
    expect((await list('&status=HIDDEN&rating=5')).meta.total).toBe(0);

    const page = await list('&pageSize=2&page=2');
    expect(page.data).toHaveLength(1);
    expect(page.meta).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    // sắp createdAt DESC
    const full = (await list('')).data.map((r) => r.createdAt as string);
    expect([...full].sort().reverse()).toEqual(full);

    const item = (await list('&rating=3')).data[0]!;
    expect(item.author).toMatchObject({ id: users[1]!.id, email: users[1]!.email });
    expect(item.product).toMatchObject({ id: p.id, slug: p.slug });
    expect(item.images).toEqual([]);

    for (const bad of ['&status=X', '&rating=0', '&rating=6', '&hasReply=1', '&productId=A B']) {
      expect((await call('get', `/admin/reviews?${bad}`, staff.who)).status, bad).toBe(400);
    }
    expect((await call('get', '/admin/reviews?q=%00', staff.who)).status).toBe(400);
  });
});

describe('rate limit', () => {
  it('POST/PATCH đánh giá: 429 sau khi vượt hạn mức (store riêng)', async () => {
    const limited = createApp({ ...BIG, reviewRateLimit: 3 });
    const p = await mkProduct('rl');
    const u = await mkRole('rl1', 'CUSTOMER');
    const statuses: number[] = [];
    for (let i = 0; i < 2; i++) {
      statuses.push(
        (await call('post', `/products/${p.slug}/reviews`, u.who, { rating: 5 }, limited)).status,
      );
    }
    statuses.push((await call('patch', '/reviews/abc', u.who, { rating: 5 }, limited)).status);
    expect(statuses).toEqual([409, 409, 404]);
    const res = await call('post', `/products/${p.slug}/reviews`, u.who, { rating: 5 }, limited);
    expect(res.status).toBe(429);
    expect(errOf(res).code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeTruthy();
    // GET công khai không bị limiter ghi đánh giá chặn
    expect((await call('get', `/products/${p.slug}/reviews`, {}, undefined, limited)).status).toBe(
      200,
    );
  });
});
