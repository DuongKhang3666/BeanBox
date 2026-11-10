import type { ProductListItem } from "@/types/catalog";
import { Skeleton } from "@/components/ui/Skeleton";
import { ProductCard } from "./ProductCard";

const GRID = "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4";

export function ProductGrid({ products }: { products: ProductListItem[] }) {
  return (
    <ul className={GRID}>
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < 2} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={GRID} aria-busy="true" aria-label="Đang tải sản phẩm">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-coffee-200 bg-cream-50 p-3">
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}
