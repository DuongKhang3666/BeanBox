import { ProductImage } from "@/features/catalog/components/ProductImage";
import { formatVND } from "@/lib/format";

export interface OrderLine {
  key: string;
  productName: string;
  variantName: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export function OrderItemsList({
  items,
  label = "Sản phẩm",
}: {
  items: OrderLine[];
  label?: string;
}) {
  return (
    <ul aria-label={label} className="divide-y divide-coffee-200">
      {items.map((it) => (
        <li key={it.key} className="flex gap-3 py-3">
          <ProductImage
            src={it.imageUrl}
            name={it.productName}
            sizes="64px"
            className="h-16 w-16 shrink-0 rounded-lg"
          />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 font-medium text-coffee-900">{it.productName}</p>
            <p className="text-sm text-coffee-700">{it.variantName}</p>
            <p className="text-sm text-coffee-700">
              {formatVND(it.unitPrice)} × {it.quantity}
            </p>
          </div>
          <p className="shrink-0 font-semibold text-coffee-900">{formatVND(it.lineTotal)}</p>
        </li>
      ))}
    </ul>
  );
}
