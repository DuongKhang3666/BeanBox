/**
 * Giá vốn bình quân gia quyền di động và lợi nhuận gộp (D-078). Hàm THUẦN, tiền là số nguyên VND.
 */

/**
 * Giá vốn bình quân mới sau khi nhập `qty` đơn vị với đơn giá `unitCost`.
 * `avg = round((max(stockOld,0) x avgOld + qty x unitCost) / (max(stockOld,0) + qty))`;
 * `avgOld` null hoặc `stockOld <= 0` -> `unitCost` (không có hàng cũ để bình quân).
 * Làm tròn nửa lên (số nguyên không âm). Dùng BigInt để không tràn với số lớn.
 */
export function weightedAvgCost(
  stockOld: number,
  avgOld: number | null,
  qty: number,
  unitCost: number,
): number {
  if (!Number.isInteger(qty) || qty <= 0) throw new RangeError('qty phải là số nguyên dương');
  if (!Number.isInteger(unitCost) || unitCost < 0) {
    throw new RangeError('unitCost phải là số nguyên không âm');
  }
  if (avgOld === null || stockOld <= 0) return unitCost;
  const base = BigInt(stockOld);
  const denom = base + BigInt(qty);
  const numer = base * BigInt(avgOld) + BigInt(qty) * BigInt(unitCost);
  return Number((2n * numer + denom) / (2n * denom));
}

/**
 * Phân bổ giảm giá cấp đơn cho phần dòng CÓ giá vốn, theo tỷ lệ `lineTotal`:
 * `round(discount x costedLineTotal / lineTotalSum)` (nửa lên). Mọi dòng có giá vốn -> đúng
 * `discount`; không dòng nào -> 0.
 */
export function allocateDiscount(
  discount: number,
  costedLineTotal: number,
  lineTotalSum: number,
): number {
  if (lineTotalSum <= 0 || costedLineTotal <= 0 || discount <= 0) return 0;
  const num = BigInt(discount) * BigInt(costedLineTotal);
  const den = BigInt(lineTotalSum);
  return Number((2n * num + den) / (2n * den));
}

/** Số liệu thô (đã cộng) của một khoảng, tính từ các đơn đã thanh toán. */
export interface ProfitInputs {
  /** Σ lineTotal của MỌI dòng. */
  lineTotal: number;
  /** Σ lineTotal của dòng có giá vốn. */
  costedLineTotal: number;
  /** Σ giảm giá cấp đơn đã phân bổ cho phần dòng có giá vốn (xem `allocateDiscount`). */
  allocatedDiscount: number;
  /** Σ unitCost x quantity của dòng có giá vốn. */
  cogs: number;
}

export interface ProfitFigures {
  /** Doanh thu hàng hóa thuần của phần có giá vốn = costedLineTotal - allocatedDiscount. */
  netGoodsRevenue: number;
  cogs: number;
  grossProfit: number;
  /** grossProfit / netGoodsRevenue, 0..1 làm tròn 4 chữ số; 0 khi netGoodsRevenue <= 0. */
  grossMargin: number;
  /** costedLineTotal / lineTotal, 0..1 làm tròn 4 chữ số; 0 khi không có doanh thu. */
  costCoverage: number;
}

const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

export function profitFigures(i: ProfitInputs): ProfitFigures {
  const netGoodsRevenue = i.costedLineTotal - i.allocatedDiscount;
  const grossProfit = netGoodsRevenue - i.cogs;
  return {
    netGoodsRevenue,
    cogs: i.cogs,
    grossProfit,
    grossMargin: netGoodsRevenue > 0 ? round4(grossProfit / netGoodsRevenue) : 0,
    costCoverage: i.lineTotal > 0 ? round4(i.costedLineTotal / i.lineTotal) : 0,
  };
}
