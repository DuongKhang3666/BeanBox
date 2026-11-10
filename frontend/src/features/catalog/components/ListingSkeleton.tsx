import { Container } from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/Skeleton";
import { ProductGridSkeleton } from "./ProductGrid";

export function ListingSkeleton() {
  return (
    <Container className="space-y-6 py-6">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-9 w-64" />
      <div className="flex flex-col gap-6 lg:flex-row">
        <Skeleton className="h-11 w-full lg:h-96 lg:w-64 lg:shrink-0" />
        <div className="flex-1">
          <ProductGridSkeleton count={8} />
        </div>
      </div>
    </Container>
  );
}
