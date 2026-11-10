"use client";

import { useEffect } from "react";
import { Container } from "@/components/ui/Container";
import { ErrorState } from "@/components/ui/ErrorState";
import { ButtonLink } from "@/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="py-16">
      <ErrorState
        title="Hệ thống đang gặp sự cố"
        description="Rất tiếc, đã có lỗi ngoài ý muốn. Bạn vui lòng thử lại, hoặc quay về trang chủ."
        onRetry={reset}
      />
      <div className="mt-6 text-center">
        <ButtonLink href="/" variant="ghost">
          Về trang chủ
        </ButtonLink>
      </div>
    </Container>
  );
}
