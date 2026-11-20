import { getBoughtTogether } from "@/features/catalog/api";
import type { ProductListItem } from "@/types/catalog";
import { ProductGrid } from "./ProductGrid";

/** Thuần trình bày: rỗng thì không render gì (không heading, không ErrorState). */
export function BoughtTogetherSection({ products }: { products: ProductListItem[] }) {
  if (products.length === 0) return null;
  return (
    <section aria-labelledby="bought-together-heading">
      <h2
        id="bought-together-heading"
        className="mb-4 font-serif text-2xl font-semibold text-coffee-900"
      >
        Thường được mua cùng
      </h2>
      <ProductGrid products={products} />
    </section>
  );
}

/** Server Component: lấy dữ liệu (lỗi -> rỗng) rồi hiển thị. */
export async function BoughtTogether({ slug }: { slug: string }) {
  const products = await getBoughtTogether(slug);
  return <BoughtTogetherSection products={products} />;
}
