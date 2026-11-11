import { Prisma } from '@prisma/client';
import { diffFields, writeAudit } from '../../../lib/audit.js';
import { AppError } from '../../../lib/errors.js';
import { prisma } from '../../../lib/prisma.js';
import { slugify, SLUG_REGEX } from '../../../lib/slug.js';
import { ID_REGEX } from '../admin.schema.js';
import {
  buildCategoryTree,
  toAdminBrand,
  toAdminCategory,
  type AdminBrandDto,
  type AdminCategoryDto,
  type AdminCategoryNode,
} from './catalog.dto.js';
import type {
  CreateBrandInput,
  CreateCategoryInput,
  UpdateBrandInput,
  UpdateCategoryInput,
} from './catalog.schema.js';

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

export interface Actor {
  actorId: string;
  ip: string | null;
}

const fieldError = (field: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [{ field, message }]);

/** ID sai định dạng -> 404 (api-contract §12.0). */
function checkId(id: string, notFound: () => AppError): void {
  if (!ID_REGEX.test(id)) throw notFound();
}

const categoryNotFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy danh mục');
const brandNotFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy thương hiệu');

/** Slug do client gửi (đã validate) hoặc sinh từ tên; < 2 ký tự -> 400 field slug. */
function resolveSlug(name: string, given: string | undefined): string {
  const slug = given ?? slugify(name);
  if (slug.length < 2 || !SLUG_REGEX.test(slug)) {
    throw fieldError('slug', 'Không thể tạo slug từ tên này, vui lòng nhập slug');
  }
  return slug;
}

/** Slug trùng chỉ bắt được chắc chắn qua unique index (race giữa hai request). */
function mapUniqueViolation(e: unknown): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return new AppError(409, 'SLUG_TAKEN', 'Slug đã tồn tại', { field: 'slug' });
  }
  return e;
}

const categoryInclude = {
  _count: { select: { products: { where: { deletedAt: null } } } },
} satisfies Prisma.CategoryInclude;
const brandInclude = categoryInclude satisfies Prisma.BrandInclude;

// ---------------------------------------------------------------------------
// Danh mục

export async function listCategories(): Promise<AdminCategoryNode[]> {
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    include: categoryInclude,
  });
  return buildCategoryTree(rows);
}

const CATEGORY_AUDIT_KEYS = [
  'name',
  'slug',
  'parentId',
  'description',
  'imageUrl',
  'sortOrder',
  'isActive',
] as const;

/** Khóa các dòng Category theo thứ tự id (tránh deadlock giữa các thao tác đổi cây). */
async function lockCategories(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT "id" FROM "Category" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
}

/** Cha phải là danh mục gốc đang tồn tại. */
async function assertValidParent(tx: Prisma.TransactionClient, parentId: string): Promise<void> {
  const parent = await tx.category.findUnique({
    where: { id: parentId },
    select: { parentId: true },
  });
  if (!parent || parent.parentId !== null) {
    throw fieldError('parentId', 'Chỉ hỗ trợ danh mục 2 cấp');
  }
}

export async function createCategory(
  input: CreateCategoryInput,
  { actorId, ip }: Actor,
): Promise<AdminCategoryDto> {
  const slug = resolveSlug(input.name, input.slug);
  try {
    return await prisma.$transaction(async (tx) => {
      if (input.parentId) {
        await lockCategories(tx, [input.parentId]);
        await assertValidParent(tx, input.parentId);
      }
      const row = await tx.category.create({
        data: {
          name: input.name,
          slug,
          parentId: input.parentId,
          description: input.description ?? null,
          imageUrl: input.imageUrl,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
        },
        include: categoryInclude,
      });
      const nulls = Object.fromEntries(CATEGORY_AUDIT_KEYS.map((k) => [k, null]));
      await writeAudit(tx, {
        actorId,
        action: 'category.create',
        entity: 'Category',
        entityId: row.id,
        diff: diffFields(nulls, row, CATEGORY_AUDIT_KEYS),
        ip,
      });
      return toAdminCategory(row);
    }, TX_OPTIONS);
  } catch (e) {
    throw mapUniqueViolation(e);
  }
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
  { actorId, ip }: Actor,
): Promise<AdminCategoryDto> {
  checkId(id, categoryNotFound);
  try {
    return await prisma.$transaction(async (tx) => {
      const newParentId = input.parentId ?? undefined; // chuỗi id mới (nếu có)
      await lockCategories(tx, newParentId ? [...new Set([id, newParentId])] : [id]);

      const before = await tx.category.findUnique({ where: { id } });
      if (!before) throw categoryNotFound();

      if (newParentId) {
        if (newParentId === id)
          throw fieldError('parentId', 'Danh mục không thể là cha của chính nó');
        const childCount = await tx.category.count({ where: { parentId: id } });
        if (childCount > 0) {
          throw fieldError(
            'parentId',
            'Danh mục đang có danh mục con nên không thể làm danh mục con',
          );
        }
        await assertValidParent(tx, newParentId);
      }

      const data: Prisma.CategoryUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.slug !== undefined) data.slug = input.slug;
      if (input.parentId !== undefined) data.parentId = input.parentId; // null = đưa về gốc
      if (input.description !== undefined) data.description = input.description;
      if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
      if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
      if (input.isActive !== undefined) data.isActive = input.isActive;

      const row = await tx.category.update({ where: { id }, data, include: categoryInclude });
      const diff = diffFields(before, row, CATEGORY_AUDIT_KEYS);
      if (diff) {
        await writeAudit(tx, {
          actorId,
          action: 'category.update',
          entity: 'Category',
          entityId: id,
          diff,
          ip,
        });
      }
      return toAdminCategory(row);
    }, TX_OPTIONS);
  } catch (e) {
    throw mapUniqueViolation(e);
  }
}

export async function deleteCategory(id: string, { actorId, ip }: Actor): Promise<void> {
  checkId(id, categoryNotFound);
  const conflict = (details: unknown) =>
    new AppError(
      409,
      'CONFLICT',
      'Danh mục còn danh mục con hoặc sản phẩm; hãy ẩn danh mục thay vì xóa',
      details,
    );
  try {
    await prisma.$transaction(async (tx) => {
      await lockCategories(tx, [id]);
      const row = await tx.category.findUnique({ where: { id } });
      if (!row) throw categoryNotFound();
      const [childCount, productCount] = await Promise.all([
        tx.category.count({ where: { parentId: id } }),
        tx.product.count({ where: { categoryId: id } }), // kể cả đã xóa mềm (FK Restrict)
      ]);
      if (childCount > 0 || productCount > 0) throw conflict({ childCount, productCount });
      await tx.category.delete({ where: { id } });
      await writeAudit(tx, {
        actorId,
        action: 'category.delete',
        entity: 'Category',
        entityId: id,
        diff: diffFields(row, {}, ['name', 'slug', 'parentId']),
        ip,
      });
    }, TX_OPTIONS);
  } catch (e) {
    // Vi phạm FK do sản phẩm/danh mục con được tạo xen giữa.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      throw conflict({ childCount: null, productCount: null });
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Thương hiệu

const BRAND_AUDIT_KEYS = ['name', 'slug', 'logoUrl'] as const;

export async function listBrands(): Promise<AdminBrandDto[]> {
  const rows = await prisma.brand.findMany({
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    include: brandInclude,
  });
  return rows.map(toAdminBrand);
}

export async function createBrand(
  input: CreateBrandInput,
  { actorId, ip }: Actor,
): Promise<AdminBrandDto> {
  const slug = resolveSlug(input.name, input.slug);
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.brand.create({
        data: { name: input.name, slug, logoUrl: input.logoUrl },
        include: brandInclude,
      });
      const nulls = Object.fromEntries(BRAND_AUDIT_KEYS.map((k) => [k, null]));
      await writeAudit(tx, {
        actorId,
        action: 'brand.create',
        entity: 'Brand',
        entityId: row.id,
        diff: diffFields(nulls, row, BRAND_AUDIT_KEYS),
        ip,
      });
      return toAdminBrand(row);
    }, TX_OPTIONS);
  } catch (e) {
    throw mapUniqueViolation(e);
  }
}

export async function updateBrand(
  id: string,
  input: UpdateBrandInput,
  { actorId, ip }: Actor,
): Promise<AdminBrandDto> {
  checkId(id, brandNotFound);
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.brand.findUnique({ where: { id } });
      if (!before) throw brandNotFound();
      const data: Prisma.BrandUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.slug !== undefined) data.slug = input.slug;
      if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl;
      const row = await tx.brand.update({ where: { id }, data, include: brandInclude });
      const diff = diffFields(before, row, BRAND_AUDIT_KEYS);
      if (diff) {
        await writeAudit(tx, {
          actorId,
          action: 'brand.update',
          entity: 'Brand',
          entityId: id,
          diff,
          ip,
        });
      }
      return toAdminBrand(row);
    }, TX_OPTIONS);
  } catch (e) {
    throw mapUniqueViolation(e);
  }
}

export async function deleteBrand(id: string, { actorId, ip }: Actor): Promise<void> {
  checkId(id, brandNotFound);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Brand" WHERE "id" = ${id} FOR UPDATE`;
    const row = await tx.brand.findUnique({ where: { id } });
    if (!row) throw brandNotFound();
    // Sản phẩm đã xóa mềm không chặn: FK SetNull tự xử lý.
    const productCount = await tx.product.count({ where: { brandId: id, deletedAt: null } });
    if (productCount > 0) {
      throw new AppError(
        409,
        'CONFLICT',
        'Thương hiệu còn sản phẩm; hãy gỡ thương hiệu khỏi sản phẩm trước khi xóa',
        { productCount },
      );
    }
    await tx.brand.delete({ where: { id } });
    await writeAudit(tx, {
      actorId,
      action: 'brand.delete',
      entity: 'Brand',
      entityId: id,
      diff: diffFields(row, {}, BRAND_AUDIT_KEYS),
      ip,
    });
  }, TX_OPTIONS);
}
