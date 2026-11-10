import type { Metadata } from "next";
import { Suspense } from "react";
import { RegisterForm } from "@/features/auth/components/RegisterForm";
import { AuthFallback } from "@/features/auth/components/AuthFallback";

export const metadata: Metadata = {
  title: "Đăng ký",
  description: "Tạo tài khoản BeanBox.",
  robots: { index: false },
};

export default function Page() {
  return (
    <Suspense fallback={<AuthFallback />}>
      <RegisterForm />
    </Suspense>
  );
}
