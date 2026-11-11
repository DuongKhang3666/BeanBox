import { Prisma } from '@prisma/client';
import { diffFields, writeAudit, type AuditDiff } from '../../../lib/audit.js';
import { AppError } from '../../../lib/errors.js';
import { prisma } from '../../../lib/prisma.js';
import { slugify, SLUG_REGEX } from '../../../lib/slug.js';
import { escapeLike, normalizeSearch } from '../../../lib/text.js';
import { refreshProductDenorm } from '../../catalog/catalog.denorm.js';
import {
  productDetailInclude,
  productListSelect,
  toAdminCoffee,
  toAdminProduct,
  toProductListItem,
  type AdminProductDto,
  type AdminProductListItem,
} from './products.dto.js';
import type {
  CoffeeInput,
  CreateProductInput,
  ProductListQuery,
  UpdateProductInput,
} from './products.schema.js';
import {
  ACTIVE_NEEDS_VARIANT_MSG,
  checkId,
  fieldError,
  lockLiveProduct,
  productNotFound,
  TX_OPTIONS,
  type Actor,
} from './products.shared.js';

interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const DESC_MARK = '(đã sửa)';

function resolveSlug(name: string, given: string | undefined): string {
  const slug = given ?? slugify(name);
  if (slug.length < 2 || !SLUG_REGEX.test(slug)) {
    throw fieldError('slug', 'Không thể tạo slug từ tên này, vui lòng nhập slug');
  }
  return slug;
}

/** Slug trùng chỉ bắt chắc chắn qua unique index (race giữa hai request). */
function mapUniqueViolation(e: unknown): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return new AppError(409, 'SLUG_TAKEN', 'Slug đã tồn tại', { field: 'slug' });
  }
  return e;
}

/** FK category/brand bị xóa xen giữa kiểm tra và ghi. */
function mapForeignKey(e: unknown): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
    return fieldError('categoryId', 'Danh mục hoặc thương hiệu không tồn tại');
  }
  return e;
}

async function assertRefs(
  tx: Prisma.TransactionClient,
  categoryId: string | undefined,
  brandId: string | null | undefined,
): Promise<void> {
  if (categoryId !== undefined) {
    const c = await tx.category.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!c) throw fieldError('categoryId', 'Danh mục không tồn tại');
  }
  if (brandId) {
    const b = await tx.brand.findUnique({ where: { id: brandId }, select: { id: true } });
    if (!b) throw fieldError('brandId', 'Thương hiệu không tồn tại');
  }
}

/** Cột ghi cho CoffeeProfile; chỉ trường được gửi (undefined = giữ nguyên khi cập nhật). */
function coffeeUpdateData(c: CoffeeInput): Prisma.CoffeeProfileUncheckedUpdateInput {
  const data: Prisma.CoffeeProfileUncheckedUpdateInput = {};
  if (c.originCountry !== undefined) data.originCountry = c.originCountry;
  if (c.originRegion !== undefined) data.originRegion = c.originRegion;
  if (c.variety !== undefined) data.variety = c.variety;
  if (c.process !== undefined) data.process = c.process;
  if (c.roastLevel !== undefined) data.roastLevel = c.roastLevel;
  if (c.altitude !== undefined) data.altitude = c.altitude;
  if (c.tastingNotes !== undefined) data.tastingNotes = c.tastingNotes;
  if (c.brewMethods !== undefined) data.brewMethods = c.brewMethods;
  return data;
}

function coffeeCreateData(
  productId: string,
  c: CoffeeInput,
): Prisma.CoffeeProfileUncheckedCreateInput {
  return {
    productId,
    originCountry: c.originCountry ?? null,
    originRegion: c.originRegion ?? null,
    variety: c.variety ?? null,
    process: c.process ?? null,
    roastLevel: c.roastLevel ?? null,
    altitude: c.altitude ?? null,
    tastingNotes: c.tastingNotes ?? [],
    brewMethods: c.brewMethods ?? [],
  };
}

const PRODUCT_AUDIT_KEYS = [
  'name',
  'slug',
  'status',
  'categoryId',
  'brandId',
  'isFeatured',
  'shortDesc',
  'tags',
  'seoTitle',
  'seoDesc',
  'coffee',
] as const;

type DetailRow = Prisma.ProductGetPayload<{ include: typeof productDetailInclude }>;

async function loadDetail(tx: Prisma.TransactionClient, id: string): Promise<DetailRow> {
  return tx.product.findUniqueOrThrow({ where: { id }, include: productDetailInclude });
}

/** Ảnh chụp các trường được audit (coffee thành object gọn để so sánh). */
const snapshot = (p: DetailRow) => ({ ...p, coffee: toAdminCoffee(p.coffee) });

// ---------------------------------------------------------------------------
// Đọc

function buildWhere(q: ProductListQuery): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];
  if (q.q) {
    const norm = normalizeSearch(q.q);
    const or: Prisma.ProductWhereInput[] = [
      { slug: { contains: escapeLike(q.q.toLowerCase()), mode: 'insensitive' } },
    ];
    if (norm) or.push({ searchText: { contains: escapeLike(norm) } });
    and.push({ OR: or });
  }
  return {
    deletedAt: q.deleted ? { not: null } : null,
    ...(q.status ? { status: { in: q.status } } : {}),
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.brandId ? { brandId: q.brandId } : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

function buildOrderBy(sort: ProductListQuery['sort']): Prisma.ProductOrderByWithRelationInput[] {
  if (sort === 'name') return [{ name: 'asc' }, { id: 'asc' }];
  if (sort === 'updated') return [{ updatedAt: 'desc' }, { id: 'desc' }];
  return [{ createdAt: 'desc' }, { id: 'desc' }];
}

export async function listProducts(
  q: ProductListQuery,
): Promise<{ data: AdminProductListItem[]; meta: ListMeta }> {
  const where = buildWhere(q);
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: buildOrderBy(q.sort),
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: productListSelect,
    }),
  ]);
  return {
    data: rows.map(toProductListItem),
    meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) },
  };
}

export async function getProduct(id: string): Promise<AdminProductDto> {
  checkId(id, productNotFound);
  const row = await prisma.product.findUnique({ where: { id }, include: productDetailInclude });
  if (!row) throw productNotFound();
  return toAdminProduct(row);
}

// ---------------------------------------------------------------------------
// Ghi

export async function createProduct(
  input: CreateProductInput,
  { actorId, ip }: Actor,
): Promise<AdminProductDto> {
  const slug = resolveSlug(input.name, input.slug);
  // Mới tạo chưa có biến thể nên ACTIVE luôn vi phạm quy tắc hiển thị.
  if (input.status === 'ACTIVE') throw fieldError('status', ACTIVE_NEEDS_VARIANT_MSG);
  try {
    return await prisma.$transaction(async (tx) => {
      await assertRefs(tx, input.categoryId, input.brandId);
      const created = await tx.product.create({
        data: {
          categoryId: input.categoryId,
          brandId: input.brandId,
          name: input.name,
          slug,
          shortDesc: input.shortDesc,
          description: input.description,
          status: input.status,
          isFeatured: input.isFeatured,
          tags: input.tags,
          seoTitle: input.seoTitle,
          seoDesc: input.seoDesc,
        },
        select: { id: true },
      });
      if (input.coffee) {
        await tx.coffeeProfile.create({ data: coffeeCreateData(created.id, input.coffee) });
      }
      await refreshProductDenorm(tx, created.id);
      const full = await loadDetail(tx, created.id);

      const nulls = Object.fromEntries(PRODUCT_AUDIT_KEYS.map((k) => [k, null]));
      const diff: AuditDiff = diffFields(nulls, snapshot(full), PRODUCT_AUDIT_KEYS) ?? {};
      if (full.description.length > 0)
        diff.description = [null, `(${full.description.length} ký tự)`];
      await writeAudit(tx, {
        actorId,
        action: 'product.create',
        entity: 'Product',
        entityId: full.id,
        diff,
        ip,
      });
      return toAdminProduct(full);
    }, TX_OPTIONS);
  } catch (e) {
    throw mapForeignKey(mapUniqueViolation(e));
  }
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
  { actorId, ip }: Actor,
): Promise<AdminProductDto> {
  checkId(id, productNotFound);
  try {
    return await prisma.$transaction(async (tx) => {
      // Khóa Product (tuần tự hóa với thao tác biến thể/ảnh) rồi mới đọc/đếm.
      await lockLiveProduct(tx, id, 'UPDATE');
      const before = await loadDetail(tx, id);

      await assertRefs(tx, input.categoryId, input.brandId);

      if (input.status === 'ACTIVE' && before.status !== 'ACTIVE') {
        const active = await tx.productVariant.count({
          where: { productId: id, isActive: true, deletedAt: null },
        });
        if (active === 0) throw fieldError('status', ACTIVE_NEEDS_VARIANT_MSG);
      }

      const data: Prisma.ProductUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.slug !== undefined) data.slug = input.slug;
      if (input.categoryId !== undefined) data.categoryId = input.categoryId;
      if (input.brandId !== undefined) data.brandId = input.brandId;
      if (input.shortDesc !== undefined) data.shortDesc = input.shortDesc;
      if (input.description !== undefined) data.description = input.description;
      if (input.status !== undefined) data.status = input.status;
      if (input.isFeatured !== undefined) data.isFeatured = input.isFeatured;
      if (input.tags !== undefined) data.tags = input.tags;
      if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle;
      if (input.seoDesc !== undefined) data.seoDesc = input.seoDesc;
      if (Object.keys(data).length > 0) await tx.product.update({ where: { id }, data });

      if (input.coffee === null) {
        await tx.coffeeProfile.deleteMany({ where: { productId: id } });
      } else if (input.coffee) {
        await tx.coffeeProfile.upsert({
          where: { productId: id },
          create: coffeeCreateData(id, input.coffee),
          update: coffeeUpdateData(input.coffee),
        });
      }

      await refreshProductDenorm(tx, id);
      const full = await loadDetail(tx, id);

      const diff: AuditDiff =
        diffFields(snapshot(before), snapshot(full), PRODUCT_AUDIT_KEYS) ?? {};
      if (before.description !== full.description) diff.description = [DESC_MARK, DESC_MARK];
      if (Object.keys(diff).length > 0) {
        await writeAudit(tx, {
          actorId,
          action: 'product.update',
          entity: 'Product',
          entityId: id,
          diff,
          ip,
        });
      }
      return toAdminProduct(full);
    }, TX_OPTIONS);
  } catch (e) {
    throw mapForeignKey(mapUniqueViolation(e));
  }
}

export async function deleteProduct(id: string, { actorId, ip }: Actor): Promise<void> {
  checkId(id, productNotFound);
  await prisma.$transaction(async (tx) => {
    const { status } = await lockLiveProduct(tx, id, 'UPDATE');
    const now = new Date();
    await tx.product.update({ where: { id }, data: { deletedAt: now, status: 'ARCHIVED' } });
    await refreshProductDenorm(tx, id);
    await writeAudit(tx, {
      actorId,
      action: 'product.delete',
      entity: 'Product',
      entityId: id,
      diff: {
        ...(status !== 'ARCHIVED' ? { status: [status, 'ARCHIVED'] as [unknown, unknown] } : {}),
        deletedAt: [null, now.toISOString()],
      },
      ip,
    });
  }, TX_OPTIONS);
}
