import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { getBrands, getCoffeeOrigins, getProducts } from "@/features/catalog/api";
import { Breadcrumbs } from "@/features/catalog/components/Breadcrumbs";
import { FilterPanel } from "@/features/catalog/components/FilterPanel";
import { ProductResults } from "@/features/catalog/components/ProductResults";
import { parseFilters, toApiQuery, type RawSearchParams } from "@/features/catalog/filters";
import { COFFEE_BEANS_SLUG } from "@/lib/site";

interface Props {
  searchParams: Promise<RawSearchParams>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = parseFilters(await searchParams);
  return {
    title: q ? `Kết quả tìm kiếm cho "${q}"` : "Tìm kiếm sản phẩm",
    description: "Tìm hạt cà phê, dụng cụ pha chế và phụ kiện tại BeanBox.",
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const filters = parseFilters(await searchParams);
  const pathname = "/tim-kiem";

  if (!filters.q) {
    return (
      <Container className="space-y-5 py-6">
        <Breadcrumbs items={[{ name: "Tìm kiếm" }]} />
        <h1 className="font-serif text-3xl font-bold text-coffee-900">Tìm kiếm sản phẩm</h1>
        <EmptyState
          title="Nhập từ khóa để tìm sản phẩm"
          description="Ví dụ: ethiopia, phin, bình pha, cold brew. Bạn có thể gõ không dấu."
        />
      </Container>
    );
  }

  const [brandRes, productRes, originRes] = await Promise.allSettled([
    getBrands(),
    getProducts(toApiQuery(filters)),
    getCoffeeOrigins(COFFEE_BEANS_SLUG),
  ]);

  return (
    <Container className="space-y-5 py-6">
      <Breadcrumbs items={[{ name: "Tìm kiếm" }]} />
      <h1 className="font-serif text-3xl font-bold text-coffee-900">
        Kết quả cho &ldquo;{filters.q}&rdquo;
      </h1>
      <div className="flex flex-col gap-6 lg:flex-row">
        <FilterPanel
          pathname={pathname}
          filters={filters}
          brands={brandRes.status === "fulfilled" ? brandRes.value : []}
          showCoffeeFilters
          origins={originRes.status === "fulfilled" ? originRes.value : []}
        />
        {productRes.status === "fulfilled" ? (
          <ProductResults
            pathname={pathname}
            filters={filters}
            items={productRes.value.items}
            meta={productRes.value.meta}
            emptyDescription="Hãy kiểm tra chính tả, thử từ khóa ngắn hơn (ví dụ: “ethiopia”, “phin”) hoặc bỏ bớt bộ lọc."
          />
        ) : (
          <div className="min-w-0 flex-1">
            <ErrorState
              title="Chưa tải được kết quả tìm kiếm"
              description="Vui lòng thử lại sau ít phút."
            />
          </div>
        )}
      </div>
    </Container>
  );
}
