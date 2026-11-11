const vnDateTime = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const vnDate = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function toDate(value: string | number | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "10/11/2026 15:30" theo giờ Việt Nam (UTC+7), không phụ thuộc múi giờ máy. */
export function formatVnDateTime(value: string | number | Date): string {
  const d = toDate(value);
  return d ? vnDateTime.format(d).replace(",", "") : "";
}

/** "10/11/2026" theo giờ Việt Nam. */
export function formatVnDate(value: string | number | Date): string {
  const d = toDate(value);
  return d ? vnDate.format(d) : "";
}
