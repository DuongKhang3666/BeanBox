import type { Metadata } from "next";
import { DEFAULT_PAGE_SIZE, parseFilters, type RawSearchParams } from "./filters";

/**
 * Canonical + robots cho trang danh sách (D-064).
 * - Không có tham số lọc/sắp xếp: trang 1 canonical = path, trang N>1 canonical tự trỏ `?page=N` (index được).
 * - Có bất kỳ tham số lọc/sắp xếp/từ khóa/cỡ trang: `noindex, follow` và canonical về URL không lọc
 *   (cùng số trang) để không nhân bản nội dung và không phân tán tín hiệu.
 */
export function listingCanonicalAndRobots(
  path: string,
  rawSearch: RawSearchParams,
): Pick<Metadata, "alternates" | "robots"> {
  const f = parseFilters(rawSearch);
  const canonical = f.page > 1 ? `${path}?page=${f.page}` : path;
  const hasRefinement =
    f.brand.length > 0 ||
    f.origin.length > 0 ||
    f.roast.length > 0 ||
    f.process.length > 0 ||
    f.brew.length > 0 ||
    f.minPrice !== undefined ||
    f.maxPrice !== undefined ||
    f.inStock ||
    f.sort !== undefined ||
    !!f.q ||
    f.pageSize !== DEFAULT_PAGE_SIZE;
  return {
    alternates: { canonical },
    ...(hasRefinement ? { robots: { index: false, follow: true } } : {}),
  };
}
