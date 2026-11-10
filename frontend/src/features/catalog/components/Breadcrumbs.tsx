import Link from "next/link";

export interface Crumb {
  name: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const all: Crumb[] = [{ name: "Trang chủ", href: "/" }, ...items];
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-coffee-700">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {all.map((c, i) => {
          const last = i === all.length - 1;
          return (
            <li key={`${c.name}-${i}`} className="flex items-center gap-2">
              {c.href && !last ? (
                <Link href={c.href} className="underline-offset-2 hover:underline">
                  {c.name}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={last ? "font-medium text-coffee-900" : ""}
                >
                  {c.name}
                </span>
              )}
              {!last ? (
                <span aria-hidden="true" className="text-coffee-400">
                  /
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
