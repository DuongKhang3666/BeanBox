import Link from "next/link";
import { connection } from "next/server";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { getCategories, getProducts } from "@/features/catalog/api";
import { ProductGrid } from "@/features/catalog/components/ProductGrid";
import { ROOT_CATEGORY_SLUGS } from "@/lib/site";

/** Trang chủ cần API lúc chạy; không prerender lúc build (build phải qua được khi backend tắt). */
export default async function HomePage() {
  await connection();

  const [categories, featured, newest, bestseller] = await Promise.allSettled([
    getCategories(),
    getProducts({ featured: true, pageSize: 8 }),
    getProducts({ sort: "newest", pageSize: 8 }),
    getProducts({ sort: "bestseller", pageSize: 4 }),
  ]);

  return (
    <>
      <section className="bg-coffee-800 text-cream-50">
        <Container className="py-14 sm:py-20">
          <p className="text-sm font-medium uppercase tracking-widest text-cream-300">
            Cà phê · Dụng cụ · Phụ kiện
          </p>
          <h1 className="mt-3 max-w-2xl font-serif text-3xl font-bold leading-tight sm:text-5xl">
            Mỗi buổi sáng đáng nhớ bắt đầu từ một tách cà phê ngon
          </h1>
          <p className="mt-4 max-w-xl text-lg text-cream-200">
            Chọn hạt rang tươi, dụng cụ pha chế và phụ kiện phù hợp với cách bạn thưởng thức cà phê.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink
              href={`/danh-muc/${ROOT_CATEGORY_SLUGS[0]}`}
              variant="primary"
              size="lg"
              className="bg-cream-100 !text-coffee-900 hover:!bg-white"
            >
              Khám phá cà phê hạt
            </ButtonLink>
            <ButtonLink
              href={`/danh-muc/${ROOT_CATEGORY_SLUGS[1]}`}
              variant="outline"
              size="lg"
              className="!border-cream-200 !text-cream-50 hover:!bg-coffee-700"
            >
              Dụng cụ pha chế
            </ButtonLink>
          </div>
        </Container>
      </section>

      <Section id="categories" title="Danh mục">
        {categories.status === "fulfilled" ? (
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {categories.value.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/danh-muc/${c.slug}`}
                  className="flex h-full flex-col justify-between gap-2 rounded-2xl border border-coffee-200 bg-cream-50 p-4 transition-colors hover:border-moss-600 hover:bg-moss-50"
                >
                  <span className="font-serif text-lg font-semibold text-coffee-900">{c.name}</span>
                  <span className="text-sm text-coffee-700">{c.productCount} sản phẩm</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <SectionError />
        )}
      </Section>

      <Section id="featured" title="Sản phẩm nổi bật">
        <ProductSection result={featured} emptyText="Chưa có sản phẩm nổi bật." />
      </Section>

      <Section id="new" title="Hàng mới về">
        <ProductSection result={newest} emptyText="Chưa có sản phẩm mới." />
      </Section>

      <Section id="bestseller" title="Bán chạy" last>
        <ProductSection result={bestseller} emptyText="Chưa có dữ liệu bán chạy." />
      </Section>
    </>
  );
}

function Section({
  id,
  title,
  last = false,
  children,
}: {
  id: string;
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className={last ? "pb-14 pt-10" : "pt-10"}>
      <Container>
        <h2 id={`${id}-heading`} className="mb-5 font-serif text-2xl font-semibold text-coffee-900">
          {title}
        </h2>
        {children}
      </Container>
    </section>
  );
}

function SectionError() {
  return (
    <ErrorState title="Chưa tải được mục này" description="Vui lòng tải lại trang sau ít phút." />
  );
}

function ProductSection({
  result,
  emptyText,
}: {
  result: PromiseSettledResult<Awaited<ReturnType<typeof getProducts>>>;
  emptyText: string;
}) {
  if (result.status === "rejected") return <SectionError />;
  if (result.value.items.length === 0) return <p className="text-coffee-700">{emptyText}</p>;
  return <ProductGrid products={result.value.items} />;
}
