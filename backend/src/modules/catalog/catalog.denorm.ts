import type { Prisma } from '@prisma/client';
import { effectivePrice, type PricedVariant } from '../../lib/pricing.js';
import { normalizeSearch } from '../../lib/text.js';

/** Quy tắc denormalize: db-schema §5. */

export interface DenormProductInput {
  name: string;
  tags: readonly string[];
  shortDesc: string;
}

export interface DenormVariantInput extends PricedVariant {
  stock: number;
  isActive: boolean;
  deletedAt: Date | null;
}

export interface ProductDenorm {
  searchText: string;
  minPrice: number;
  inStock: boolean;
}

export function computeProductDenorm(
  product: DenormProductInput,
  variants: readonly DenormVariantInput[],
  now: Date,
): ProductDenorm {
  const live = variants.filter((v) => v.isActive && v.deletedAt == null);
  return {
    searchText: normalizeSearch(`${product.name} ${product.tags.join(' ')} ${product.shortDesc}`),
    // Không loại variant hết hàng; không có variant -> 0
    minPrice: live.length > 0 ? Math.min(...live.map((v) => effectivePrice(v, now))) : 0,
    inStock: live.some((v) => v.stock > 0),
  };
}

/** Tính lại và ghi các cột denormalize. Gọi trong cùng transaction với thay đổi nguồn. */
export async function refreshProductDenorm(
  tx: Prisma.TransactionClient,
  productId: string,
  now: Date = new Date(),
): Promise<ProductDenorm> {
  const product = await tx.product.findUniqueOrThrow({
    where: { id: productId },
    select: {
      name: true,
      tags: true,
      shortDesc: true,
      variants: {
        select: {
          price: true,
          salePrice: true,
          saleStart: true,
          saleEnd: true,
          stock: true,
          isActive: true,
          deletedAt: true,
        },
      },
    },
  });
  const denorm = computeProductDenorm(product, product.variants, now);
  await tx.product.update({ where: { id: productId }, data: denorm });
  return denorm;
}
