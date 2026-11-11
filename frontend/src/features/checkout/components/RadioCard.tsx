import { cn } from "@/lib/cn";

/** Thẻ chọn một (radio) cho địa chỉ / vận chuyển / thanh toán. */
export function RadioCard({
  name,
  value,
  checked,
  onChange,
  disabled,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 has-focus-visible:outline-3 has-focus-visible:outline-moss-600",
        checked ? "border-moss-700 bg-moss-50" : "border-coffee-300 bg-white",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="mt-1 h-5 w-5 shrink-0 accent-moss-700"
      />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

export function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className="space-y-4 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5"
    >
      <h2 id={id} className="font-serif text-lg font-bold text-coffee-900">
        {title}
      </h2>
      {children}
    </section>
  );
}
