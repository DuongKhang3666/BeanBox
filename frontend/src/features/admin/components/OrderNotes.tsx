"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Label } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { FormError } from "@/features/auth/components/FormError";
import { useResource } from "@/features/orders/useResource";
import { ApiError } from "@/lib/api/errors";
import type { AdminOrderNote } from "@/types/admin";
import { addOrderNote, deleteOrderNote, listOrderNotes } from "../api/orders";
import { adminErrorMessage, fieldErrorsOf } from "../errors";
import { formatVnDateTime } from "../format";

export const ORDER_NOTE_MAX = 2000;

const ROLE_LABEL = { CUSTOMER: "Khách hàng", STAFF: "Nhân viên", ADMIN: "Quản trị viên" } as const;

const load = (code: string) => listOrderNotes(code);

/**
 * D-071: ghi chú nội bộ của nhân viên trên đơn. Append-only: chỉ thêm; Admin xóa được.
 * Nội dung hiển thị dạng văn bản thuần (React tự escape), giữ xuống dòng.
 */
export function OrderNotes({ code }: { code: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const res = useResource(code, load);
  const [body, setBody] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busyRef.current) return;
    const text = body.trim();
    setGeneral(null);
    if (text.length === 0) {
      setFieldError("Vui lòng nhập nội dung ghi chú.");
      return;
    }
    if (text.length > ORDER_NOTE_MAX) {
      setFieldError(`Ghi chú tối đa ${ORDER_NOTE_MAX} ký tự.`);
      return;
    }
    setFieldError(undefined);
    busyRef.current = true;
    setBusy(true);
    try {
      const created = await addOrderNote(code, text);
      res.setData([...(res.data ?? []), created]);
      setBody("");
    } catch (err) {
      const fe = fieldErrorsOf(err);
      if (fe.body) setFieldError(fe.body);
      else setGeneral(adminErrorMessage(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function onDelete(note: AdminOrderNote) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setGeneral(null);
    try {
      await deleteOrderNote(code, note.id);
      res.setData((res.data ?? []).filter((n) => n.id !== note.id));
      setConfirmId(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        res.setData((res.data ?? []).filter((n) => n.id !== note.id));
        setConfirmId(null);
      } else {
        setGeneral(adminErrorMessage(err));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  let list: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") {
    list = (
      <div aria-busy="true" aria-label="Đang tải ghi chú" role="status">
        <Skeleton className="h-12 w-full" />
      </div>
    );
  } else if (res.status === "error") {
    list = (
      <div role="alert" className="space-y-2 text-sm text-danger-600">
        <p>{adminErrorMessage(res.error)}</p>
        <Button size="sm" variant="outline" onClick={res.retry}>
          Thử lại
        </Button>
      </div>
    );
  } else if (res.data!.length === 0) {
    list = <p className="text-coffee-700">Chưa có ghi chú nội bộ nào.</p>;
  } else {
    list = (
      <ul aria-label="Danh sách ghi chú nội bộ" className="space-y-3">
        {res.data!.map((n) => (
          <li key={n.id} className="rounded-lg border border-coffee-200 bg-cream-50 p-3">
            <p className="whitespace-pre-line break-words text-coffee-900">{n.body}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-coffee-700">
              <span>
                {n.author
                  ? `${n.author.fullName} (${ROLE_LABEL[n.author.role] ?? n.author.role})`
                  : "Tài khoản đã xóa"}
                {" · "}
                {formatVnDateTime(n.createdAt)}
              </span>
              {isAdmin ? (
                confirmId === n.id ? (
                  <span className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      loading={busy}
                      onClick={() => onDelete(n)}
                      aria-label="Xác nhận xóa ghi chú"
                    >
                      Xác nhận xóa
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setConfirmId(null)}
                    >
                      Hủy
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmId(n.id)}
                    aria-label={`Xóa ghi chú của ${n.author?.fullName ?? "tài khoản đã xóa"}`}
                  >
                    Xóa
                  </Button>
                )
              ) : null}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section
      aria-label="Ghi chú nội bộ"
      className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5"
    >
      <h2 className="font-serif text-lg font-bold text-coffee-900">Ghi chú nội bộ</h2>
      <p className="text-sm text-coffee-700">
        Chỉ nhân viên nhìn thấy, khách hàng không bao giờ thấy. Ghi chú không thể sửa sau khi lưu.
      </p>
      {list}
      <form onSubmit={onSubmit} noValidate className="space-y-2">
        <Label htmlFor="on-body">Thêm ghi chú</Label>
        <textarea
          id="on-body"
          rows={3}
          value={body}
          maxLength={ORDER_NOTE_MAX}
          placeholder="Ví dụ: Đã gọi khách xác nhận địa chỉ"
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? "on-body-err" : undefined}
          onChange={(e) => setBody(e.target.value)}
          className="w-full rounded-lg border border-coffee-400 bg-white px-3 py-2 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600"
        />
        <div className="flex items-start justify-between gap-3">
          <FieldError id="on-body-err">{fieldError}</FieldError>
          <span className="ml-auto shrink-0 text-xs text-coffee-700">
            {body.length}/{ORDER_NOTE_MAX}
          </span>
        </div>
        <FormError>{general}</FormError>
        <Button type="submit" loading={busy && confirmId === null}>
          Thêm ghi chú
        </Button>
      </form>
    </section>
  );
}
