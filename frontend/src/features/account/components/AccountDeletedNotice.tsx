"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Container } from "@/components/ui/Container";

/** Thông báo trên trang chủ sau khi khách tự xóa tài khoản (?tai-khoan=da-xoa). Có thể đóng. */
export function AccountDeletedNotice() {
  const params = useSearchParams();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || params?.get("tai-khoan") !== "da-xoa") return null;
  return (
    <div role="status" className="border-b border-moss-200 bg-moss-50 py-3 text-sm text-moss-800">
      <Container className="flex items-start justify-between gap-3">
        <p>Tài khoản của bạn đã được xóa. Cảm ơn bạn đã đồng hành cùng BeanBox, hẹn gặp lại bạn.</p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 font-medium underline"
        >
          Đóng
        </button>
      </Container>
    </div>
  );
}
