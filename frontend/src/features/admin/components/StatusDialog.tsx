"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label } from "@/components/ui/Input";
import { FormError } from "@/features/auth/components/FormError";
import { orderStatusLabel } from "@/features/orders/labels";
import { ApiError } from "@/lib/api/errors";
import type { AdminOrder, UpdateOrderStatusBody } from "@/types/admin";
import { updateAdminOrderStatus } from "../api/orders";
import { adminErrorMessage, fieldErrorsOf } from "../errors";
import { TRACKING_RE, type StatusActionConfig } from "../orderActions";

const FOCUSABLE = "button:not(:disabled), input:not(:disabled), textarea:not(:disabled)";

function warningsFor(order: AdminOrder, action: StatusActionConfig): string[] {
  const out: string[] = [];
  if (action.to === "CANCELLED") {
    out.push(
      "Hủy đơn sẽ hoàn lại tồn kho và hoàn lượt dùng mã giảm giá (nếu có). Không thể hoàn tác.",
    );
    if (order.paymentMethod !== "COD" && order.paymentStatus === "PAID") {
      out.push(
        "Đơn đã thanh toán online. Hệ thống chưa tự hoàn tiền, bạn cần hoàn tiền cho khách thủ công.",
      );
    }
  }
  if (action.to === "DELIVERED" && order.paymentMethod === "COD") {
    out.push("Đơn COD sẽ được ghi nhận là đã thanh toán khi chuyển sang Đã giao.");
  }
  return out;
}

/**
 * Hộp thoại đổi trạng thái đơn. Focus trap, Esc đóng, trả focus khi đóng.
 * `onStale`: server báo đơn đã đổi (409) -> cha đóng hộp thoại, báo lỗi và tải lại.
 */
export function StatusDialog({
  order,
  action,
  onUpdated,
  onStale,
  onClose,
}: {
  order: AdminOrder;
  action: StatusActionConfig;
  onUpdated: (order: AdminOrder) => void;
  onStale: (message: string) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [tracking, setTracking] = useState(action.showTracking ? (order.trackingNumber ?? "") : "");
  const [carrier, setCarrier] = useState(action.showTracking ? (order.carrier ?? "") : "");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    box?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === "Tab" && box) {
        const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    const t = tracking.trim();
    const c = carrier.trim();
    const n = note.trim();
    if (action.showTracking) {
      if (!t) {
        if (action.trackingRequired) e.trackingNumber = "Vui lòng nhập mã vận đơn.";
      } else if (t.length > 50) e.trackingNumber = "Mã vận đơn tối đa 50 ký tự.";
      else if (!TRACKING_RE.test(t))
        e.trackingNumber = "Mã vận đơn chỉ gồm chữ, số và dấu gạch ngang.";
      if (c.length > 50) e.carrier = "Đơn vị vận chuyển tối đa 50 ký tự.";
    }
    if (action.noteRequired && !n) e.note = "Vui lòng nhập lý do.";
    else if (n.length > 500) e.note = "Ghi chú tối đa 500 ký tự.";
    return e;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busyRef.current) return;
    const found = validate();
    setErrors(found);
    setGeneral(null);
    if (Object.keys(found).length > 0) return;

    const body: UpdateOrderStatusBody = {
      toStatus: action.to,
      fromStatus: order.status,
    };
    if (note.trim()) body.note = note.trim();
    if (action.showTracking) {
      if (tracking.trim()) body.trackingNumber = tracking.trim();
      if (carrier.trim()) body.carrier = carrier.trim();
    }

    busyRef.current = true;
    setBusy(true);
    try {
      const updated = await updateAdminOrderStatus(order.code, body);
      onUpdated(updated);
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === "CONFLICT" || err.code === "INVALID_STATUS_TRANSITION")
      ) {
        onStale(adminErrorMessage(err));
        return;
      }
      const fe = fieldErrorsOf(err);
      const shown: Record<string, string> = {};
      for (const k of ["trackingNumber", "carrier", "note"]) if (fe[k]) shown[k] = fe[k];
      setErrors(shown);
      setGeneral(Object.keys(shown).length > 0 ? null : adminErrorMessage(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const warnings = warningsFor(order, action);
  const noteLabel = action.noteRequired
    ? action.to === "CANCELLED"
      ? "Lý do hủy (bắt buộc)"
      : "Lý do (bắt buộc)"
    : "Ghi chú (không bắt buộc)";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-coffee-900/50 p-4 sm:items-center">
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 id={titleId} className="font-serif text-lg font-bold text-coffee-900">
          {action.label}
        </h2>
        <p className="mt-1 text-sm text-coffee-800">
          Đơn {order.code}: {orderStatusLabel(order.status)} → {orderStatusLabel(action.to)}
        </p>

        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
          {warnings.map((w) => (
            <p
              key={w}
              className="rounded-lg border border-coffee-300 bg-cream-100 px-3 py-2 text-sm text-coffee-900"
            >
              {w}
            </p>
          ))}

          {action.showTracking ? (
            <>
              <div>
                <Label htmlFor="st-tracking">
                  Mã vận đơn{action.trackingRequired ? " (bắt buộc)" : ""}
                </Label>
                <Input
                  id="st-tracking"
                  data-autofocus
                  value={tracking}
                  maxLength={50}
                  autoComplete="off"
                  invalid={Boolean(errors.trackingNumber)}
                  aria-describedby={errors.trackingNumber ? "st-tracking-err" : undefined}
                  onChange={(e) => setTracking(e.target.value)}
                />
                <FieldError id="st-tracking-err">{errors.trackingNumber}</FieldError>
              </div>
              <div>
                <Label htmlFor="st-carrier">Đơn vị vận chuyển (không bắt buộc)</Label>
                <Input
                  id="st-carrier"
                  value={carrier}
                  maxLength={50}
                  autoComplete="off"
                  invalid={Boolean(errors.carrier)}
                  aria-describedby={errors.carrier ? "st-carrier-err" : undefined}
                  onChange={(e) => setCarrier(e.target.value)}
                />
                <FieldError id="st-carrier-err">{errors.carrier}</FieldError>
              </div>
            </>
          ) : null}

          <div>
            <Label htmlFor="st-note">{noteLabel}</Label>
            <textarea
              id="st-note"
              data-autofocus={action.showTracking ? undefined : true}
              rows={3}
              value={note}
              maxLength={500}
              aria-invalid={errors.note ? true : undefined}
              aria-describedby={errors.note ? "st-note-err" : undefined}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-coffee-400 bg-white px-3 py-2 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600"
            />
            <FieldError id="st-note-err">{errors.note}</FieldError>
          </div>

          <FormError>{general}</FormError>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Đóng
            </Button>
            <Button type="submit" variant={action.danger ? "danger" : "primary"} loading={busy}>
              {action.label}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
