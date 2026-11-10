import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { effectivePrice, isOnSale, summarizePrices } from '../../lib/pricing.js';
import { prisma } from '../../lib/prisma.js';
import { escapeLike, normalizeSearch, tokenize } from '../../lib/text.js';
import type { ProductListQuery, SuggestQuery } from './catalog.schema.js';

const MAX_VARIANT_QUANTITY = 20;
const RELATED_LIMIT = 8;
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

const listItemSelect = {
  id: true,
  slug: true,
  name: true,
  shortDesc: true,
  isFeatured: true,
  inStock: true,
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
          OR: q.origin.map((o) => ({ originCountry: { equals: escapeLike(o), mode: 'insensitive' as const } })),
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
    select: { id: true, name: true, slug: true, parent: { select: { name: true, slug: true } } },
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
    maxQuantity: Math.max(0, Math.min(v.stock, MAX_VARIANT_QUANTITY)),
    weightGram: v.weightGram,
    roastDate: v.roastDate ? v.roastDate.toISOString().slice(0, 10) : null,
  };
}

export async function getProductBySlug(slug: string, now: Date = new Date()) {
  const p = await prisma.product.findFirst({
    where: { slug, ...LIVE_PRODUCT },
    select: detailSelect,
  });
  if (!p) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm');

  const relatedRows = await prisma.product.findMany({
    where: { ...LIVE_PRODUCT, categoryId: p.categoryId, id: { not: p.id } },
    orderBy: [{ soldCount: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    take: RELATED_LIMIT,
    select: listItemSelect,
  });

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
    related: relatedRows.map((r) => toListItem(r, now)),
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
