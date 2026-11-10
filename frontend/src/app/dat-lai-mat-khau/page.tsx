import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/features/auth/components/ResetPasswordForm";
import { AuthFallback } from "@/features/auth/components/AuthFallback";

export const metadata: Metadata = {
  title: "Đặt lại mật khẩu",
  description: "Đặt mật khẩu mới cho tài khoản BeanBox.",
  robots: { index: false },
};

export default function Page() {
  return (
    <Suspense fallback={<AuthFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
