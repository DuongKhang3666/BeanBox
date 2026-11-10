import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmail } from "@/features/auth/components/VerifyEmail";
import { AuthFallback } from "@/features/auth/components/AuthFallback";

export const metadata: Metadata = {
  title: "Xác thực email",
  description: "Xác thực địa chỉ email tài khoản BeanBox.",
  robots: { index: false },
};

export default function Page() {
  return (
    <Suspense fallback={<AuthFallback />}>
      <VerifyEmail />
    </Suspense>
  );
}
