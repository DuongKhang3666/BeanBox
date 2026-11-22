import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  getBrands,
  getCategories,
  getCoffeeOrigins,
  getProducts,
  lookupCategory,
} from "@/features/catalog/api";
import { Breadcrumbs, type Crumb } from "@/features/catalog/components/Breadcrumbs";
import { ListingNavigationProvider } from "@/features/catalog/components/ListingNavigation";
import { FilterPanel } from "@/features/catalog/components/FilterPanel";
import { ProductResults } from "@/features/catalog/components/ProductResults";
import { parseFilters, toApiQuery, type RawSearchParams } from "@/features/catalog/filters";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildBreadcrumbJsonLd, buildItemListJsonLd } from "@/features/catalog/jsonld";
import { listingCanonicalAndRobots } from "@/features/catalog/listingSeo";
import { absoluteUrl, COFFEE_BEANS_SLUG, DEFAULT_OG_IMAGE } from "@/lib/site";
import { redirectIfMoved } from "@/lib/slugRedirect";
import type { CategoryChild, CategoryDetail, CategoryNode } from "@/types/catalog";

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

type Found = ReturnType<typeof findCategory>;

/** Dựng kết quả từ GET /categories/:slug khi cây (cache 5 phút) chưa có danh mục. */
function fromDetail(d: CategoryDetail): NonNullable<Found> {
  const children: CategoryChild[] = d.children.map((c) => ({
    id: c.slug,
    name: c.name,
    slug: c.slug,
    imageUrl: null,
    productCount: 0,
  }));
  const self: CategoryNode = {
    id: d.id,
    name: d.name,
    slug: d.slug,
    imageUrl: d.imageUrl,
    productCount: 0,
    children,
  };
  const parent: CategoryNode | null = d.parent
    ? {
        id: d.parent.slug,
        name: d.parent.name,
        slug: d.parent.slug,
        imageUrl: null,
        productCount: 0,
        children: [],
      }
    : null;
  const asChild: CategoryChild = {
    id: d.id,
    name: d.name,
    slug: d.slug,
    imageUrl: d.imageUrl,
    productCount: 0,
  };
  return { category: parent ? asChild : self, parent };
}

/**
 * Tìm danh mục: cây trước; không có thì hỏi GET /categories/:slug để bắt slug cũ (308) hoặc danh mục mới.
 * `null` = 404 thường. Lỗi của endpoint này (không phải 404) coi như không tìm thấy.
 */
async function resolveCategory(tree: CategoryNode[], slug: string): Promise<Found> {
  const hit = findCategory(tree, slug);
  if (hit) return hit;
  let lookup;
  try {
    lookup = await lookupCategory(slug);
  } catch {
    return null;
  }
  const result = redirectIfMoved(lookup, "/danh-muc");
  return result.status === "ok" ? fromDetail(result.data) : null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, rawSearch] = await Promise.all([params, searchParams]);
  const path = `/danh-muc/${slug}`;
  let tree: CategoryNode[];
  try {
    tree = await getCategories();
  } catch {
    // API lỗi: trang trả ErrorState nên không cho index (D-059).
    return {
      title: "Danh mục sản phẩm",
      alternates: { canonical: path },
      robots: { index: false, follow: false },
    };
  }
  // Ngoài try: slug cũ ném NEXT_REDIRECT (308) và không được bị nuốt.
  const found = await resolveCategory(tree, slug);
  if (!found) return { title: "Không tìm thấy danh mục" };
  const name = found.category.name;
  const description = `Mua ${name.toLowerCase()} chính hãng tại BeanBox: nhiều lựa chọn, giá rõ ràng, giao hàng toàn quốc.`;
  return {
    title: name,
    description,
    ...listingCanonicalAndRobots(path, rawSearch),
    // Metadata con thay hẳn openGraph của cha nên phải nêu lại ảnh: dùng ảnh OG mặc định (D-064).
    openGraph: {
      type: "website",
      title: name,
      description,
      url: absoluteUrl(path),
      locale: "vi_VN",
      images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: `${name} - BeanBox` }],
    },
    twitter: {
      card: "summary_large_image",
      title: name,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
  };
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

  const found = await resolveCategory(catRes.value, slug);
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
      <JsonLd
        data={buildBreadcrumbJsonLd([
          ...(parent ? [{ name: parent.name, path: `/danh-muc/${parent.slug}` }] : []),
          { name: category.name, path: pathname },
        ])}
      />
      {productRes.status === "fulfilled" && productRes.value.items.length > 0 ? (
        <JsonLd
          data={buildItemListJsonLd(
            productRes.value.items.map((p) => ({
              path: `/san-pham/${p.slug}`,
              name: p.name,
            })),
            (productRes.value.meta.page - 1) * productRes.value.meta.pageSize + 1,
          )}
        />
      ) : null}
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

      <ListingNavigationProvider>
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
      </ListingNavigationProvider>
    </Container>
  );
}
