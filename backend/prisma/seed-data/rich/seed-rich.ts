/*
 * Ghi seed nhiều vào DB (D-084). CỘNG THÊM lên seed cơ bản, idempotent, không xóa dữ liệu nào.
 * - Danh mục con/thương hiệu/sản phẩm/mã giảm giá: upsert theo slug/SKU/code.
 * - Khách, địa chỉ, đơn, dòng hàng, lịch sử, payment, đánh giá, liên hệ, ghi chú, wishlist: id cố định tiền tố `rich`
 *   + createMany(skipDuplicates), nên chạy lại không nhân bản.
 * Kế hoạch dữ liệu (thuần, tất định) nằm ở plan.ts.
 */
import type { Prisma, PrismaClient } from '../../../src/generated/prisma/client.js';
import { refreshProductDenorm } from '../../../src/modules/catalog/catalog.denorm.js';
import { loadLocations } from '../../../src/modules/locations/locations.data.js';
import { rootCategorySlug } from '../catalog.js';
import { seedOne } from '../seed-products.js';
import { RICH_BRANDS, RICH_CATEGORIES } from './catalog.js';
import { buildRichCoupons } from './coupons.js';
import {
  buildLocationPool,
  planContacts,
  planCustomers,
  planOrderNotes,
  planOrders,
  planReviews,
  planWishlists,
  reviewGroupOf,
  type PlanCoupon,
  type PlanVariant,
} from './plan.js';
import { buildRichProducts, RICH_PRODUCT_COUNT } from './products.js';
import type { ReviewGroup } from './pools.js';

export const RICH_COUNTS = {
  products: RICH_PRODUCT_COUNT,
  customers: 150,
  guests: 25,
  orders: 300,
  days: 120,
  contacts: 40,
} as const;

export interface RichSeedOptions {
  now?: Date;
  /** Băm argon2id của SEED_CUSTOMER_PASSWORD (băm 1 lần, dùng chung cho mọi khách rich). */
  passwordHash: string;
}

export interface RichSeedSummary {
  products: number;
  categories: number;
  brands: number;
  coupons: number;
  customers: number;
  addresses: number;
  wishlist: number;
  orders: number;
  orderItems: number;
  statusHistory: number;
  payments: number;
  redemptions: number;
  orderNotes: number;
  reviews: number;
  contacts: number;
  /** Tổng số bản ghi MỚI được tạo trong lần chạy này (0 khi chạy lại). */
  inserted: number;
}

const CHUNK = 1000;

async function chunked<T>(
  rows: readonly T[],
  write: (part: T[]) => Promise<{ count: number }>,
): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i += CHUNK) n += (await write(rows.slice(i, i + CHUNK))).count;
  return n;
}

async function seedCategoriesAndBrands(prisma: PrismaClient): Promise<void> {
  const parents = await prisma.category.findMany({ select: { id: true, slug: true } });
  const parentId = new Map(parents.map((c) => [c.slug, c.id]));
  const order = new Map<string, number>();
  for (const c of RICH_CATEGORIES) {
    const pid = parentId.get(c.parentSlug);
    if (!pid)
      throw new Error(`Thiếu danh mục gốc ${c.parentSlug}: hãy chạy npm run prisma:seed trước.`);
    // Các con rich xếp sau con của seed cơ bản.
    const sortOrder = 10 + (order.get(c.parentSlug) ?? 0);
    order.set(c.parentSlug, (order.get(c.parentSlug) ?? 0) + 1);
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, parentId: pid, sortOrder },
      create: { slug: c.slug, name: c.name, parentId: pid, sortOrder },
    });
  }
  for (const b of RICH_BRANDS) {
    await prisma.brand.upsert({ where: { slug: b.slug }, update: { name: b.name }, create: b });
  }
}

/** Danh mục gốc của slug (gốc, con của seed cơ bản hoặc con của seed nhiều). */
function richRootOf(slug: string): string | undefined {
  return rootCategorySlug(slug) ?? RICH_CATEGORIES.find((c) => c.slug === slug)?.parentSlug;
}

async function seedProductsRich(prisma: PrismaClient, now: Date): Promise<void> {
  const [categories, brands] = await Promise.all([
    prisma.category.findMany({ select: { id: true, slug: true } }),
    prisma.brand.findMany({ select: { id: true, slug: true } }),
  ]);
  const categoryIds = new Map(categories.map((c) => [c.slug, c.id]));
  const brandIds = new Map(brands.map((b) => [b.slug, b.id]));
  for (const [i, p] of buildRichProducts().entries()) {
    // Chỉ số lớn hơn seed cơ bản (41 sản phẩm) nên sản phẩm rich "cũ hơn" trong sắp xếp mới nhất.
    await seedOne(prisma, p, 60 + i * 2, now, categoryIds, brandIds, richRootOf);
  }
}

async function seedCouponsRich(prisma: PrismaClient, now: Date): Promise<number> {
  const coupons = buildRichCoupons(now);
  for (const c of coupons) {
    const { code, ...rest } = c;
    // Không đặt lại usedCount của mã không giới hạn lượt (tính lại theo CouponRedemption ở cuối).
    const { usedCount, ...withoutUsed } = rest;
    await prisma.coupon.upsert({
      where: { code },
      update: c.usageLimit == null ? withoutUsed : rest,
      create: { code, ...rest, usedCount: c.usageLimit == null ? 0 : usedCount },
    });
  }
  return coupons.length;
}

export async function seedRich(
  prisma: PrismaClient,
  opts: RichSeedOptions,
): Promise<RichSeedSummary> {
  const now = opts.now ?? new Date();

  const staff = await prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN'] } },
    select: { id: true },
    orderBy: { email: 'asc' },
  });
  if (staff.length === 0)
    throw new Error('Thiếu tài khoản STAFF/ADMIN: hãy chạy npm run prisma:seed trước.');
  const staffIds = staff.map((s) => s.id);

  await seedCategoriesAndBrands(prisma);
  await seedProductsRich(prisma, now);
  const couponCount = await seedCouponsRich(prisma, now);

  // Biến thể đang bán (gồm cả seed cơ bản), sắp theo SKU để kế hoạch tất định.
  const rows = await prisma.productVariant.findMany({
    where: { isActive: true, deletedAt: null, product: { status: 'ACTIVE', deletedAt: null } },
    orderBy: { sku: 'asc' },
    select: {
      id: true,
      sku: true,
      name: true,
      weightGram: true,
      price: true,
      avgCost: true,
      product: {
        select: {
          id: true,
          name: true,
          categoryId: true,
          category: { select: { parentId: true, slug: true, parent: { select: { slug: true } } } },
          images: {
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            take: 1,
            select: { url: true },
          },
        },
      },
    },
  });
  const variants: PlanVariant[] = rows.map((v) => ({
    variantId: v.id,
    productId: v.product.id,
    categoryId: v.product.categoryId,
    parentCategoryId: v.product.category.parentId,
    productName: v.product.name,
    variantName: v.name,
    sku: v.sku,
    imageUrl: v.product.images[0]?.url ?? null,
    weightGram: v.weightGram,
    price: v.price,
    avgCost: v.avgCost,
  }));
  const groupOfProduct = new Map<string, ReviewGroup>(
    rows.map((v) => [
      v.product.id,
      reviewGroupOf(v.product.category.parent?.slug ?? v.product.category.slug),
    ]),
  );

  // Mã giảm giá dùng được cho đơn lịch sử: đang bật, không giới hạn lượt (đánh giá lại theo thời điểm tạo đơn).
  const couponRows = await prisma.coupon.findMany({
    where: { isActive: true, usageLimit: null },
    orderBy: { code: 'asc' },
  });
  const coupons: PlanCoupon[] = couponRows.map((c) => ({
    id: c.id,
    code: c.code,
    type: c.type,
    value: c.value,
    maxDiscount: c.maxDiscount,
    minOrder: c.minOrder,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    usageLimit: c.usageLimit,
    perUserLimit: c.perUserLimit,
    usedCount: c.usedCount,
    scope: c.scope,
    isActive: c.isActive,
  }));

  const pool = buildLocationPool(loadLocations().provinces);
  const customers = planCustomers(RICH_COUNTS.customers, pool);
  const existingCodes = new Set(
    (await prisma.order.findMany({ select: { code: true } })).map((o) => o.code),
  );
  const orders = planOrders({
    now,
    count: RICH_COUNTS.orders,
    days: RICH_COUNTS.days,
    customers,
    guestCount: RICH_COUNTS.guests,
    variants,
    coupons,
    staffIds,
    pool,
    usedCodes: existingCodes,
  });
  const reviews = planReviews(orders, groupOfProduct, now);
  const notes = planOrderNotes(orders, staffIds, now);
  const contacts = planContacts(RICH_COUNTS.contacts, customers, staffIds, now);
  const richProductIds = new Set(
    (
      await prisma.product.findMany({
        where: { slug: { in: buildRichProducts().map((p) => p.slug) } },
        select: { id: true },
      })
    ).map((p) => p.id),
  );
  const wishlist = planWishlists(customers, [...richProductIds].sort(), now);

  // ── Khách: createdAt không muộn hơn đơn đầu tiên của họ ──
  const firstOrderAt = new Map<string, Date>();
  for (const o of orders) {
    if (!o.userId) continue;
    const cur = firstOrderAt.get(o.userId);
    if (!cur || o.createdAt < cur) firstOrderAt.set(o.userId, o.createdAt);
  }
  const DAY = 24 * 60 * 60 * 1000;
  let inserted = 0;
  const userRows: Prisma.UserCreateManyInput[] = customers.map((c) => {
    const spread = new Date(
      now.getTime() - (((RICH_COUNTS.days + 30) * ((c.index * 37) % 100)) / 100) * DAY,
    );
    const first = firstOrderAt.get(c.id);
    const createdAt =
      first && first.getTime() - 30 * 60 * 1000 < spread.getTime()
        ? new Date(first.getTime() - 30 * 60 * 1000)
        : spread;
    return {
      id: c.id,
      email: c.email,
      passwordHash: opts.passwordHash,
      fullName: c.fullName,
      phone: c.phone,
      role: 'CUSTOMER',
      status: 'ACTIVE',
      emailVerifiedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    };
  });
  const customersInserted = await chunked(userRows, (data) =>
    prisma.user.createMany({ data, skipDuplicates: true }),
  );
  inserted += customersInserted;

  const addressRows: Prisma.AddressCreateManyInput[] = customers.flatMap((c) =>
    c.addresses.map((a) => ({
      id: a.id,
      userId: c.id,
      fullName: a.fullName,
      phone: a.phone,
      line1: a.line1,
      isDefault: a.isDefault,
      ...a.location,
    })),
  );
  const addressesInserted = await chunked(addressRows, (data) =>
    prisma.address.createMany({ data, skipDuplicates: true }),
  );
  inserted += addressesInserted;

  const wishInserted = await chunked(wishlist, (data) =>
    prisma.wishlist.createMany({ data, skipDuplicates: true }),
  );
  inserted += wishInserted;

  // ── Đơn: chỉ ghi đơn chưa có (theo id cố định); bản ghi con đi theo đơn mới ──
  const existingOrderIds = new Set(
    (
      await prisma.order.findMany({ where: { id: { startsWith: 'richo' } }, select: { id: true } })
    ).map((o) => o.id),
  );
  const fresh = orders.filter((o) => !existingOrderIds.has(o.id));
  const orderData: Prisma.OrderCreateManyInput[] = fresh.map((o) => ({
    id: o.id,
    code: o.code,
    userId: o.userId,
    contactEmail: o.contactEmail,
    contactPhone: o.contactPhone,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    shippingMethod: o.shippingMethod,
    shippingAddress: o.shippingAddress as unknown as Prisma.InputJsonObject,
    totalWeightGram: o.totalWeightGram,
    subtotal: o.subtotal,
    discountTotal: o.discountTotal,
    shippingFee: o.shippingFee,
    shippingDiscount: o.shippingDiscount,
    grandTotal: o.grandTotal,
    couponId: o.couponId,
    couponCode: o.couponCode,
    trackingNumber: o.trackingNumber,
    carrier: o.carrier,
    cancelReason: o.cancelReason,
    etaFrom: o.etaFrom,
    etaTo: o.etaTo,
    expiresAt: o.expiresAt,
    paidAt: o.paidAt,
    confirmedAt: o.confirmedAt,
    deliveredAt: o.deliveredAt,
    cancelledAt: o.cancelledAt,
    idempotencyKey: o.idempotencyKey,
    requestFingerprint: o.requestFingerprint,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  }));
  const ordersInserted = await chunked(orderData, (data) =>
    prisma.order.createMany({ data, skipDuplicates: true }),
  );
  inserted += ordersInserted;
  // Chỉ gắn bản ghi con cho đơn thật sự có trong DB (phòng trường hợp đụng mã đơn bị skipDuplicates bỏ qua).
  const present = new Set(
    (
      await prisma.order.findMany({
        where: { id: { in: fresh.map((o) => o.id) } },
        select: { id: true },
      })
    ).map((o) => o.id),
  );
  const freshOk = fresh.filter((o) => present.has(o.id));

  const itemsInserted = await chunked(
    freshOk.flatMap((o) =>
      o.lines.map((l): Prisma.OrderItemCreateManyInput => ({
        id: l.id,
        orderId: o.id,
        productId: l.productId,
        variantId: l.variantId,
        productName: l.productName,
        variantName: l.variantName,
        sku: l.sku,
        imageUrl: l.imageUrl,
        weightGram: l.weightGram,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        lineTotal: l.lineTotal,
        unitCost: l.unitCost,
      })),
    ),
    (data) => prisma.orderItem.createMany({ data, skipDuplicates: true }),
  );
  inserted += itemsInserted;

  const historyInserted = await chunked(
    freshOk.flatMap((o) =>
      o.history.map((h): Prisma.OrderStatusHistoryCreateManyInput => ({
        id: h.id,
        orderId: o.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        note: h.note,
        actorId: h.actorId,
        createdAt: h.createdAt,
      })),
    ),
    (data) => prisma.orderStatusHistory.createMany({ data, skipDuplicates: true }),
  );
  inserted += historyInserted;

  const paymentsInserted = await chunked(
    freshOk.flatMap((o) =>
      o.payment
        ? [
            {
              id: o.payment.id,
              orderId: o.id,
              provider: o.payment.provider,
              providerTxnId: o.payment.providerTxnId,
              providerRef: o.payment.providerRef,
              amount: o.payment.amount,
              status: o.payment.status,
              refundedAt: o.payment.refundedAt,
              refundNote: o.payment.refundNote,
              refundedById: o.payment.refundedById,
              createdAt: o.payment.createdAt,
              updatedAt: o.payment.updatedAt,
            } satisfies Prisma.PaymentCreateManyInput,
          ]
        : [],
    ),
    (data) => prisma.payment.createMany({ data, skipDuplicates: true }),
  );
  inserted += paymentsInserted;

  const redemptionsInserted = await chunked(
    freshOk.flatMap((o) =>
      o.redemption && o.couponId
        ? [
            {
              id: o.redemption.id,
              couponId: o.couponId,
              orderId: o.id,
              userId: o.userId,
              email: o.contactEmail,
              releasedAt: o.redemption.releasedAt,
              createdAt: o.redemption.createdAt,
            } satisfies Prisma.CouponRedemptionCreateManyInput,
          ]
        : [],
    ),
    (data) => prisma.couponRedemption.createMany({ data, skipDuplicates: true }),
  );
  inserted += redemptionsInserted;

  // Ghi chú và đánh giá phụ thuộc thời điểm chạy (đơn đã giao chưa, đã qua bao lâu), nên chỉ gắn cho đơn MỚI
  // của lần chạy này; chạy lại không thêm gì. Ngoại lệ: nếu chưa có bản ghi nào (lần chạy trước dừng giữa chừng)
  // thì bù cho mọi đơn, vẫn qua kiểm tra hợp lệ với trạng thái thật trong DB.
  const freshIds = new Set(freshOk.map((o) => o.id));
  const noNotesYet =
    (await prisma.orderNote.count({ where: { id: { startsWith: 'richn' } } })) === 0;
  const notesInserted = await chunked(
    notes.filter((n) => freshIds.has(n.orderId) || (noNotesYet && existingOrderIds.has(n.orderId))),
    (data) => prisma.orderNote.createMany({ data, skipDuplicates: true }),
  );
  inserted += notesInserted;

  const noReviewsYet =
    (await prisma.review.count({ where: { id: { startsWith: 'richr' } } })) === 0;
  const delivered = new Map(
    (
      await prisma.orderItem.findMany({
        where: { id: { startsWith: 'richi' }, order: { status: 'DELIVERED' } },
        select: {
          id: true,
          productId: true,
          order: { select: { userId: true, deliveredAt: true } },
        },
      })
    ).map((i) => [i.id, i] as const),
  );
  const freshItemIds = new Set(freshOk.flatMap((o) => o.lines.map((l) => l.id)));
  const reviewsInserted = await chunked(
    reviews.filter((r) => {
      if (!freshItemIds.has(r.orderItemId) && !noReviewsYet) return false;
      const item = delivered.get(r.orderItemId); // đánh giá chỉ cho đơn DELIVERED thật trong DB
      const at = item?.order.deliveredAt;
      return (
        item != null &&
        item.order.userId === r.userId &&
        item.productId === r.productId &&
        at != null &&
        at.getTime() < r.createdAt.getTime()
      );
    }),
    (data) => prisma.review.createMany({ data, skipDuplicates: true }),
  );
  inserted += reviewsInserted;

  const contactsInserted = await chunked(
    contacts.map((c): Prisma.ContactMessageCreateManyInput => ({
      id: c.id,
      userId: c.userId,
      name: c.name,
      email: c.email,
      phone: c.phone,
      subject: c.subject,
      message: c.message,
      status: c.status,
      adminNote: c.adminNote,
      handledById: c.handledById,
      handledAt: c.handledAt,
      createdAt: c.createdAt,
      updatedAt: c.handledAt ?? c.createdAt,
    })),
    (data) => prisma.contactMessage.createMany({ data, skipDuplicates: true }),
  );
  inserted += contactsInserted;

  await recomputeDenorm(prisma, now, [...richProductIds]);

  const like = { startsWith: 'rich' };
  const [
    orderCount,
    itemCount,
    histCount,
    payCount,
    redCount,
    noteCount,
    reviewCount,
    contactCount,
    custCount,
    addrCount,
    wishCount,
    prodCount,
  ] = await Promise.all([
    prisma.order.count({ where: { id: { startsWith: 'richo' } } }),
    prisma.orderItem.count({ where: { id: { startsWith: 'richi' } } }),
    prisma.orderStatusHistory.count({ where: { id: { startsWith: 'richh' } } }),
    prisma.payment.count({ where: { id: { startsWith: 'richp' } } }),
    prisma.couponRedemption.count({ where: { id: { startsWith: 'richcr' } } }),
    prisma.orderNote.count({ where: { id: { startsWith: 'richn' } } }),
    prisma.review.count({ where: { id: { startsWith: 'richr' } } }),
    prisma.contactMessage.count({ where: { id: { startsWith: 'richcm' } } }),
    prisma.user.count({ where: { id: like } }),
    prisma.address.count({ where: { id: { startsWith: 'richad' } } }),
    prisma.wishlist.count({ where: { userId: like } }),
    prisma.product.count({ where: { id: { in: [...richProductIds] } } }),
  ]);

  return {
    products: prodCount,
    categories: RICH_CATEGORIES.length,
    brands: RICH_BRANDS.length,
    coupons: couponCount,
    customers: custCount,
    addresses: addrCount,
    wishlist: wishCount,
    orders: orderCount,
    orderItems: itemCount,
    statusHistory: histCount,
    payments: payCount,
    redemptions: redCount,
    orderNotes: noteCount,
    reviews: reviewCount,
    contacts: contactCount,
    inserted,
  };
}

/**
 * Cập nhật các cột denormalize sau khi thêm đơn/đánh giá:
 * - denorm giá/tồn/tìm kiếm: `refreshProductDenorm` (hàm có sẵn của catalog) cho sản phẩm rich;
 * - ratingAvg/ratingCount: cùng công thức `recomputeRating` (trung bình + đếm đánh giá PUBLISHED); không import trực
 *   tiếp vì reviews.shared kéo theo prisma singleton cần cấu hình môi trường của server;
 * - soldCount của sản phẩm rich = số bán mẫu + tổng số lượng ở đơn DELIVERED của seed nhiều (khớp admin/orders).
 */
async function recomputeDenorm(
  prisma: PrismaClient,
  now: Date,
  richProductIds: string[],
): Promise<void> {
  const reviewed = await prisma.review.groupBy({
    by: ['productId'],
    where: { id: { startsWith: 'richr' } },
  });
  const targets = [...new Set([...richProductIds, ...reviewed.map((r) => r.productId)])];
  const delivered = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: { id: { startsWith: 'richi' }, order: { status: 'DELIVERED' } },
    _sum: { quantity: true },
  });
  const deliveredQty = new Map(delivered.map((d) => [d.productId, d._sum.quantity ?? 0]));
  const richSet = new Set(richProductIds);
  const baseline = new Map(buildRichProducts().map((p) => [p.slug, p.stats[0]]));
  const slugOf = new Map(
    (
      await prisma.product.findMany({
        where: { id: { in: richProductIds } },
        select: { id: true, slug: true },
      })
    ).map((p) => [p.id, p.slug]),
  );

  await prisma.$transaction(
    async (tx) => {
      for (const productId of targets) {
        const agg = await tx.review.aggregate({
          where: { productId, status: 'PUBLISHED' },
          _avg: { rating: true },
          _count: { _all: true },
        });
        const data: Prisma.ProductUpdateInput = {
          ratingAvg: agg._avg.rating ?? 0,
          ratingCount: agg._count._all,
        };
        if (richSet.has(productId)) {
          data.soldCount =
            (baseline.get(slugOf.get(productId) ?? '') ?? 0) + (deliveredQty.get(productId) ?? 0);
        }
        await tx.product.update({ where: { id: productId }, data });
        await refreshProductDenorm(tx, productId, now);
      }
      // Mã giảm giá không giới hạn lượt: usedCount không bao giờ thấp hơn số lượt chưa hoàn của đơn rich.
      const used = await tx.couponRedemption.groupBy({
        by: ['couponId'],
        where: { id: { startsWith: 'richcr' }, releasedAt: null },
        _count: { _all: true },
      });
      for (const u of used) {
        await tx.coupon.updateMany({
          where: { id: u.couponId, usageLimit: null, usedCount: { lt: u._count._all } },
          data: { usedCount: u._count._all },
        });
      }
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
}
