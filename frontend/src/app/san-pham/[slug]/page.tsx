import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { ErrorState } from "@/components/ui/ErrorState";
import { getProduct } from "@/features/catalog/api";
import { AddToCartPanel } from "@/features/catalog/components/AddToCartPanel";
import { Breadcrumbs, type Crumb } from "@/features/catalog/components/Breadcrumbs";
import { CoffeeProfileTable } from "@/features/catalog/components/CoffeeProfileTable";
import { ProductDescription } from "@/features/catalog/components/ProductDescription";
import { ProductGallery } from "@/features/catalog/components/ProductGallery";
import { ProductGrid } from "@/features/catalog/components/ProductGrid";
import { RatingStars } from "@/features/catalog/components/ProductCard";
import { buildProductJsonLd, serializeJsonLd } from "@/features/catalog/jsonld";
import { absoluteUrl } from "@/lib/site";
import type { ProductDetail } from "@/types/catalog";

interface Props {
  params: Promise<{ slug: string }>;
}

async function loadProduct(slug: string): Promise<ProductDetail | null | "error"> {
  try {
    return await getProduct(slug);
  } catch {
    return "error";
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (product === "error") return { title: "Sản phẩm" };
  if (!product) return { title: "Không tìm thấy sản phẩm" };

  const title = product.seo.title || product.name;
  const description = product.seo.description || product.shortDesc || product.name;
  const path = `/san-pham/${product.slug}`;
  const image = (product.images.find((i) => i.isPrimary) ?? product.images[0])?.url;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      title,
      description,
      url: absoluteUrl(path),
      locale: "vi_VN",
      ...(image ? { images: [{ url: absoluteUrl(image), alt: product.name }] } : {}),
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await loadProduct(slug);

  if (product === "error") {
    return (
      <Container className="py-12">
        <ErrorState
          title="Chưa tải được sản phẩm"
          description="Hệ thống đang bận. Vui lòng tải lại trang sau ít phút."
        />
      </Container>
    );
  }
  if (!product) notFound();

  const crumbs: Crumb[] = [
    ...product.breadcrumbs.map((b) => ({ name: b.name, href: `/danh-muc/${b.slug}` })),
    { name: product.name },
  ];

  return (
    <Container className="space-y-10 py-6">
      <script
        type="application/ld+json"
        // Nội dung do chính server dựng và đã thay "<" bằng <.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildProductJsonLd(product)) }}
      />
      <Breadcrumbs items={crumbs} />

      <div className="grid gap-8 md:grid-cols-2">
        <ProductGallery images={product.images} name={product.name} />
        <div className="space-y-4">
          {product.brand ? (
            <p className="text-sm font-medium uppercase tracking-wide text-coffee-600">
              {product.brand.name}
            </p>
          ) : null}
          <h1 className="font-serif text-3xl font-bold text-coffee-900">{product.name}</h1>
          <RatingStars avg={product.ratingAvg} count={product.ratingCount} />
          {product.shortDesc ? <p className="text-coffee-800">{product.shortDesc}</p> : null}
          <AddToCartPanel key={product.id} variants={product.variants} />
        </div>
      </div>

      {product.coffee ? (
        <section aria-labelledby="profile-heading">
          <h2
            id="profile-heading"
            className="mb-3 font-serif text-2xl font-semibold text-coffee-900"
          >
            Thông tin cà phê
          </h2>
          <div className="rounded-2xl border border-coffee-200 bg-cream-50 px-4 py-2 sm:px-6">
            <CoffeeProfileTable coffee={product.coffee} />
          </div>
        </section>
      ) : null}

      {product.description ? (
        <section aria-labelledby="desc-heading">
          <h2 id="desc-heading" className="mb-3 font-serif text-2xl font-semibold text-coffee-900">
            Mô tả sản phẩm
          </h2>
          <ProductDescription markdown={product.description} />
        </section>
      ) : null}

      {product.related.length > 0 ? (
        <section aria-labelledby="related-heading">
          <h2
            id="related-heading"
            className="mb-4 font-serif text-2xl font-semibold text-coffee-900"
          >
            Sản phẩm liên quan
          </h2>
          <ProductGrid products={product.related} />
        </section>
      ) : null}
    </Container>
  );
}
