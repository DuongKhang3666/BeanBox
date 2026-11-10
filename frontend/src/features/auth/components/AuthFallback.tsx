import { Container } from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/Skeleton";

/** Fallback cho <Suspense> quanh các form dùng useSearchParams. */
export function AuthFallback() {
  return (
    <Container className="py-8 sm:py-12" aria-busy="true">
      <div className="mx-auto w-full max-w-md space-y-4 rounded-2xl border border-coffee-200 bg-white p-5 sm:p-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </Container>
  );
}
