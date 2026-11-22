import { randomInt } from 'node:crypto';
import { formatDateOnly, vnCalendarDate, vnMorning } from './eta.js';

/**
 * Vận chuyển GIẢ LẬP (D-062): hãng cố định trong code, mã vận đơn giả, hành trình mô phỏng tính
 * từ lịch sử đơn. Không gọi hãng thật nào, không có bảng riêng.
 */

export type ShipMethod = 'STANDARD' | 'EXPRESS';

export const SIMULATED_CARRIERS: Record<ShipMethod, { code: string; name: string }> = {
  STANDARD: { code: 'BBL', name: 'BeanBox Logistics (giả lập)' },
  EXPRESS: { code: 'BBE', name: 'BeanBox Express (giả lập)' },
};

/** Bảng chữ không nhầm lẫn (bỏ 0/O, 1/I/L). */
export const TRACKING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SUFFIX_LEN = 6;

/** `randomInt` có thể tiêm để test deterministic: (maxExclusive) => số nguyên trong [0, max). */
export type RandomIntFn = (maxExclusive: number) => number;
const defaultRandom: RandomIntFn = (max) => randomInt(0, max);

/** `BBL-YYYYMMDD-XXXXXX` (ngày VN). */
export function generateTrackingNumber(
  method: ShipMethod,
  now: Date,
  rand: RandomIntFn = defaultRandom,
): string {
  const day = formatDateOnly(vnCalendarDate(now)).replaceAll('-', '');
  let suffix = '';
  for (let i = 0; i < SUFFIX_LEN; i++) suffix += TRACKING_ALPHABET[rand(TRACKING_ALPHABET.length)]!;
  return `${SIMULATED_CARRIERS[method].code}-${day}-${suffix}`;
}

export const TRACKING_NUMBER_REGEX = /^(BBL|BBE)-\d{8}-[A-HJKMNP-Z2-9]{6}$/;

// ---------------------------------------------------------------------------
// Hành trình mô phỏng

export interface ShipmentEvent {
  code: string;
  label: string;
  /** ISO. */
  at: string;
}

export interface ShipmentDto {
  carrier: string | null;
  trackingNumber: string | null;
  simulated: true;
  events: ShipmentEvent[];
}

export interface ShipHistoryEntry {
  fromStatus: string | null;
  toStatus: string;
  createdAt: Date;
}

export interface ShipmentInput {
  history: readonly ShipHistoryEntry[];
  /** Ngày giao dự kiến muộn nhất (Date 00:00 UTC của ngày VN) hoặc null (đơn cũ). */
  etaTo: Date | null;
  deliveredAt: Date | null;
  now: Date;
}

const H = 60 * 60 * 1000;

const REAL_LABELS: Record<string, { code: string; label: string }> = {
  DELIVERED: { code: 'DELIVERED', label: 'Giao hàng thành công' },
  FAILED_DELIVERY: { code: 'FAILED_DELIVERY', label: 'Giao hàng không thành công' },
  RETURNED: { code: 'RETURNED', label: 'Đơn hàng đã hoàn về cửa hàng' },
  CANCELLED: { code: 'CANCELLED', label: 'Đơn hàng đã bị hủy' },
};

/**
 * Hàm thuần (history, eta, now) -> các mốc có `at <= now`, tăng dần theo thời gian.
 * Mốc giả (tính từ lúc vào SHIPPING đầu tiên `s`):
 *   HANDOVER s; PICKED_UP s+2h; OUT_FOR_DELIVERY max(8:00 VN ngày etaTo, s+4h) (không có etaTo: s+24h);
 *   IN_TRANSIT chính giữa PICKED_UP và OUT_FOR_DELIVERY.
 * Mốc THẬT (theo lịch sử, sau lần SHIPPING đầu): giao thành công / không thành công / giao lại /
 * hoàn về / hủy. Mốc giả có `at` >= mốc thật đầu tiên bị cắt.
 * Trả `null` khi đơn chưa từng SHIPPING.
 */
export function buildShipmentEvents(input: ShipmentInput): ShipmentEvent[] | null {
  const hist = [...input.history].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const firstIdx = hist.findIndex((h) => h.toStatus === 'SHIPPING');
  if (firstIdx < 0) return null;
  const s = hist[firstIdx]!.createdAt.getTime();

  const real: Array<{ code: string; label: string; at: number }> = [];
  for (const h of hist.slice(firstIdx + 1)) {
    if (h.toStatus === 'SHIPPING') {
      real.push({ code: 'REDELIVERING', label: 'Giao lại đơn hàng', at: h.createdAt.getTime() });
    } else {
      const r = REAL_LABELS[h.toStatus];
      if (!r) continue;
      const at =
        h.toStatus === 'DELIVERED' && input.deliveredAt
          ? input.deliveredAt.getTime()
          : h.createdAt.getTime();
      real.push({ ...r, at });
    }
  }
  const firstReal = real.find((r) => r.code !== 'REDELIVERING');
  const cutAt = firstReal ? firstReal.at : Number.POSITIVE_INFINITY;

  const pickedUp = s + 2 * H;
  const ofd = Math.max(input.etaTo ? vnMorning(input.etaTo, 8).getTime() : s + 24 * H, s + 4 * H);
  const transit = pickedUp + Math.floor((ofd - pickedUp) / 2);
  const simulated = [
    { code: 'HANDOVER', label: 'Đã bàn giao cho đơn vị vận chuyển', at: s },
    { code: 'PICKED_UP', label: 'Đã lấy hàng', at: pickedUp },
    { code: 'IN_TRANSIT', label: 'Đang trung chuyển', at: transit },
    { code: 'OUT_FOR_DELIVERY', label: 'Đang giao hàng đến bạn', at: ofd },
  ].filter((e) => e.at < cutAt);

  const now = input.now.getTime();
  return [...simulated, ...real]
    .filter((e) => e.at <= now)
    .sort((a, b) => a.at - b.at)
    .map((e) => ({ code: e.code, label: e.label, at: new Date(e.at).toISOString() }));
}

export function buildShipment(
  input: ShipmentInput & { carrier: string | null; trackingNumber: string | null },
): ShipmentDto | null {
  const events = buildShipmentEvents(input);
  if (events === null) return null;
  return {
    carrier: input.carrier,
    trackingNumber: input.trackingNumber,
    simulated: true,
    events,
  };
}
