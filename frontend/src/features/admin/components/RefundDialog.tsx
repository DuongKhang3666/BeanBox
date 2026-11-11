"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Label } from "@/components/ui/Input";
import { FormError } from "@/features/auth/components/FormError";
import { ApiError } from "@/lib/api/errors";
import { formatVND } from "@/lib/format";
import type { AdminOrder, AdminPayment } from "@/types/admin";
import { refundPayment } from "../api/orders";
import { adminErrorMessage, fieldErrorsOf } from "../errors";
import { PAYMENT_PROVIDER_LABEL } from "../labels";
import { AdminModal } from "./AdminModal";

export const REFUND_NOTE_MIN = 5;
export const REFUND_NOTE_MAX = 500;

/**
 * Ghi nhận đã hoàn tiền thủ công (contract §13.7, D-015). Hệ thống không gọi cổng thanh toán:
 * admin phải hoàn tiền trên cổng trước.
 */
export function RefundDialog({
  order,
  payment,
  onRefunded,
  onClose,
}: {
  order: AdminOrder;
  payment: AdminPayment;
  onRefunded: (order: AdminOrder) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busyRef.current) return;
    const n = note.trim();
    setGeneral(null);
    if (n.length < REFUND_NOTE_MIN || n.length > REFUND_NOTE_MAX) {
      setError(`Ghi chú hoàn tiền bắt buộc, từ ${REFUND_NOTE_MIN} đến ${REFUND_NOTE_MAX} ký tự.`);
      return;
    }
    setError(undefined);
    busyRef.current = true;
    setBusy(true);
    try {
      const updated = await refundPayment(order.code, { paymentId: payment.id, note: n });
      onRefunded(updated);
    } catch (err) {
      if (err instanceof ApiError && err.code === "CONFLICT") {
        // Message của server nêu lý do cụ thể (vd. "Hãy hủy đơn trước khi hoàn tiền").
        setGeneral(err.message || adminErrorMessage(err));
      } else {
        const fe = fieldErrorsOf(err);
        if (fe.note) setError(fe.note);
        else setGeneral(adminErrorMessage(err));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <AdminModal
      title="Ghi nhận đã hoàn tiền"
      description={`Đơn ${order.code} · ${PAYMENT_PROVIDER_LABEL[payment.provider] ?? payment.provider} · ${formatVND(payment.amount)}`}
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <p className="rounded-lg border border-coffee-300 bg-cream-100 px-3 py-2 text-sm text-coffee-900">
          Hãy hoàn tiền trên cổng thanh toán trước, thao tác này chỉ ghi nhận. Hệ thống không tự
          hoàn tiền cho khách.
        </p>
        <div>
          <Label htmlFor="rf-note">Ghi chú hoàn tiền (bắt buộc)</Label>
          <textarea
            id="rf-note"
            data-autofocus
            rows={3}
            value={note}
            maxLength={REFUND_NOTE_MAX}
            placeholder="Ví dụ: Đã hoàn qua cổng VNPay, mã tham chiếu ..."
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "rf-note-err" : undefined}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-coffee-400 bg-white px-3 py-2 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600"
          />
          <FieldError id="rf-note-err">{error}</FieldError>
        </div>

        <FormError>{general}</FormError>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Đóng
          </Button>
          <Button type="submit" loading={busy}>
            Ghi nhận đã hoàn tiền
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}
