"use client";

import { FieldError, Label } from "@/components/ui/Input";
import { NOTE_MAX } from "../logic";
import { Section } from "./RadioCard";

export function NoteSection({
  note,
  setNote,
  error,
  clearError,
}: {
  note: string;
  setNote: (v: string) => void;
  error?: string;
  clearError: (...ids: string[]) => void;
}) {
  return (
    <Section title="Ghi chú" id="checkout-note">
      <div>
        <Label htmlFor="note">Ghi chú cho đơn hàng (không bắt buộc)</Label>
        <textarea
          id="note"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            clearError("note");
          }}
          maxLength={NOTE_MAX}
          rows={3}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "note-error" : undefined}
          className="w-full rounded-lg border border-coffee-400 bg-white px-3 py-2 text-base text-coffee-900"
          placeholder="Ví dụ: gọi trước khi giao"
        />
        <p className="mt-1 text-right text-xs text-coffee-700">
          {note.length}/{NOTE_MAX}
        </p>
        <FieldError id="note-error">{error}</FieldError>
      </div>
    </Section>
  );
}
