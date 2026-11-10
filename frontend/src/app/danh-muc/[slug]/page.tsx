import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { ErrorState } from "@/components/ui/ErrorState";
import { getBrands, getCategories, getCoffeeOrigins, getProducts } from "@/features/catalog/api";
import { Breadcrumbs, type Crumb } from "@/features/catalog/components/Breadcrumbs";
import { FilterPanel } from "@/features/catalog/components/FilterPanel";
import { ProductResults } from "@/features/catalog/components/ProductResults";
import { parseFilters, toApiQuery, type RawSearchParams } from "@/features/catalog/filters";
import { COFFEE_BEANS_SLUG } from "@/lib/site";
import type { CategoryChild, CategoryNode } from "@/types/catalog";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

function findCategory(
  tree: CategoryNode[],
  slug: string,
): { category: CategoryChild | CategoryNode; parent: CategoryNode | null } | null {
  for (const root of tree) {
    if (root.slug === slug) return { category: root, parent: null };
    const child = root.children.find((c) => c.slug === slug);
    if (child) return { category: child, parent: root };
  }
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const path = `/danh-muc/${slug}`;
  try {
    const found = findCategory(await getCategories(), slug);
    if (!found) return { title: "Không tìm thấy danh mục" };
    const name = found.category.name;
    return {
      title: name,
      description: `Mua ${name.toLowerCase()} chính hãng tại BeanBox: nhiều lựa chọn, giá rõ ràng, giao hàng toàn quốc.`,
      alternates: { canonical: path },
    };
  } catch {
    return { title: "Danh mục sản phẩm", alternates: { canonical: path } };
  }
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, rawSearch] = await Promise.all([params, searchParams]);
  const filters = parseFilters(rawSearch);
  const pathname = `/danh-muc/${slug}`;

  const [catRes, brandRes, productRes] = await Promise.allSettled([
    getCategories(),
    getBrands(),
    getProducts(toApiQuery(filters, slug)),
  ]);

  if (catRes.status === "rejected") {
    return (
      <Container className="py-12">
        <ErrorState
          title="Chưa tải được danh mục"
          description="Hệ thống đang bận. Vui lòng tải lại trang sau ít phút."
        />
      </Container>
    );
  }

  const found = findCategory(catRes.value, slug);
  if (!found) notFound();
  const { category, parent } = found;
  const root = parent ?? (category as CategoryNode);
  const isCoffeeTree = root.slug === COFFEE_BEANS_SLUG;
  const subcategories = parent ? [] : ((category as CategoryNode).children ?? []);

  let origins: string[] = [];
  if (isCoffeeTree) {
    try {
      origins = await getCoffeeOrigins(COFFEE_BEANS_SLUG);
    } catch {
      origins = [];
    }
  }

  const crumbs: Crumb[] = parent
    ? [{ name: parent.name, href: `/danh-muc/${parent.slug}` }, { name: category.name }]
    : [{ name: category.name }];

  return (
    <Container className="space-y-5 py-6">
      <Breadcrumbs items={crumbs} />
      <h1 className="font-serif text-3xl font-bold text-coffee-900">{category.name}</h1>

      {subcategories.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Danh mục con">
          {subcategories.map((c) => (
            <li key={c.id}>
              <Link
                href={`/danh-muc/${c.slug}`}
                className="inline-flex min-h-11 items-center rounded-full border border-coffee-300 bg-white px-4 text-sm font-medium text-coffee-800 hover:bg-moss-50"
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row">
        <FilterPanel
          pathname={pathname}
          filters={filters}
          subcategories={subcategories}
          brands={brandRes.status === "fulfilled" ? brandRes.value : []}
          showCoffeeFilters={isCoffeeTree}
          origins={origins}
        />
        {productRes.status === "fulfilled" ? (
          <ProductResults
            pathname={pathname}
            filters={filters}
            items={productRes.value.items}
            meta={productRes.value.meta}
          />
        ) : (
          <div className="min-w-0 flex-1">
            <ErrorState
              title="Chưa tải được danh sách sản phẩm"
              description="Vui lòng tải lại trang hoặc thử lại sau ít phút."
            />
          </div>
        )}
      </div>
    </Container>
  );
}
