"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FormNotice } from "@/features/auth/components/FormError";
import { useAuth } from "@/features/auth/AuthProvider";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { EmailCard } from "./EmailCard";
import { ProfileForm } from "./ProfileForm";

export function ProfileView() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  // Chụp cờ ngay lúc mount: sau khi xóa query thì thông báo vẫn còn.
  const [justRegistered] = useState(() => params.get("registered") === "1");

  useEffect(() => {
    if (justRegistered) router.replace("/tai-khoan");
  }, [justRegistered, router]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-bold text-coffee-900 sm:text-3xl">Hồ sơ của tôi</h1>
      {justRegistered ? (
        <FormNotice>
          Đăng ký thành công. Chúng tôi đã gửi email xác thực tới {user.email}. Vui lòng kiểm tra
          hộp thư (kể cả thư rác) và bấm vào liên kết để xác thực.
        </FormNotice>
      ) : null}
      <EmailCard />
      <ProfileForm />
      <ChangePasswordForm />
    </div>
  );
}
