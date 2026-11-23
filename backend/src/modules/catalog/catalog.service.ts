import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { roastAgeDays, roastStatusOfAge } from '../../lib/freshness.js';
import { effectivePrice, isOnSale, summarizePrices } from '../../lib/pricing.js';
import { prisma } from '../../lib/prisma.js';
import { rankRelated, type RelatedProfile } from '../../lib/related.js';
import { resolveSlugRedirect } from '../../lib/slugRedirect.js';
import { escapeLike, normalizeSearch, tokenize } from '../../lib/text.js';
import type { BoughtTogetherQuery, ProductListQuery, SuggestQuery } from './catalog.schema.js';

const MAX_VARIANT_QUANTITY = 20;
const RELATED_LIMIT = 8;
/** Số ứng viên tối đa lấy về (theo soldCount) để chấm điểm `related` trong bộ nhớ. */
const RELATED_CANDIDATE_LIMIT = 100;
/** Ngưỡng riêng tư (D-046): chỉ gợi ý "mua cùng" khi có ít nhất chừng này khách khác nhau. */
export const BOUGHT_TOGETHER_MIN_CUSTOMERS = 2;
/** Chỉ tính đơn trong chừng này ngày gần nhất. */
export const BOUGHT_TOGETHER_WINDOW_DAYS = 365;
const LIVE_PRODUCT = { status: 'ACTIVE', deletedAt: null } satisfies Prisma.ProductWhereInput;
const LIVE_VARIANT = { isActive: true, deletedAt: null } satisfies Prisma.ProductVariantWhereInput;

// ───────────── Categories & brands ─────────────

export async function listCategories() {
  const [roots, counts] = await Promise.all([
    prisma.category.findMany({
      where: { parentId: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        imageUrl: true,
        children: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, slug: true, imageUrl: true },
        },
      },
    }),
    prisma.product.groupBy({
      by: ['categoryId'],
      where: LIVE_PRODUCT,
      _count: { _all: true },
    }),
  ]);
  const countOf = new Map(counts.map((c) => [c.categoryId, c._count._all]));
  return roots.map((root) => {
    const children = root.children.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      imageUrl: c.imageUrl,
      productCount: countOf.get(c.id) ?? 0,
    }));
    return {
      id: root.id,
      name: root.name,
      slug: root.slug,
      imageUrl: root.imageUrl,
      // Cha = sản phẩm gắn trực tiếp + tổng các con đang hiển thị
      productCount: (countOf.get(root.id) ?? 0) + children.reduce((s, c) => s + c.productCount, 0),
      children,
    };
  });
}

export async function getCategoryBySlug(slug: string) {
  const c = await prisma.category.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      parent: { select: { name: true, slug: true } },
      children: {
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { name: true, slug: true },
      },
    },
  });
  if (!c) {
    const movedTo = await resolveSlugRedirect('CATEGORY', slug);
    if (movedTo) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy danh mục', { movedTo });
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy danh mục');
  }
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    imageUrl: c.imageUrl,
    parent: c.parent ? { name: c.parent.name, slug: c.parent.slug } : null,
    children: c.children.map((x) => ({ name: x.name, slug: x.slug })),
  };
}

export async function listBrands() {
  const [brands, counts] = await Promise.all([
    prisma.brand.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, slug: true, logoUrl: true },
    }),
    prisma.product.groupBy({ by: ['brandId'], where: LIVE_PRODUCT, _count: { _all: true } }),
  ]);
  const countOf = new Map(counts.map((c) => [c.brandId, c._count._all]));
  return brands.map((b) => ({ ...b, productCount: countOf.get(b.id) ?? 0 }));
}

// ───────────── Product list ─────────────

export const listItemSelect = {
  id: true,
  slug: true,
  name: true,
  shortDesc: true,
  isFeatured: true,
  inStock: true,
  updatedAt: true,
  ratingAvg: true,
  ratingCount: true,
  brand: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, slug: true } },
  images: {
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    take: 1,
    select: { url: true, alt: true },
  },
  // `stock` không được chọn: không bao giờ lộ ra public
  variants: {
    where: LIVE_VARIANT,
    select: { price: true, salePrice: true, saleStart: true, saleEnd: true },
  },
  coffee: { select: { originCountry: true, roastLevel: true, process: true } },
} satisfies Prisma.ProductSelect;

type ListItemRow = Prisma.ProductGetPayload<{ select: typeof listItemSelect }>;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function toListItem(row: ListItemRow, now: Date) {
  const { minPrice, compareAtPrice } = summarizePrices(row.variants, now);
  const image = row.images[0];
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDesc: row.shortDesc,
    brand: row.brand,
    category: row.category,
    primaryImage: image ? { url: image.url, alt: image.alt } : null,
    minPrice,
    compareAtPrice,
    inStock: row.inStock,
    isFeatured: row.isFeatured,
    updatedAt: row.updatedAt.toISOString(),
    ratingAvg: round1(row.ratingAvg),
    ratingCount: row.ratingCount,
    coffee: row.coffee,
  };
}

/** Category slug -> id danh mục cần lọc (cha gồm cả con đang active). null = không tồn tại/không active. */
async function resolveCategoryIds(slug: string): Promise<string[] | null> {
  const cat = await prisma.category.findFirst({
    where: { slug, isActive: true },
    select: { id: true, children: { where: { isActive: true }, select: { id: true } } },
  });
  return cat ? [cat.id, ...cat.children.map((c) => c.id)] : null;
}

function buildWhere(q: ProductListQuery, categoryIds: string[] | null): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];
  if (categoryIds) and.push({ categoryId: { in: categoryIds } });
  if (q.brand) and.push({ brand: { is: { slug: { in: q.brand } } } });
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    and.push({ minPrice: { gte: q.minPrice, lte: q.maxPrice } });
  }
  if (q.inStock) and.push({ inStock: true });
  if (q.featured) and.push({ isFeatured: true });
  if (q.origin) {
    and.push({
      coffee: {
        is: {
          OR: q.origin.map((o) => ({
            originCountry: { equals: escapeLike(o), mode: 'insensitive' as const },
          })),
        },
      },
    });
  }
  if (q.roast) and.push({ coffee: { is: { roastLevel: { in: q.roast } } } });
  if (q.process) and.push({ coffee: { is: { process: { in: q.process } } } });
  if (q.brew) and.push({ coffee: { is: { brewMethods: { hasSome: q.brew } } } });
  if (q.q !== undefined) {
    for (const token of tokenize(q.q)) and.push({ searchText: { contains: escapeLike(token) } });
  }
  return { ...LIVE_PRODUCT, AND: and };
}

function buildOrderBy(
  sort: Exclude<ProductListQuery['sort'], 'relevance'>,
): Prisma.ProductOrderByWithRelationInput[] {
  const tail: Prisma.ProductOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'asc' }];
  switch (sort) {
    case 'price_asc':
      return [{ minPrice: 'asc' }, ...tail];
    case 'price_desc':
      return [{ minPrice: 'desc' }, ...tail];
    case 'bestseller':
      return [{ soldCount: 'desc' }, ...tail];
    case 'rating':
      return [{ ratingAvg: 'desc' }, ...tail];
    case 'newest':
      return tail;
  }
}

function pageMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

export async function listProducts(query: ProductListQuery, now: Date = new Date()) {
  const { page, pageSize } = query;
  const skip = (page - 1) * pageSize;

  let categoryIds: string[] | null = null;
  if (query.category !== undefined) {
    categoryIds = await resolveCategoryIds(query.category);
    if (categoryIds === null) return { data: [], meta: pageMeta(page, pageSize, 0) };
  }
  const where = buildWhere(query, categoryIds);

  if (query.sort === 'relevance' && query.q !== undefined) {
    // Bước 1: Prisma lọc (mọi bộ lọc dùng chung một nguồn) -> danh sách id khớp, total = độ dài.
    const matched = await prisma.product.findMany({ where, select: { id: true } });
    const total = matched.length;
    if (skip >= total) return { data: [], meta: pageMeta(page, pageSize, total) };
    // Bước 2: xếp hạng bằng word_similarity. Mọi giá trị đi qua tham số (Prisma.sql), không nối chuỗi.
    const ids = matched.map((m) => m.id);
    const nq = normalizeSearch(query.q);
    const ranked = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "Product"
      WHERE "id" = ANY(${ids}::text[])
      ORDER BY word_similarity(${nq}::text, "searchText") DESC, "createdAt" DESC, "id" ASC
      LIMIT ${pageSize} OFFSET ${skip}`);
    const pageIds = ranked.map((r) => r.id);
    const rows = await prisma.product.findMany({
      where: { id: { in: pageIds } },
      select: listItemSelect,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const data = pageIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toListItem(row, now)] : [];
    });
    return { data, meta: pageMeta(page, pageSize, total) };
  }

  const sort = query.sort === 'relevance' ? 'newest' : query.sort;
  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: buildOrderBy(sort),
      skip,
      take: pageSize,
      select: listItemSelect,
    }),
  ]);
  return { data: rows.map((r) => toListItem(r, now)), meta: pageMeta(page, pageSize, total) };
}

// ───────────── Product detail ─────────────

const detailSelect = {
  id: true,
  slug: true,
  name: true,
  shortDesc: true,
  description: true,
  tags: true,
  seoTitle: true,
  seoDesc: true,
  ratingAvg: true,
  ratingCount: true,
  createdAt: true,
  categoryId: true,
  brand: { select: { id: true, name: true, slug: true } },
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
      parentId: true,
      parent: { select: { name: true, slug: true } },
    },
  },
  images: {
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    select: { id: true, url: true, alt: true, isPrimary: true },
  },
  variants: {
    where: LIVE_VARIANT,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      sku: true,
      name: true,
      attributes: true,
      price: true,
      salePrice: true,
      saleStart: true,
      saleEnd: true,
      stock: true,
      lowStockThreshold: true,
      weightGram: true,
      roastDate: true,
    },
  },
  coffee: {
    select: {
      originCountry: true,
      originRegion: true,
      variety: true,
      process: true,
      roastLevel: true,
      altitude: true,
      tastingNotes: true,
      brewMethods: true,
    },
  },
} satisfies Prisma.ProductSelect;

type VariantRow = Prisma.ProductGetPayload<{ select: typeof detailSelect }>['variants'][number];

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export function stockStatusOf(stock: number, lowStockThreshold: number): StockStatus {
  if (stock <= 0) return 'OUT_OF_STOCK';
  return stock <= lowStockThreshold ? 'LOW_STOCK' : 'IN_STOCK';
}

export function toVariant(v: VariantRow, now: Date) {
  const onSale = isOnSale(v, now);
  const roastAge = roastAgeDays(v.roastDate, now);
  const roastStatus = roastStatusOfAge(roastAge);
  const expired = roastStatus === 'EXPIRED';
  return {
    id: v.id,
    sku: v.sku,
    name: v.name,
    attributes: v.attributes,
    price: v.price,
    // Ẩn salePrice khi không còn hiệu lực để không lộ giá của đợt sale chưa bắt đầu
    salePrice: onSale ? v.salePrice : null,
    effectivePrice: effectivePrice(v, now),
    isOnSale: onSale,
    saleEndsAt: onSale && v.saleEnd ? v.saleEnd.toISOString() : null,
    stockStatus: stockStatusOf(v.stock, v.lowStockThreshold),
    // D-082: lô rang quá 90 ngày không mua được (maxQuantity 0, roastStatus EXPIRED).
    maxQuantity: expired ? 0 : Math.max(0, Math.min(v.stock, MAX_VARIANT_QUANTITY)),
    weightGram: v.weightGram,
    roastDate: v.roastDate ? v.roastDate.toISOString().slice(0, 10) : null,
    roastAgeDays: roastAge,
    roastStatus,
  };
}

const relatedSelect = {
  ...listItemSelect,
  categoryId: true,
  tags: true,
  soldCount: true,
  category: { select: { id: true, name: true, slug: true, parentId: true } },
  coffee: {
    select: { originCountry: true, roastLevel: true, process: true, brewMethods: true },
  },
} satisfies Prisma.ProductSelect;

type RelatedRow = Prisma.ProductGetPayload<{ select: typeof relatedSelect }>;
type DetailRow = Prisma.ProductGetPayload<{ select: typeof detailSelect }>;

/** Bỏ các trường chỉ dùng nội bộ (parentId, brewMethods...) để giữ nguyên shape ProductListItem. */
function toRelatedListItem(row: RelatedRow, now: Date) {
  const { id, name, slug } = row.category;
  const coffee = row.coffee
    ? {
        originCountry: row.coffee.originCountry,
        roastLevel: row.coffee.roastLevel,
        process: row.coffee.process,
      }
    : null;
  return toListItem({ ...row, category: { id, name, slug }, coffee }, now);
}

/** `related` (§4.4): ứng viên cùng danh mục/danh mục cha/brand/tag, chấm điểm trong bộ nhớ (D-046). */
async function findRelated(p: DetailRow, now: Date) {
  const or: Prisma.ProductWhereInput[] = [{ categoryId: p.categoryId }];
  if (p.category.parentId) or.push({ category: { is: { parentId: p.category.parentId } } });
  if (p.brand) or.push({ brandId: p.brand.id });
  if (p.tags.length > 0) or.push({ tags: { hasSome: p.tags } });

  const rows = await prisma.product.findMany({
    where: { ...LIVE_PRODUCT, id: { not: p.id }, OR: or },
    orderBy: [{ soldCount: 'desc' }, { id: 'asc' }],
    take: RELATED_CANDIDATE_LIMIT,
    select: relatedSelect,
  });

  const base: RelatedProfile = {
    id: p.id,
    categoryId: p.categoryId,
    parentCategoryId: p.category.parentId,
    brandId: p.brand?.id ?? null,
    tags: p.tags,
    inStock: true,
    soldCount: 0,
    minPrice: summarizePrices(p.variants, now).minPrice,
    coffee: p.coffee,
  };
  const profiles = rows.map((row) => ({
    row,
    id: row.id,
    categoryId: row.categoryId,
    parentCategoryId: row.category.parentId,
    brandId: row.brand?.id ?? null,
    tags: row.tags,
    inStock: row.inStock,
    soldCount: row.soldCount,
    minPrice: summarizePrices(row.variants, now).minPrice,
    coffee: row.coffee,
  }));
  return rankRelated(base, profiles, RELATED_LIMIT).map((x) => toRelatedListItem(x.row, now));
}

export async function getProductBySlug(slug: string, now: Date = new Date()) {
  const p = await prisma.product.findFirst({
    where: { slug, ...LIVE_PRODUCT },
    select: detailSelect,
  });
  if (!p) {
    const movedTo = await resolveSlugRedirect('PRODUCT', slug);
    if (movedTo) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm', { movedTo });
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm');
  }

  const related = await findRelated(p, now);

  const breadcrumbs = [
    ...(p.category.parent ? [{ name: p.category.parent.name, slug: p.category.parent.slug }] : []),
    { name: p.category.name, slug: p.category.slug },
  ];
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    shortDesc: p.shortDesc,
    description: p.description,
    tags: p.tags,
    brand: p.brand,
    category: { id: p.category.id, name: p.category.name, slug: p.category.slug },
    breadcrumbs,
    images: p.images,
    variants: p.variants.map((v) => toVariant(v, now)),
    minPrice: summarizePrices(p.variants, now).minPrice,
    inStock: p.variants.some((v) => v.stock > 0),
    coffee: p.coffee,
    ratingAvg: round1(p.ratingAvg),
    ratingCount: p.ratingCount,
    seo: { title: p.seoTitle ?? p.name, description: p.seoDesc ?? p.shortDesc },
    related,
    createdAt: p.createdAt.toISOString(),
  };
}

// ───────────── Search suggest ─────────────

const suggestSelect = {
  id: true,
  slug: true,
  name: true,
  images: {
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    take: 1,
    select: { url: true },
  },
  variants: {
    where: LIVE_VARIANT,
    select: { price: true, salePrice: true, saleStart: true, saleEnd: true },
  },
} satisfies Prisma.ProductSelect;

type SuggestRow = Prisma.ProductGetPayload<{ select: typeof suggestSelect }>;

export async function suggest(query: SuggestQuery, now: Date = new Date()) {
  const nq = normalizeSearch(query.q);
  const { limit } = query;
  const order: Prisma.ProductOrderByWithRelationInput[] = [
    { soldCount: 'desc' },
    { name: 'asc' },
    { id: 'asc' },
  ];

  // Ưu tiên khớp đầu: searchText bắt đầu bằng tên chuẩn hóa nên startsWith ≈ tên bắt đầu bằng query
  const prefix = await prisma.product.findMany({
    where: { ...LIVE_PRODUCT, searchText: { startsWith: escapeLike(nq) } },
    orderBy: order,
    take: limit,
    select: suggestSelect,
  });
  let rows: SuggestRow[] = prefix;
  if (prefix.length < limit) {
    const rest = await prisma.product.findMany({
      where: {
        ...LIVE_PRODUCT,
        searchText: { contains: escapeLike(nq) },
        id: { notIn: prefix.map((p) => p.id) },
      },
      orderBy: order,
      take: limit - prefix.length,
      select: suggestSelect,
    });
    rows = [...prefix, ...rest];
  }

  // Danh mục ít (vài chục) nên lọc trong bộ nhớ theo tên đã chuẩn hóa
  const cats = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { slug: true, name: true },
  });
  const matched = cats.filter((c) => normalizeSearch(c.name).includes(nq));
  const categories = [
    ...matched.filter((c) => normalizeSearch(c.name).startsWith(nq)),
    ...matched.filter((c) => !normalizeSearch(c.name).startsWith(nq)),
  ].slice(0, limit);

  return {
    products: rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      imageUrl: r.images[0]?.url ?? null,
      minPrice: summarizePrices(r.variants, now).minPrice,
    })),
    categories,
  };
}

// ───────────── Bought together ─────────────

/**
 * `GET /products/:slug/bought-together` (§4.6, D-046): sản phẩm LIVE còn hàng xuất hiện cùng đơn với
 * sản phẩm gốc, đếm theo số KHÁCH khác nhau (user: userId; guest: lower(contactEmail)), chỉ khi đạt
 * ngưỡng riêng tư. Slug không tồn tại/không LIVE -> 404.
 */
export async function getBoughtTogether(
  slug: string,
  query: BoughtTogetherQuery,
  now: Date = new Date(),
) {
  const base = await prisma.product.findFirst({
    where: { slug, ...LIVE_PRODUCT },
    select: { id: true },
  });
  if (!base) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm');

  const since = new Date(now.getTime() - BOUGHT_TOGETHER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  // Mọi giá trị đi qua tham số của tagged template (không nối chuỗi).
  const ranked = await prisma.$queryRaw<{ productId: string }[]>`
    SELECT oi2."productId" AS "productId"
    FROM "OrderItem" oi1
    JOIN "Order" o ON o."id" = oi1."orderId"
    JOIN "OrderItem" oi2 ON oi2."orderId" = o."id" AND oi2."productId" <> oi1."productId"
    JOIN "Product" p ON p."id" = oi2."productId"
    WHERE oi1."productId" = ${base.id}
      AND o."status" NOT IN ('CANCELLED', 'PENDING_PAYMENT')
      AND o."createdAt" >= ${since}
      AND p."status" = 'ACTIVE' AND p."deletedAt" IS NULL AND p."inStock" = true
    GROUP BY oi2."productId", p."soldCount"
    HAVING COUNT(DISTINCT COALESCE('u:' || o."userId", 'g:' || lower(o."contactEmail")))
      >= ${BOUGHT_TOGETHER_MIN_CUSTOMERS}::int
    ORDER BY COUNT(DISTINCT COALESCE('u:' || o."userId", 'g:' || lower(o."contactEmail"))) DESC,
      p."soldCount" DESC, oi2."productId" ASC
    LIMIT ${query.limit}::int`;
  if (ranked.length === 0) return [];

  const ids = ranked.map((r) => r.productId);
  const rows = await prisma.product.findMany({
    where: { ...LIVE_PRODUCT, id: { in: ids } },
    select: listItemSelect,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [toListItem(row, now)] : [];
  });
}

// ───────────── Compare ─────────────

const compareSelect = {
  ...listItemSelect,
  tags: true,
  variants: {
    where: LIVE_VARIANT,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: {
      name: true,
      attributes: true,
      price: true,
      salePrice: true,
      saleStart: true,
      saleEnd: true,
      stock: true,
      lowStockThreshold: true,
      weightGram: true,
    },
  },
  coffee: {
    select: {
      originCountry: true,
      originRegion: true,
      variety: true,
      process: true,
      roastLevel: true,
      altitude: true,
      tastingNotes: true,
      brewMethods: true,
    },
  },
} satisfies Prisma.ProductSelect;

/**
 * `GET /products/compare` (§4.7): một `findMany` cho tất cả slug. `items` theo thứ tự yêu cầu, chỉ
 * sản phẩm LIVE; slug không tồn tại/không LIVE vào `missing`. Không trả `description`, `stock`.
 */
export async function compareProducts(slugs: string[], now: Date = new Date()) {
  const rows = await prisma.product.findMany({
    where: { ...LIVE_PRODUCT, slug: { in: slugs } },
    select: compareSelect,
  });
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const items = [];
  const missing: string[] = [];
  for (const slug of slugs) {
    const row = bySlug.get(slug);
    if (!row) {
      missing.push(slug);
      continue;
    }
    const prices = row.variants.map((v) => effectivePrice(v, now));
    items.push({
      ...toListItem(row, now),
      tags: row.tags,
      priceRange: {
        min: prices.length > 0 ? Math.min(...prices) : 0,
        max: prices.length > 0 ? Math.max(...prices) : 0,
      },
      variants: row.variants.map((v) => ({
        name: v.name,
        attributes: v.attributes,
        price: v.price,
        effectivePrice: effectivePrice(v, now),
        isOnSale: isOnSale(v, now),
        stockStatus: stockStatusOf(v.stock, v.lowStockThreshold),
        weightGram: v.weightGram,
      })),
    });
  }
  return { items, missing };
}
