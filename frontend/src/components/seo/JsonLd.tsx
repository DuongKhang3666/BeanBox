import { serializeJsonLd } from "@/features/catalog/jsonld";

/** Nhúng dữ liệu có cấu trúc. Dữ liệu do server dựng; "<" đã được thay bằng <. */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
