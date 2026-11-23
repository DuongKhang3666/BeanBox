"use client";

import { FieldError, Input, Label } from "@/components/ui/Input";

export const textareaClass =
  "w-full rounded-lg border bg-white px-3 py-2 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600";

export const domId = (path: string) => `st-${path.replace(/[^a-zA-Z0-9]+/g, "-")}`;

export function NumberField({
  path,
  label,
  value,
  onChange,
  error,
  hint,
  suffix,
}: {
  path: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  suffix?: string;
}) {
  const id = domId(path);
  const describedBy =
    [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix ? <span className="shrink-0 text-sm text-coffee-700">{suffix}</span> : null}
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-coffee-700">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-err`}>{error}</FieldError>
    </div>
  );
}

export function TextField({
  path,
  label,
  value,
  onChange,
  error,
  hint,
  type = "text",
  maxLength,
  autoComplete,
}: {
  path: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  maxLength?: number;
  autoComplete?: string;
}) {
  const id = domId(path);
  const describedBy =
    [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        maxLength={maxLength}
        autoComplete={autoComplete ?? "off"}
        invalid={Boolean(error)}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-coffee-700">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-err`}>{error}</FieldError>
    </div>
  );
}
