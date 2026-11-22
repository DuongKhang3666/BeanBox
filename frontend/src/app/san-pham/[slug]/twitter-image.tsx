import { productOgBySlug } from "@/features/catalog/productOg";

export const runtime = "nodejs";
export const alt = "Sản phẩm tại BeanBox";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image({ params }: { params: Promise<{ slug: string }> }) {
  return productOgBySlug(params);
}
