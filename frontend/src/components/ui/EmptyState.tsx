import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-coffee-300 bg-cream-50 px-6 py-12 text-center">
      <span aria-hidden="true" className="text-4xl">
        ☕
      </span>
      <h2 className="font-serif text-xl font-semibold text-coffee-900">{title}</h2>
      {description ? <p className="max-w-md text-coffee-700">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
