import { getProduct } from "@/features/catalog/api";
import { fetchRasterImage, renderDefaultOg, renderProductOg } from "@/lib/og";

/** Ảnh OG của sản phẩm; slug lạ/API lỗi -> ảnh mặc định (không 500). */
export async function productOgBySlug(params: Promise<{ slug: string }>): Promise<Response> {
  try {
    const { slug } = await params;
    const product = await getProduct(slug);
    if (!product) return await renderDefaultOg();
    const primary = product.images.find((i) => i.isPrimary) ?? product.images[0];
    return await renderProductOg({
      name: product.name,
      price: product.minPrice,
      category: product.category.name,
      brand: product.brand?.name ?? null,
      imageDataUri: await fetchRasterImage(primary?.url),
    });
  } catch {
    return renderDefaultOg();
  }
}
