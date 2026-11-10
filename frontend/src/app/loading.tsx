import { Container } from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";

export default function Loading() {
  return (
    <Container className="space-y-4 py-10">
      <Spinner className="text-moss-700" label="Đang tải nội dung" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-40 w-full" />
    </Container>
  );
}
