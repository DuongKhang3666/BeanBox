"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { FieldError, Label } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { FormError, FormNotice } from "@/features/auth/components/FormError";
import { useResource } from "@/features/orders/useResource";
import { ApiError } from "@/lib/api/errors";
import type { ContactMessageItem, ContactStatus } from "@/types/adminContact";
import { getContactMessage, updateContactMessage } from "../api/contact";
import {
  CONTACT_BASE,
  CONTACT_NOTE_MAX,
  CONTACT_STATUSES,
  CONTACT_STATUS_LABEL,
} from "../contactFilters";
import { adminErrorMessage } from "../errors";
import { formatVnDateTime } from "../format";
import { ContactStatusBadge } from "./ContactStatusBadge";

const load = (id: string) => getContactMessage(id);

const selectClass =
  "h-11 w-full rounded-lg border border-coffee-400 bg-white px-3 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5">
      <h2 className="font-serif text-lg font-bold text-coffee-900">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-coffee-700">{label}</dt>
      <dd className="break-words text-coffee-900">{children}</dd>
    </div>
  );
}

function NotFound() {
  return (
    <div className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-6 text-center">
      <h1 className="font-serif text-xl font-bold text-coffee-900">Không tìm thấy tin nhắn</h1>
      <Link href={CONTACT_BASE} className={buttonClasses("primary")}>
        Về danh sách liên hệ
      </Link>
    </div>
  );
}

export function AdminContactDetail({ id }: { id: string }) {
  const res = useResource<ContactMessageItem>(id, load);
  const [statusChoice, setStatusChoice] = useState<ContactStatus | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);

  if (res.status === "loading" || res.status === "idle") {
    return (
      <div aria-busy="true" aria-label="Đang tải tin nhắn" role="status" className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (res.status === "error") {
    if (res.error instanceof ApiError && res.error.status === 404) return <NotFound />;
    return (
      <ErrorState
        title="Không tải được tin nhắn"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  }

  const m = res.data!;
  const status = statusChoice ?? m.status;
  const note = noteDraft ?? m.adminNote ?? "";
  const subjectLine = `Re: ${m.subject || "Liên hệ BeanBox"}`;

  async function onSave() {
    setNotice(null);
    setAlert(null);
    const body: { status?: ContactStatus; adminNote?: string } = {};
    if (status !== m.status) body.status = status;
    const trimmed = note.trim();
    if (trimmed.length > CONTACT_NOTE_MAX) {
      setNoteError(`Ghi chú tối đa ${CONTACT_NOTE_MAX} ký tự`);
      return;
    }
    setNoteError(null);
    if (trimmed !== (m.adminNote ?? "")) body.adminNote = trimmed;
    if (Object.keys(body).length === 0) {
      setNotice("Chưa có thay đổi nào để lưu.");
      return;
    }
    setBusy(true);
    try {
      const updated = await updateContactMessage(m.id, body);
      res.setData(updated);
      setStatusChoice(null);
      setNoteDraft(null);
      setNotice("Đã lưu thay đổi.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setAlert("Không tìm thấy tin nhắn.");
      else setAlert(adminErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href={CONTACT_BASE} className="text-sm font-medium text-moss-800 underline">
          ← Danh sách liên hệ
        </Link>
        <h1 className="mt-1 font-serif text-2xl font-bold break-words text-coffee-900">
          {m.subject || "(không tiêu đề)"}
        </h1>
        <div className="mt-2">
          <ContactStatusBadge status={m.status} />
        </div>
      </div>

      <div aria-live="polite" className="empty:hidden">
        <FormNotice>{notice}</FormNotice>
      </div>
      <FormError>{alert}</FormError>

      <Card title="Người gửi">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="Họ tên">{m.name}</Field>
          <Field label="Email">
            <a
              href={`mailto:${m.email}?subject=${encodeURIComponent(subjectLine)}`}
              className="text-moss-800 underline"
            >
              {m.email}
            </a>
          </Field>
          <Field label="Số điện thoại">{m.phone ?? "—"}</Field>
          <Field label="Tài khoản">{m.userId ? "Có tài khoản" : "Không có tài khoản"}</Field>
          <Field label="Gửi lúc">{formatVnDateTime(m.createdAt)}</Field>
          {m.handledBy ? (
            <Field label="Xử lý bởi">
              {m.handledBy.fullName}
              {m.handledAt ? ` · ${formatVnDateTime(m.handledAt)}` : ""}
            </Field>
          ) : null}
        </dl>
      </Card>

      <Card title="Nội dung">
        {/* Text thuần: React tự escape, giữ xuống dòng bằng CSS. */}
        <p className="break-words whitespace-pre-wrap text-coffee-900">{m.message}</p>
      </Card>

      <Card title="Xử lý">
        <div className="space-y-4">
          <div className="max-w-xs">
            <Label htmlFor="ctd-status">Trạng thái</Label>
            <select
              id="ctd-status"
              className={selectClass}
              value={status}
              disabled={busy}
              onChange={(e) => setStatusChoice(e.target.value as ContactStatus)}
            >
              {CONTACT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CONTACT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ctd-note">Ghi chú nội bộ</Label>
            <textarea
              id="ctd-note"
              rows={4}
              value={note}
              disabled={busy}
              aria-invalid={noteError ? true : undefined}
              aria-describedby={noteError ? "ctd-note-count ctd-note-error" : "ctd-note-count"}
              onChange={(e) => {
                setNoteDraft(e.target.value);
                setNoteError(null);
              }}
              className="w-full rounded-lg border border-coffee-400 bg-white px-3 py-2 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600"
            />
            <p
              id="ctd-note-count"
              className={`text-xs ${note.length > CONTACT_NOTE_MAX ? "text-danger-600" : "text-coffee-700"}`}
            >
              {note.length}/{CONTACT_NOTE_MAX} ký tự
            </p>
            <FieldError id="ctd-note-error">{noteError}</FieldError>
          </div>
          <Button loading={busy} onClick={onSave}>
            Lưu
          </Button>
        </div>
      </Card>
    </div>
  );
}
