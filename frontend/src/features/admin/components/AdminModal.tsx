"use client";

import { Dialog } from "@/components/ui/Dialog";

/**
 * Hộp thoại cho form admin: nền tảng là `Dialog` dùng chung (D-074): tiêu đề, Esc đóng (trừ khi busy),
 * trả focus về nút mở. Phần tử có data-autofocus nhận focus đầu, nếu không thì phần tử tương tác đầu tiên.
 */
export function AdminModal({
  title,
  description,
  busy,
  wide,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  busy?: boolean;
  /** Hộp thoại rộng (bảng xem trước nhập CSV). */
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog
      title={title}
      description={description}
      descriptionClassName="mt-1 text-sm text-coffee-800"
      size={wide ? "wide" : "md"}
      busy={busy}
      onClose={onClose}
    >
      <div className="mt-4">{children}</div>
    </Dialog>
  );
}
