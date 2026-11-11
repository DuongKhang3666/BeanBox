import Link from "next/link";
import type { ProductListItem } from "@/types/catalog";
import { ROAST_LABELS } from "../labels";
import { PriceTag } from "./PriceTag";
import { ProductImage } from "./ProductImage";

export function RatingStars({ avg, count }: { avg: number; count: number }) {
  if (count <= 0) return null;
  return (
    <p className="flex items-center gap-1 text-sm text-coffee-700">
      <span aria-hidden="true" className="text-amber-600">
        ★
      </span>
      <span className="sr-only">Đánh giá {avg.toFixed(1)} trên 5 sao, </span>
      <span aria-hidden="true">{avg.toFixed(1)}</span>
      <span>({count} đánh giá)</span>
    </p>
  );
}

const badge = "rounded-md px-2 py-0.5 text-xs font-semibold";

export function ProductCard({
  product,
  priority = false,
}: {
  product: ProductListItem;
  priority?: boolean;
}) {
  const roast = product.coffee?.roastLevel ? ROAST_LABELS[product.coffee.roastLevel] : null;
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-coffee-200 bg-cream-50 transition-shadow focus-within:ring-2 focus-within:ring-moss-600 hover:shadow-md">
      <div className="relative">
        <ProductImage
          src={product.primaryImage?.url}
          alt={product.primaryImage?.alt}
          name={product.name}
          className="w-full"
          priority={priority}
          sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
        />
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {!product.inStock ? (
            <span className={`${badge} bg-coffee-800 text-cream-50`}>Hết hàng</span>
          ) : null}
          {product.isFeatured ? (
            <span className={`${badge} bg-moss-700 text-white`}>Nổi bật</span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {product.brand ? (
          <p className="text-xs font-medium uppercase tracking-wide text-coffee-600">
            {product.brand.name}
          </p>
        ) : null}
        <h3 className="line-clamp-2 text-sm font-semibold text-coffee-900 sm:text-base">
          <Link
            href={`/san-pham/${product.slug}`}
            className="outline-none after:absolute after:inset-0 after:content-['']"
          >
            {product.name}
          </Link>
        </h3>
        {roast ? <p className="text-xs text-coffee-600">{roast}</p> : null}
        <RatingStars avg={product.ratingAvg} count={product.ratingCount} />
        <PriceTag
          className="mt-auto pt-1"
          price={product.minPrice}
          compareAtPrice={product.compareAtPrice}
        />
      </div>
    </article>
  );
}
