import { cn } from "@/lib/cn";
import type { OrderStatus } from "@/types/order";
import { orderStatusLabel } from "../labels";

const TONE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "bg-cream-200 text-coffee-900",
  PENDING: "bg-cream-200 text-coffee-900",
  CONFIRMED: "bg-moss-50 text-moss-800",
  PROCESSING: "bg-moss-50 text-moss-800",
  SHIPPING: "bg-moss-100 text-moss-800",
  DELIVERED: "bg-moss-700 text-white",
  FAILED_DELIVERY: "bg-danger-50 text-danger-600",
  CANCELLED: "bg-coffee-100 text-coffee-800",
  RETURN_REQUESTED: "bg-cream-200 text-coffee-900",
  RETURNED: "bg-coffee-100 text-coffee-800",
};

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-sm font-medium",
        TONE[status] ?? "bg-cream-200 text-coffee-900",
        className,
      )}
    >
      {orderStatusLabel(status)}
    </span>
  );
}
