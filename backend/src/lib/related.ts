/**
 * Chấm điểm "sản phẩm liên quan" theo nội dung (D-046). Hàm thuần, không đụng DB.
 * Công thức: api-contract §4.4.
 */

export interface RelatedCoffee {
  roastLevel: string | null;
  originCountry: string | null;
  process: string | null;
  brewMethods: readonly string[];
}

export interface RelatedProfile {
  id: string;
  categoryId: string;
  /** `Category.parentId` của danh mục chứa sản phẩm (null = danh mục gốc). */
  parentCategoryId: string | null;
  brandId: string | null;
  tags: readonly string[];
  inStock: boolean;
  soldCount: number;
  /** Giá hiệu lực thấp nhất (VND). */
  minPrice: number;
  coffee: RelatedCoffee | null;
}

export const SCORE_SAME_CATEGORY = 4;
export const SCORE_SAME_PARENT_CATEGORY = 2;
export const SCORE_SAME_BRAND = 2;
export const SCORE_PER_TAG = 1;
export const SCORE_MAX_TAG = 3;
export const SCORE_PER_COFFEE_MATCH = 1;
export const SCORE_SIMILAR_PRICE = 1;
/** Giá ứng viên trong ±30% giá gốc thì được cộng điểm. */
export const PRICE_BAND = 0.3;

const norm = (s: string) => s.trim().toLowerCase();

export function scoreRelated(base: RelatedProfile, candidate: RelatedProfile): number {
  let score = 0;

  if (candidate.categoryId === base.categoryId) {
    score += SCORE_SAME_CATEGORY;
  } else if (
    base.parentCategoryId !== null &&
    candidate.parentCategoryId !== null &&
    base.parentCategoryId === candidate.parentCategoryId
  ) {
    score += SCORE_SAME_PARENT_CATEGORY;
  }

  if (base.brandId !== null && candidate.brandId === base.brandId) score += SCORE_SAME_BRAND;

  const baseTags = new Set(base.tags.map(norm).filter((t) => t.length > 0));
  const sharedTags = new Set(
    candidate.tags.map(norm).filter((t) => t.length > 0 && baseTags.has(t)),
  );
  score += Math.min(sharedTags.size * SCORE_PER_TAG, SCORE_MAX_TAG);

  const a = base.coffee;
  const b = candidate.coffee;
  if (a && b) {
    if (a.roastLevel !== null && a.roastLevel === b.roastLevel) score += SCORE_PER_COFFEE_MATCH;
    if (
      a.originCountry !== null &&
      b.originCountry !== null &&
      norm(a.originCountry) === norm(b.originCountry)
    ) {
      score += SCORE_PER_COFFEE_MATCH;
    }
    if (a.process !== null && a.process === b.process) score += SCORE_PER_COFFEE_MATCH;
    if (a.brewMethods.some((m) => b.brewMethods.includes(m))) score += SCORE_PER_COFFEE_MATCH;
  }

  if (
    base.minPrice > 0 &&
    Math.abs(candidate.minPrice - base.minPrice) <= base.minPrice * PRICE_BAND
  ) {
    score += SCORE_SIMILAR_PRICE;
  }

  return score;
}

/**
 * Loại chính nó và điểm 0; sắp: còn hàng trước, điểm giảm dần, đã bán giảm dần, id tăng dần
 * (xác định). Trả tối đa `limit` phần tử.
 */
export function rankRelated<T extends RelatedProfile>(
  base: RelatedProfile,
  candidates: readonly T[],
  limit: number,
): T[] {
  return candidates
    .filter((c) => c.id !== base.id)
    .map((c) => ({ c, score: scoreRelated(base, c) }))
    .filter((x) => x.score > 0)
    .sort(
      (x, y) =>
        Number(y.c.inStock) - Number(x.c.inStock) ||
        y.score - x.score ||
        y.c.soldCount - x.c.soldCount ||
        (x.c.id < y.c.id ? -1 : x.c.id > y.c.id ? 1 : 0),
    )
    .slice(0, limit)
    .map((x) => x.c);
}
