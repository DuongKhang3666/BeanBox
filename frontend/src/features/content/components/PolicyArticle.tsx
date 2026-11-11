import Link from "next/link";
import { POLICIES, POLICY_SLUGS, type Policy } from "../policies";
import { DemoNotice } from "./DemoNotice";

const linkClass = "font-medium text-moss-700 underline underline-offset-2 hover:text-moss-600";

export function PolicyArticle({ policy }: { policy: Policy }) {
  const others = POLICY_SLUGS.filter((s) => s !== policy.slug).map((s) => POLICIES[s]);

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl font-bold text-coffee-900">{policy.title}</h1>
        <p className="text-sm text-coffee-700">Cập nhật lần cuối: {policy.updatedAt}</p>
        <p className="text-coffee-800">{policy.intro}</p>
      </header>

      <DemoNotice />

      <nav aria-label="Mục lục" className="rounded-xl border border-coffee-200 bg-white p-4">
        <p className="mb-2 font-semibold text-coffee-900">Nội dung</p>
        <ol className="list-decimal space-y-1 pl-5 text-coffee-800">
          {policy.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className={linkClass}>
                {s.heading}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {policy.sections.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-20">
          <h2 id={`${s.id}-h`} className="mb-2 font-serif text-xl font-bold text-coffee-900">
            {s.heading}
          </h2>
          <div className="space-y-3 leading-relaxed text-coffee-800">
            {s.paragraphs?.map((p) => (
              <p key={p}>{p}</p>
            ))}
            {s.bullets ? (
              <ul className="list-disc space-y-1 pl-5">
                {s.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      ))}

      <nav aria-label="Chính sách khác" className="border-t border-coffee-200 pt-4">
        <p className="mb-2 font-semibold text-coffee-900">Xem thêm</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {others.map((o) => (
            <li key={o.slug}>
              <Link href={`/chinh-sach/${o.slug}`} className={linkClass}>
                {o.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
