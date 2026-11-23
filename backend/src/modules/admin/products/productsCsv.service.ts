import { createHash } from 'node:crypto';
import { Prisma } from '../../../generated/prisma/client.js';
import { writeAudit } from '../../../lib/audit.js';
import { AppError } from '../../../lib/errors.js';
import { prisma } from '../../../lib/prisma.js';
import { refreshProductDenorm } from '../../catalog/catalog.denorm.js';
import {
  buildImportPlan,
  ImportFileError,
  PRODUCT_CSV_COLUMNS,
  parseProductCsv,
  type ExistingProduct,
  type ExistingVariant,
  type ImportPlan,
  type ParsedRow,
  type PlanContext,
  type PlanEntry,
} from './productsCsv.js';
import type { CsvRow } from '../../../lib/csv.js';

/** Xuất/nhập CSV sản phẩm (D-073). Nhập: preview không ghi DB, commit áp trong MỘT transaction. */

type Db = Prisma.TransactionClient;

/** Audit `variant.cost_set` (giá vốn đặt tay qua CSV), cùng dạng với sửa ở form biến thể. */
const costAudit = (
  tx: Db,
  actorId: string,
  variantId: string,
  from: number | null,
  to: number | null,
  ip: string | null,
) =>
  writeAudit(tx, {
    actorId,
    action: 'variant.cost_set',
    entity: 'ProductVariant',
    entityId: variantId,
    diff: { avgCost: [from, to] },
    ip,
  });

const IMPORT_TX_OPTIONS = { timeout: 120_000, maxWait: 10_000 } as const;

export interface Actor {
  actorId: string;
  ip: string | null;
}

// ---------------------------------------------------------------------------
// Xuất

/** Mỗi dòng = 1 biến thể (chưa xóa mềm) của sản phẩm chưa xóa mềm. Không xuất mô tả dài/ảnh/coffee. */
export async function buildProductsExport(): Promise<{ rows: CsvRow[]; rowCount: number }> {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: [{ slug: 'asc' }],
    select: {
      slug: true,
      name: true,
      status: true,
      isFeatured: true,
      category: { select: { slug: true } },
      brand: { select: { slug: true } },
      variants: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      },
    },
  });
  const rows: CsvRow[] = [[...PRODUCT_CSV_COLUMNS]];
  for (const p of products) {
    for (const v of p.variants) {
      rows.push([
        p.slug,
        p.name,
        p.category.slug,
        p.brand?.slug ?? '',
        p.status,
        p.isFeatured ? 'true' : 'false',
        v.sku,
        v.name,
        v.price,
        v.salePrice,
        v.saleStart?.toISOString() ?? '',
        v.saleEnd?.toISOString() ?? '',
        v.stock,
        v.lowStockThreshold,
        v.weightGram,
        v.isActive ? 'true' : 'false',
        v.avgCost,
      ]);
    }
  }
  return { rows, rowCount: rows.length - 1 };
}

export async function auditExport(actor: Actor, rowCount: number): Promise<void> {
  await prisma.$transaction((tx) =>
    writeAudit(tx, {
      actorId: actor.actorId,
      action: 'product.export',
      entity: 'Product',
      entityId: null,
      diff: { rows: [null, rowCount] },
      ip: actor.ip,
    }),
  );
}

// ---------------------------------------------------------------------------
// Nhập

export const fingerprintOf = (buf: Buffer): string =>
  createHash('sha256').update(buf).digest('hex');

const invalidCsv = (message: string) => new AppError(400, 'INVALID_CSV', message);

/** Giải mã UTF-8 nghiêm ngặt và kiểm file; lỗi cấp file -> 400 INVALID_CSV. */
export function parseUpload(buf: Buffer): ParsedRow[] {
  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf);
  } catch {
    throw invalidCsv('File phải được lưu ở định dạng UTF-8');
  }
  try {
    return parseProductCsv(content);
  } catch (e) {
    if (e instanceof ImportFileError) throw invalidCsv(e.message);
    throw e;
  }
}

interface LoadedContext extends PlanContext {
  categoryIds: Map<string, string>;
  brandIds: Map<string, string>;
}

async function loadContext(db: Db, rows: readonly ParsedRow[]): Promise<LoadedContext> {
  const slugs = [...new Set(rows.flatMap((r) => (r.data ? [r.data.product.slug] : [])))];
  const skus = [...new Set(rows.flatMap((r) => (r.data ? [r.data.variant.sku] : [])))];
  const catSlugs = [...new Set(rows.flatMap((r) => (r.data ? [r.data.product.categorySlug] : [])))];
  const brandSlugs = [
    ...new Set(rows.flatMap((r) => (r.data?.product.brandSlug ? [r.data.product.brandSlug] : []))),
  ];

  const [products, skuVariants, cats, brands] = await Promise.all([
    slugs.length
      ? db.product.findMany({
          where: { slug: { in: slugs } },
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
            isFeatured: true,
            deletedAt: true,
            category: { select: { slug: true } },
            brand: { select: { slug: true } },
            variants: { where: { deletedAt: null } },
          },
        })
      : [],
    skus.length
      ? db.productVariant.findMany({
          where: { sku: { in: skus } },
          include: { product: { select: { slug: true } } },
        })
      : [],
    catSlugs.length
      ? db.category.findMany({
          where: { slug: { in: catSlugs } },
          select: { slug: true, id: true },
        })
      : [],
    brandSlugs.length
      ? db.brand.findMany({ where: { slug: { in: brandSlugs } }, select: { slug: true, id: true } })
      : [],
  ]);

  const toVariant = (
    v: Prisma.ProductVariantGetPayload<object>,
    productSlug: string,
  ): ExistingVariant => ({
    id: v.id,
    sku: v.sku,
    name: v.name,
    price: v.price,
    salePrice: v.salePrice,
    saleStart: v.saleStart,
    saleEnd: v.saleEnd,
    stock: v.stock,
    lowStockThreshold: v.lowStockThreshold,
    weightGram: v.weightGram,
    isActive: v.isActive,
    avgCost: v.avgCost,
    productSlug,
    deletedAt: v.deletedAt,
  });

  const productsBySlug = new Map<string, ExistingProduct>(
    products.map((p) => [
      p.slug,
      {
        id: p.id,
        slug: p.slug,
        name: p.name,
        categorySlug: p.category.slug,
        brandSlug: p.brand?.slug ?? null,
        status: p.status,
        isFeatured: p.isFeatured,
        deletedAt: p.deletedAt,
        variants: p.variants.map((v) => toVariant(v, p.slug)),
      },
    ]),
  );
  const variantsBySku = new Map<string, ExistingVariant>(
    skuVariants.map((v) => [v.sku, toVariant(v, v.product.slug)]),
  );
  return {
    productsBySlug,
    variantsBySku,
    categorySlugs: new Set(cats.map((c) => c.slug)),
    brandSlugs: new Set(brands.map((b) => b.slug)),
    categoryIds: new Map(cats.map((c) => [c.slug, c.id])),
    brandIds: new Map(brands.map((b) => [b.slug, b.id])),
  };
}

export interface PreviewResult {
  fingerprint: string;
  fileName: string;
  canApply: boolean;
  summary: ImportPlan['summary'];
  entries: PlanEntry[];
}

/** Bước 1: chỉ đọc, KHÔNG ghi DB. */
export async function previewImport(buf: Buffer, fileName: string): Promise<PreviewResult> {
  const rows = parseUpload(buf);
  const ctx = await loadContext(prisma, rows);
  const plan = buildImportPlan(rows, ctx);
  return {
    fingerprint: fingerprintOf(buf),
    fileName,
    canApply: plan.summary.error === 0,
    summary: plan.summary,
    entries: plan.entries,
  };
}

export interface CommitResult {
  fingerprint: string;
  fileName: string;
  summary: ImportPlan['summary'];
  applied: {
    productsCreated: number;
    productsUpdated: number;
    variantsCreated: number;
    variantsUpdated: number;
    stockMovements: number;
    unchanged: number;
  };
}

function mapUnique(e: unknown): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const meta = JSON.stringify(e.meta ?? {});
    return meta.includes('sku')
      ? new AppError(
          409,
          'SKU_TAKEN',
          'SKU đã tồn tại (có thao tác khác vừa tạo), hãy xem trước lại',
        )
      : new AppError(
          409,
          'SLUG_TAKEN',
          'Slug đã tồn tại (có thao tác khác vừa tạo), hãy xem trước lại',
        );
  }
  return e;
}

/** Bước 2: tính lại kế hoạch trong transaction (sau khi khóa dòng), rồi áp tất cả hoặc không gì cả. */
export async function commitImport(
  buf: Buffer,
  fileName: string,
  fingerprint: string,
  { actorId, ip }: Actor,
): Promise<CommitResult> {
  const actual = fingerprintOf(buf);
  if (actual !== fingerprint) {
    throw new AppError(
      409,
      'FINGERPRINT_MISMATCH',
      'Nội dung file khác với bản đã xem trước, vui lòng xem trước lại',
    );
  }
  const rows = parseUpload(buf);
  const skus = [...new Set(rows.flatMap((r) => (r.data ? [r.data.variant.sku] : [])))].sort();
  const slugs = [...new Set(rows.flatMap((r) => (r.data ? [r.data.product.slug] : [])))].sort();

  try {
    return await prisma.$transaction(async (tx) => {
      // Khóa biến thể rồi sản phẩm (cùng thứ tự đặt/hủy đơn) để tồn kho/giá không đổi giữa chừng.
      if (skus.length > 0) {
        await tx.$queryRaw`SELECT "id" FROM "ProductVariant"
          WHERE "sku" IN (${Prisma.join(skus)}) ORDER BY "id" FOR UPDATE`;
      }
      if (slugs.length > 0) {
        await tx.$queryRaw`SELECT "id" FROM "Product"
          WHERE "slug" IN (${Prisma.join(slugs)}) ORDER BY "id" FOR NO KEY UPDATE`;
      }
      const ctx = await loadContext(tx, rows);
      const plan = buildImportPlan(rows, ctx);
      if (plan.summary.error > 0) {
        const first = plan.entries.filter((e) => e.action === 'error').slice(0, 20);
        throw new AppError(
          422,
          'IMPORT_HAS_ERRORS',
          `File còn ${plan.summary.error} dòng lỗi, không có gì được ghi`,
          { summary: plan.summary, errors: first },
        );
      }

      const productIds = new Map<string, string>();
      for (const [slug, p] of ctx.productsBySlug) productIds.set(slug, p.id);
      const touched = new Set<string>();
      const sortCursor = new Map<string, number>();
      const applied = {
        productsCreated: 0,
        productsUpdated: 0,
        variantsCreated: 0,
        variantsUpdated: 0,
        stockMovements: 0,
        unchanged: plan.summary.unchanged,
      };

      for (const op of plan.ops) {
        if (op.kind === 'create_product') {
          const p = op.product;
          const created = await tx.product.create({
            data: {
              categoryId: ctx.categoryIds.get(p.categorySlug)!,
              brandId: p.brandSlug ? ctx.brandIds.get(p.brandSlug)! : null,
              name: p.name,
              slug: p.slug,
              status: p.status,
              isFeatured: p.isFeatured,
            },
            select: { id: true },
          });
          productIds.set(p.slug, created.id);
          touched.add(created.id);
          applied.productsCreated++;
        } else if (op.kind === 'update_product') {
          const { patch } = op;
          const data: Prisma.ProductUncheckedUpdateInput = {};
          if (patch.name !== undefined) data.name = patch.name;
          if (patch.status !== undefined) data.status = patch.status;
          if (patch.isFeatured !== undefined) data.isFeatured = patch.isFeatured;
          if (patch.categorySlug !== undefined) {
            data.categoryId = ctx.categoryIds.get(patch.categorySlug)!;
          }
          if (patch.brandSlug !== undefined) {
            data.brandId = patch.brandSlug ? ctx.brandIds.get(patch.brandSlug)! : null;
          }
          await tx.product.update({ where: { id: op.id }, data });
          touched.add(op.id);
          applied.productsUpdated++;
        } else if (op.kind === 'create_variant') {
          const productId = productIds.get(op.productSlug)!;
          const v = op.variant;
          let sortOrder = sortCursor.get(productId);
          if (sortOrder === undefined) {
            sortOrder = await tx.productVariant.count({ where: { productId, deletedAt: null } });
          }
          sortCursor.set(productId, sortOrder + 1);
          const row = await tx.productVariant.create({
            data: {
              productId,
              sku: v.sku,
              name: v.name,
              price: v.price,
              salePrice: v.salePrice,
              saleStart: v.saleStart,
              saleEnd: v.saleEnd,
              stock: v.stock,
              lowStockThreshold: v.lowStockThreshold,
              weightGram: v.weightGram,
              isActive: v.isActive,
              sortOrder,
              avgCost: v.avgCost ?? null,
            },
            select: { id: true },
          });
          if (v.avgCost != null) await costAudit(tx, actorId, row.id, null, v.avgCost, ip);
          if (v.stock > 0) {
            await tx.inventoryMovement.create({
              data: {
                variantId: row.id,
                change: v.stock,
                stockAfter: v.stock,
                reason: 'STOCKTAKE',
                actorId,
                note: 'Nhập CSV',
              },
            });
            applied.stockMovements++;
          }
          touched.add(productId);
          applied.variantsCreated++;
        } else {
          const { patch } = op;
          const data: Prisma.ProductVariantUncheckedUpdateInput = {};
          if (patch.name !== undefined) data.name = patch.name;
          if (patch.price !== undefined) data.price = patch.price;
          if (patch.salePrice !== undefined) data.salePrice = patch.salePrice;
          if (patch.saleStart !== undefined) data.saleStart = patch.saleStart;
          if (patch.saleEnd !== undefined) data.saleEnd = patch.saleEnd;
          if (patch.stock !== undefined) data.stock = patch.stock;
          if (patch.lowStockThreshold !== undefined) {
            data.lowStockThreshold = patch.lowStockThreshold;
          }
          if (patch.weightGram !== undefined) data.weightGram = patch.weightGram;
          if (patch.isActive !== undefined) data.isActive = patch.isActive;
          if (patch.avgCost !== undefined) data.avgCost = patch.avgCost;
          const row = await tx.productVariant.update({
            where: { id: op.id },
            data,
            select: { productId: true },
          });
          if (patch.avgCost !== undefined) {
            await costAudit(tx, actorId, op.id, op.avgCostFrom, patch.avgCost, ip);
          }
          if (patch.stock !== undefined) {
            await tx.inventoryMovement.create({
              data: {
                variantId: op.id,
                change: patch.stock - op.stockFrom,
                stockAfter: patch.stock,
                reason: 'ADJUSTMENT',
                actorId,
                note: 'Nhập CSV',
              },
            });
            applied.stockMovements++;
          }
          touched.add(row.productId);
          applied.variantsUpdated++;
        }
      }

      for (const id of touched) await refreshProductDenorm(tx, id);

      await writeAudit(tx, {
        actorId,
        action: 'product.import',
        entity: 'Product',
        entityId: null,
        diff: {
          fileName: [null, fileName],
          fingerprint: [null, fingerprint],
          rows: [null, plan.summary.rows],
          create_product: [null, plan.summary.create_product],
          create_variant: [null, plan.summary.create_variant],
          update_variant: [null, plan.summary.update_variant],
          update_product: [null, plan.summary.update_product],
          unchanged: [null, plan.summary.unchanged],
        },
        ip,
      });
      return { fingerprint, fileName, summary: plan.summary, applied };
    }, IMPORT_TX_OPTIONS);
  } catch (e) {
    throw mapUnique(e);
  }
}
