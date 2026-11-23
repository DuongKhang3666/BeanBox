"use client";

import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { FormError, FormNotice } from "@/features/auth/components/FormError";
import { formatVnDateTime } from "../../format";
import type { SaveState } from "./useSectionSave";

export function SectionCard({
  title,
  description,
  updatedAt,
  state,
  onSubmit,
  disabled,
  children,
}: {
  title: string;
  description?: string;
  updatedAt: string | null;
  state: SaveState;
  onSubmit: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const hid = useId();
  return (
    <form
      noValidate
      aria-labelledby={hid}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-4 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5"
    >
      <header className="space-y-1">
        <h2 id={hid} className="font-serif text-xl font-bold text-coffee-900">
          {title}
        </h2>
        {description ? <p className="text-sm text-coffee-700">{description}</p> : null}
        <p className="text-xs text-coffee-700">
          {updatedAt
            ? `Cập nhật lần cuối: ${formatVnDateTime(updatedAt)}`
            : "Chưa chỉnh sửa (đang dùng giá trị mặc định)"}
        </p>
      </header>
      {children}
      {state.general.length > 0 ? (
        <FormError>
          {state.general.map((g) => (
            <p key={g}>{g}</p>
          ))}
        </FormError>
      ) : null}
      <FormNotice>{state.notice}</FormNotice>
      <div className="flex justify-end">
        <Button
          type="submit"
          aria-label={`Lưu ${title.toLowerCase()}`}
          loading={state.busy}
          disabled={disabled}
        >
          {state.busy ? "Đang lưu…" : "Lưu"}
        </Button>
      </div>
    </form>
  );
}
