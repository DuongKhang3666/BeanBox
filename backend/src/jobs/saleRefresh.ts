import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { refreshProductDenorm } from '../modules/catalog/catalog.denorm.js';

/**
 * Job đối soát giá denormalize theo mốc sale (D-080, R-17).
 * `Product.minPrice` chỉ được ghi khi có thay đổi dữ liệu; khi đến `saleStart`/`saleEnd` mà không ai sửa
 * sản phẩm thì giá lọc/sắp xếp (`/products?sort=price`, khoảng giá) bị lệch. Job tìm sản phẩm có `minPrice`
 * khác giá hiệu lực tính từ biến thể tại `now` rồi gọi CHÍNH `refreshProductDenorm` (một nguồn logic).
 */

/** Khóa advisory riêng cho job đối soát giá ("BBSALE" dạng số). */
export const SALE_REFRESH_LOCK_KEY = 6_661_000_003n;
export const SALE_REFRESH_BATCH_SIZE = 500;

export type SaleRefreshResult =
  { skipped: true } | { skipped: false; refreshed: number; errors: number; ids: string[] };

/**
 * SQL tập hợp: giá hiệu lực của biến thể = `salePrice` khi có salePrice và `now` nằm trong
 * [saleStart, saleEnd] (bound null = mở, tính cả hai biên), ngược lại `price` (đúng `effectivePrice`).
 * Chỉ biến thể `isActive` và chưa xóa (đúng `computeProductDenorm`); không có biến thể -> 0.
 * `now` được ép về `timestamp` UTC vì cột Prisma `DateTime` là `timestamp(3)` không múi giờ (lưu UTC).
 */
export async function findStaleMinPriceProducts(
  db: Pick<typeof prisma, '$queryRaw'>,
  now: Date,
  limit: number = SALE_REFRESH_BATCH_SIZE,
): Promise<string[]> {
  const nowIso = now.toISOString();
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT p."id"
    FROM "Product" p
    LEFT JOIN LATERAL (
      SELECT MIN(
        CASE
          WHEN v."salePrice" IS NOT NULL
            AND (v."saleStart" IS NULL OR v."saleStart" <= (${nowIso}::timestamptz AT TIME ZONE 'UTC'))
            AND (v."saleEnd" IS NULL OR v."saleEnd" >= (${nowIso}::timestamptz AT TIME ZONE 'UTC'))
          THEN v."salePrice"
          ELSE v."price"
        END
      ) AS "effMin"
      FROM "ProductVariant" v
      WHERE v."productId" = p."id" AND v."isActive" AND v."deletedAt" IS NULL
    ) x ON TRUE
    WHERE p."deletedAt" IS NULL AND p."minPrice" <> COALESCE(x."effMin", 0)
    ORDER BY p."id"
    LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

/** Một lượt đối soát (idempotent): sản phẩm không lệch không bị ghi; chạy lại ngay thì refreshed = 0. */
export async function runSaleRefreshOnce(
  now: Date = new Date(),
  limit: number = SALE_REFRESH_BATCH_SIZE,
): Promise<SaleRefreshResult> {
  const result = await prisma.$transaction(
    async (lockTx): Promise<SaleRefreshResult> => {
      const rows = await lockTx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${SALE_REFRESH_LOCK_KEY}::bigint) AS locked`;
      if (!rows[0]?.locked) return { skipped: true };

      const ids = await findStaleMinPriceProducts(lockTx, now, limit);
      const done: string[] = [];
      let errors = 0;
      for (const id of ids) {
        try {
          await prisma.$transaction((tx) => refreshProductDenorm(tx, id, now), {
            timeout: 30_000,
            maxWait: 10_000,
          });
          done.push(id);
        } catch (err) {
          errors++;
          logger.error({ err, productId: id }, 'Làm mới giá denormalize thất bại');
        }
      }
      return { skipped: false, refreshed: done.length, errors, ids: done };
    },
    { timeout: 300_000, maxWait: 10_000 },
  );
  if (result.skipped) {
    logger.debug('Job làm mới giá theo mốc sale: instance khác đang chạy, bỏ qua');
  } else if (result.refreshed > 0 || result.errors > 0) {
    logger.info(
      `Job làm mới giá theo mốc sale: đã làm mới ${result.refreshed} sản phẩm, ${result.errors} lỗi`,
    );
  }
  return result;
}
