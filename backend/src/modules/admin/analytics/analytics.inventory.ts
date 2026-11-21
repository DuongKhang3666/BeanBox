import { Prisma } from '../../../generated/prisma/client.js';
import { analyticsPrisma } from '../../../lib/prisma.js';
import { SLOW_DAYS_DEFAULT, type InventoryQuery } from './analytics.schema.js';

/**
 * Tồn kho: hết hàng, sắp hết, giá trị tồn, hàng bán chậm (api-contract §16.3, D-052).
 * Ảnh chụp hiện tại, không theo khoảng ngày. Phạm vi biến thể như `lowStock` của dashboard:
 * `isActive`, chưa xóa mềm, sản phẩm chưa xóa mềm.
 */

type Raw = bigint | number | null;
const num = (v: Raw) => Number(v ?? 0);

export const INVENTORY_LIST_LIMIT = 20;
const DAY_MS = 24 * 3600 * 1000;

export interface InventoryItem {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  stock: number;
  lowStockThreshold: number;
  /** Giá niêm yết (không dùng salePrice). */
  price: number;
  /** stock x price khi stock > 0, ngược lại 0. */
  stockValue: number;
  /** Lần bán gần nhất (theo ngày tạo đơn, đơn không CANCELLED/PENDING_PAYMENT); null = chưa từng bán. */
  lastSoldAt: string | null;
}

export interface InventoryDto {
  summary: {
    variants: number;
    outOfStock: number;
    lowStock: number;
    stockUnits: number;
    stockValue: number;
    slowMovers: number;
    slowMoversValue: number;
  };
  outOfStock: InventoryItem[];
  lowStock: InventoryItem[];
  slowMovers: InventoryItem[];
  slowDays: number;
  generatedAt: string;
}

interface ItemRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  stock: number;
  threshold: number;
  price: number;
  last_sold: Date | null;
}
interface SlowRow extends ItemRow {
  slow_total: Raw;
  slow_value: Raw;
}
interface SummaryRow {
  variants: Raw;
  out_of_stock: Raw;
  low_stock: Raw;
  stock_units: Raw;
  stock_value: Raw;
}

const toItem = (r: ItemRow): InventoryItem => ({
  variantId: r.variant_id,
  productId: r.product_id,
  productName: r.product_name,
  variantName: r.variant_name,
  sku: r.sku,
  stock: r.stock,
  lowStockThreshold: r.threshold,
  price: r.price,
  stockValue: r.stock > 0 ? r.stock * r.price : 0,
  lastSoldAt: r.last_sold ? r.last_sold.toISOString() : null,
});

// Mảnh SQL dùng chung (Prisma.sql: vẫn tham số hóa, không nối chuỗi từ input).
const SCOPE = Prisma.sql`v."isActive" = true AND v."deletedAt" IS NULL AND p."deletedAt" IS NULL`;
const COLS = Prisma.sql`v."id" AS variant_id, p."id" AS product_id, p."name" AS product_name,
  v."name" AS variant_name, v."sku" AS sku, v."stock" AS stock, v."lowStockThreshold" AS threshold,
  v."price" AS price`;
/**
 * "Bán" = có OrderItem thuộc đơn không CANCELLED/PENDING_PAYMENT (cùng quy ước top sản phẩm §14.3).
 * Gộp MỘT lần theo biến thể rồi JOIN (subquery tương quan chạy lại quét `Order` cho từng biến thể,
 * chậm khi có hàng chục nghìn đơn; xem D-054).
 */
const LAST_SOLD_JOIN = Prisma.sql`LEFT JOIN (
  SELECT oi."variantId" AS vid, MAX(o."createdAt") AS last_sold
  FROM "OrderItem" oi
  JOIN "Order" o ON o."id" = oi."orderId"
  WHERE o."status" NOT IN ('CANCELLED', 'PENDING_PAYMENT')
  GROUP BY oi."variantId"
) ls ON ls.vid = v."id"`;

export async function getInventory(
  query: InventoryQuery,
  now: Date = new Date(),
  /** Số dòng tối đa mỗi danh sách: 20 cho response JSON; xuất CSV truyền lớn hơn (D-053). */
  listLimit: number = INVENTORY_LIST_LIMIT,
): Promise<InventoryDto> {
  const slowDays = query.slowDays ?? SLOW_DAYS_DEFAULT;
  const since = new Date(now.getTime() - slowDays * DAY_MS);

  const [summaryRows, outRows, lowRows, slowRows] = await Promise.all([
    analyticsPrisma.$queryRaw<SummaryRow[]>`
      SELECT COUNT(*)::int AS variants,
        (COUNT(*) FILTER (WHERE v."stock" <= 0))::int AS out_of_stock,
        (COUNT(*) FILTER (WHERE v."stock" > 0 AND v."stock" <= v."lowStockThreshold"))::int AS low_stock,
        COALESCE(SUM(v."stock") FILTER (WHERE v."stock" > 0), 0)::bigint AS stock_units,
        COALESCE(SUM(v."stock"::bigint * v."price") FILTER (WHERE v."stock" > 0), 0)::bigint AS stock_value
      FROM "ProductVariant" v
      JOIN "Product" p ON p."id" = v."productId"
      WHERE ${SCOPE}`,
    analyticsPrisma.$queryRaw<ItemRow[]>`
      SELECT ${COLS}, ls.last_sold AS last_sold
      FROM "ProductVariant" v
      JOIN "Product" p ON p."id" = v."productId"
      ${LAST_SOLD_JOIN}
      WHERE ${SCOPE} AND v."stock" <= 0
      ORDER BY p."name" ASC, v."name" ASC, v."sku" ASC
      LIMIT ${listLimit}`,
    analyticsPrisma.$queryRaw<ItemRow[]>`
      SELECT ${COLS}, ls.last_sold AS last_sold
      FROM "ProductVariant" v
      JOIN "Product" p ON p."id" = v."productId"
      ${LAST_SOLD_JOIN}
      WHERE ${SCOPE} AND v."stock" > 0 AND v."stock" <= v."lowStockThreshold"
      ORDER BY v."stock" ASC, p."name" ASC, v."sku" ASC
      LIMIT ${listLimit}`,
    // Bán chậm: còn hàng, không bán trong `slowDays` ngày gần nhất, loại biến thể tạo trong khoảng đó.
    analyticsPrisma.$queryRaw<SlowRow[]>`
      WITH slow AS (
        SELECT ${COLS}, ls.last_sold AS last_sold,
          (v."stock"::bigint * v."price") AS stock_value
        FROM "ProductVariant" v
        JOIN "Product" p ON p."id" = v."productId"
        ${LAST_SOLD_JOIN}
        WHERE ${SCOPE} AND v."stock" > 0 AND v."createdAt" < ${since}
      ), filtered AS (
        SELECT * FROM slow WHERE last_sold IS NULL OR last_sold < ${since}
      )
      SELECT f.*, (COUNT(*) OVER ())::int AS slow_total,
        (SUM(f.stock_value) OVER ())::bigint AS slow_value
      FROM filtered f
      ORDER BY f.stock_value DESC, f.product_name ASC, f.sku ASC
      LIMIT ${listLimit}`,
  ]);

  const s = summaryRows[0];
  return {
    summary: {
      variants: num(s?.variants ?? 0),
      outOfStock: num(s?.out_of_stock ?? 0),
      lowStock: num(s?.low_stock ?? 0),
      stockUnits: num(s?.stock_units ?? 0),
      stockValue: num(s?.stock_value ?? 0),
      slowMovers: slowRows.length > 0 ? num(slowRows[0]!.slow_total) : 0,
      slowMoversValue: slowRows.length > 0 ? num(slowRows[0]!.slow_value) : 0,
    },
    outOfStock: outRows.map(toItem),
    lowStock: lowRows.map(toItem),
    slowMovers: slowRows.map(toItem),
    slowDays,
    generatedAt: now.toISOString(),
  };
}
