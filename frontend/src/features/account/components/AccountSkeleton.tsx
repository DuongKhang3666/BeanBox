import { Skeleton } from "@/components/ui/Skeleton";

export function AccountSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Đang tải"
      className="space-y-4"
      data-testid="account-skeleton"
    >
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-12 w-40" />
    </div>
  );
}
