const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Định dạng số tiền VND (số nguyên): 125000 -> "125.000₫". Không dùng float. */
export function formatVND(amount: number): string {
  if (!Number.isFinite(amount)) return "0₫";
  const n = Math.trunc(amount);
  const digits = Math.abs(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${digits}₫`;
}

function toDate(value: string | number | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "10/11/2026". Trả về chuỗi rỗng nếu ngày không hợp lệ. */
export function formatDate(value: string | number | Date): string {
  const d = toDate(value);
  return d ? dateFormatter.format(d) : "";
}

/** "10/11/2026 14:30". */
export function formatDateTime(value: string | number | Date): string {
  const d = toDate(value);
  return d ? `${dateFormatter.format(d)} ${timeFormatter.format(d)}` : "";
}
