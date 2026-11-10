import type { Metadata } from "next";
import { Suspense } from "react";
import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm";
import { AuthFallback } from "@/features/auth/components/AuthFallback";

export const metadata: Metadata = {
  title: "Quên mật khẩu",
  description: "Nhận hướng dẫn đặt lại mật khẩu qua email.",
  robots: { index: false },
};

export default function Page() {
  return (
    <Suspense fallback={<AuthFallback />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
