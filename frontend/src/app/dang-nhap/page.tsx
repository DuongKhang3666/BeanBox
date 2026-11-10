import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { AuthFallback } from "@/features/auth/components/AuthFallback";

export const metadata: Metadata = {
  title: "Đăng nhập",
  description: "Đăng nhập tài khoản BeanBox.",
  robots: { index: false },
};

export default function Page() {
  return (
    <Suspense fallback={<AuthFallback />}>
      <LoginForm />
    </Suspense>
  );
}
