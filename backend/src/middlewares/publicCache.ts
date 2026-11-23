import type { RequestHandler } from 'express';

/**
 * D-075: catalog công khai (danh sách/chi tiết/so sánh/mua kèm/danh mục/thương hiệu/gợi ý tìm kiếm).
 * Các endpoint này KHÔNG đọc người gọi (không optionalAuth, không giá/wishlist theo user) nên cache được.
 * Header đặt trước handler; mọi đường lỗi (errorHandler, notFound) ghi đè về `no-store`.
 */
export const PUBLIC_CATALOG_CACHE_CONTROL =
  'public, max-age=30, s-maxage=60, stale-while-revalidate=120';

export const publicCatalogCache: RequestHandler = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    res.setHeader('Cache-Control', PUBLIC_CATALOG_CACHE_CONTROL);
  }
  next();
};
