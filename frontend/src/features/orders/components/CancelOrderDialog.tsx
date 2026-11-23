"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

export const CANCEL_REASON_MAX = 255;

/** Hộp hủy đơn: lý do tùy chọn (<= 255 ký tự). Focus vào ô lý do, Esc đóng, trả focus khi đóng (nền tảng `Dialog`, D-074). */
export function CancelOrderDialog({
  code,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  code: string;
  busy?: boolean;
  /** Lỗi từ lần hủy trước (hiển thị trong hộp). */
  error?: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const areaId = useId();
  const [reason, setReason] = useState("");

  return (
    <Dialog
      title={`Hủy đơn hàng ${code}?`}
      description="Sau khi hủy, đơn hàng không thể khôi phục. Sản phẩm sẽ được hoàn lại kho."
      busy={busy}
      onClose={onCancel}
    >
      <label htmlFor={areaId} className="mt-4 block text-sm font-medium text-coffee-900">
        Lý do hủy (không bắt buộc)
      </label>
      <textarea
        id={areaId}
        data-autofocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={CANCEL_REASON_MAX}
        rows={3}
        disabled={busy}
        className="mt-1.5 w-full rounded-lg border border-coffee-400 bg-white px-3 py-2 text-base text-coffee-900"
      />
      <p className="mt-1 text-right text-xs text-coffee-700">
        {reason.length}/{CANCEL_REASON_MAX}
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger-600">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Giữ đơn hàng
        </Button>
        <Button variant="danger" onClick={() => onConfirm(reason.trim())} loading={busy}>
          Xác nhận hủy đơn
        </Button>
      </div>
    </Dialog>
  );
}
