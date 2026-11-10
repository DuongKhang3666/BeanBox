"use client";

import { FieldError, Input, Label } from "@/components/ui/Input";
import type { InputProps } from "@/components/ui/Input";
import { PasswordInput } from "./PasswordInput";

interface FieldProps extends Omit<InputProps, "id" | "invalid"> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

function describedBy(id: string, error?: string, hint?: string) {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

/** Label + Input + gợi ý + lỗi field (aria-invalid, aria-describedby). */
export function TextField({ id, label, error, hint, ...rest }: FieldProps) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        invalid={!!error}
        aria-describedby={describedBy(id, error, hint)}
        {...rest}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-coffee-700">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

export function PasswordField({ id, label, error, hint, ...rest }: FieldProps) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <PasswordInput
        id={id}
        name={id}
        invalid={!!error}
        aria-describedby={describedBy(id, error, hint)}
        {...rest}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-coffee-700">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}
