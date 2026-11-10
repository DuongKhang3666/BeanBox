const fmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

/** Thời điểm ISO -> "dd/mm/yyyy" theo giờ Việt Nam (cố định múi giờ để SSR/CSR khớp nhau). */
export function formatSaleDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : fmt.format(d);
}

/** Ngày thuần "YYYY-MM-DD" -> "dd/mm/yyyy". */
export function formatPlainDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
