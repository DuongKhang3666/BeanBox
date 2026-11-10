export function Section({
  title,
  description,
  headingId,
  children,
}: {
  title: string;
  description?: string;
  headingId: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-coffee-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <h2 id={headingId} className="font-serif text-xl font-bold text-coffee-900">
        {title}
      </h2>
      {description ? <p className="mt-1 text-sm text-coffee-700">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
