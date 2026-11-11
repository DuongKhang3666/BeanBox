import type { Prisma, ProductStatus } from '@prisma/client';
import { AppError } from '../../../lib/errors.js';
import { ID_REGEX } from '../admin.schema.js';

export const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

export interface Actor {
  actorId: string;
  ip: string | null;
}

export const fieldError = (field: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [{ field, message }]);

export const productNotFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm');
export const variantNotFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy biến thể');
export const imageNotFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy ảnh');

export const ACTIVE_NEEDS_VARIANT_MSG = 'Cần ít nhất 1 biến thể đang bán để hiển thị sản phẩm';

/** ID sai định dạng -> 404 (api-contract §12.0). */
export function checkId(id: string, notFound: () => AppError): void {
  if (!ID_REGEX.test(id)) throw notFound();
}

/**
 * Khóa dòng Product và trả trạng thái MỚI NHẤT sau khi giữ khóa.
 * `UPDATE` cho thao tác sản phẩm/ảnh; `NO KEY UPDATE` cho thao tác biến thể (cùng đặt/hủy đơn,
 * thứ tự khóa Variant -> Product). Không tồn tại hoặc đã xóa mềm -> 404.
 */
export async function lockLiveProduct(
  tx: Prisma.TransactionClient,
  productId: string,
  mode: 'UPDATE' | 'NO KEY UPDATE',
): Promise<{ status: ProductStatus }> {
  const rows =
    mode === 'UPDATE'
      ? await tx.$queryRaw<Array<{ status: ProductStatus; deletedAt: Date | null }>>`
          SELECT "status", "deletedAt" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`
      : await tx.$queryRaw<Array<{ status: ProductStatus; deletedAt: Date | null }>>`
          SELECT "status", "deletedAt" FROM "Product" WHERE "id" = ${productId} FOR NO KEY UPDATE`;
  const row = rows[0];
  if (!row || row.deletedAt) throw productNotFound();
  return { status: row.status };
}
