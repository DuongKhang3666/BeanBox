import type { InputHTMLAttributes, LabelHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Label({ className, children, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("mb-1.5 block text-sm font-medium text-coffee-900", className)} {...rest}>
      {children}
    </label>
  );
}

export function FieldError({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm text-danger-600">
      {children}
    </p>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid, className, ...rest }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        "h-11 w-full rounded-lg border bg-white px-3 text-base text-coffee-900",
        "placeholder:text-coffee-600/70 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600",
        "disabled:cursor-not-allowed disabled:bg-coffee-50 disabled:opacity-70",
        invalid ? "border-danger-600" : "border-coffee-400",
        className,
      )}
      {...rest}
    />
  );
}
