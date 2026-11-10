import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileView } from "@/features/account/components/ProfileView";
import { AccountSkeleton } from "@/features/account/components/AccountSkeleton";

export const metadata: Metadata = {
  title: "Tài khoản của tôi",
  robots: { index: false },
};

export default function Page() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <ProfileView />
    </Suspense>
  );
}
