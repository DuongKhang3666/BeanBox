/** Giờ Việt Nam (UTC+7, không có giờ mùa hè) – dùng cho VNPay và email. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const p2 = (n: number) => String(n).padStart(2, '0');

interface VnParts {
  yyyy: string;
  MM: string;
  dd: string;
  HH: string;
  mm: string;
  ss: string;
}

function vnParts(d: Date): VnParts {
  const v = new Date(d.getTime() + VN_OFFSET_MS);
  return {
    yyyy: String(v.getUTCFullYear()).padStart(4, '0'),
    MM: p2(v.getUTCMonth() + 1),
    dd: p2(v.getUTCDate()),
    HH: p2(v.getUTCHours()),
    mm: p2(v.getUTCMinutes()),
    ss: p2(v.getUTCSeconds()),
  };
}

/** `yyyyMMddHHmmss` theo giờ Việt Nam (định dạng ngày của VNPay). */
export function formatVnpayDate(d: Date): string {
  const t = vnParts(d);
  return `${t.yyyy}${t.MM}${t.dd}${t.HH}${t.mm}${t.ss}`;
}

/** `HH:mm dd/MM/yyyy` theo giờ Việt Nam (email). */
export function formatVnDateTime(d: Date): string {
  const t = vnParts(d);
  return `${t.HH}:${t.mm} ${t.dd}/${t.MM}/${t.yyyy}`;
}
