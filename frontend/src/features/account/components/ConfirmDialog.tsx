"use client";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

/** Hộp xác nhận: focus vào nút Hủy, Esc đóng (trừ khi đang gửi), trả focus khi đóng. Nền tảng: `Dialog` (D-074). */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog title={title} description={description} size="sm" busy={busy} onClose={onCancel}>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button data-autofocus variant="outline" onClick={onCancel} disabled={busy}>
          Hủy
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
