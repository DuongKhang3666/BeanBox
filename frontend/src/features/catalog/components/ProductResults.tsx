import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { PaginationMeta } from "@/types/api";
import type { ProductListItem } from "@/types/catalog";
import { buildHref, clearFilters, hasActiveFilters, type ProductFilters } from "../filters";
import { Pagination } from "./Pagination";
import { ProductGrid } from "./ProductGrid";
import { SortSelect } from "./SortSelect";

interface ProductResultsProps {
  pathname: string;
  filters: ProductFilters;
  items: ProductListItem[];
  meta: PaginationMeta;
  emptyDescription?: string;
}

/** Thanh sắp xếp + tổng số kết quả + lưới + phân trang + trạng thái rỗng. */
export function ProductResults({
  pathname,
  filters,
  items,
  meta,
  emptyDescription,
}: ProductResultsProps) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-coffee-700" role="status">
          {meta.total > 0 ? `${meta.total} sản phẩm` : "Không có sản phẩm"}
        </p>
        <SortSelect pathname={pathname} filters={filters} />
      </div>
      {items.length === 0 ? (
        <EmptyState
          title="Không có sản phẩm phù hợp"
          description={
            emptyDescription ??
            "Hãy thử bỏ bớt bộ lọc hoặc chọn khoảng giá rộng hơn để xem thêm sản phẩm."
          }
          action={
            hasActiveFilters(filters) || filters.page > 1 ? (
              <Link
                href={buildHref(pathname, clearFilters(filters))}
                className={buttonClasses("secondary", "md")}
              >
                Xóa bộ lọc
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <ProductGrid products={items} />
          <Pagination pathname={pathname} filters={filters} meta={meta} />
        </>
      )}
    </div>
  );
}
