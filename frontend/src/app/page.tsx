import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

function ProductCardSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-coffee-200 bg-cream-50 p-3">
      <Skeleton className="aspect-square w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}

export default function HomePage() {
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
              href="/danh-muc/hat-ca-phe"
              variant="primary"
              size="lg"
              className="bg-cream-100 !text-coffee-900 hover:!bg-white"
            >
              Khám phá hạt cà phê
            </ButtonLink>
            <ButtonLink
              href="/danh-muc/dung-cu-pha-che"
              variant="outline"
              size="lg"
              className="!border-cream-200 !text-cream-50 hover:!bg-coffee-700"
            >
              Dụng cụ pha chế
            </ButtonLink>
          </div>
        </Container>
      </section>

      <section aria-labelledby="featured-heading" className="py-12">
        <Container>
          <h2 id="featured-heading" className="font-serif text-2xl font-semibold text-coffee-900">
            Sản phẩm nổi bật
          </h2>
          <p className="mt-1 text-coffee-700">
            Danh sách sản phẩm sẽ được kết nối dữ liệu thật ở giai đoạn M1.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        </Container>
      </section>

      <section aria-labelledby="new-heading" className="pb-4">
        <Container>
          <h2 id="new-heading" className="font-serif text-2xl font-semibold text-coffee-900">
            Hàng mới về
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
