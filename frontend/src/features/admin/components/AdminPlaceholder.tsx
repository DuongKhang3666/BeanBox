export function AdminPlaceholder({ title }: { title: string }) {
  return (
    <section className="space-y-2">
      <h1 className="font-serif text-2xl font-bold text-coffee-900">{title}</h1>
      <p className="rounded-2xl border border-dashed border-coffee-300 bg-cream-50 p-6 text-coffee-700">
        Đang phát triển
      </p>
    </section>
  );
}
