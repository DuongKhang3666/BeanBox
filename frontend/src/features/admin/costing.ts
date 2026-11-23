/**
 * Giá vốn bình quân gia quyền di động (D-078), bản dùng để HIỂN THỊ dự kiến ở form nhập hàng.
 * Con số chính thức do server tính trong transaction; công thức giống `backend/src/lib/cost.ts`.
 */
export function projectedAvgCost(
  stockOld: number,
  avgOld: number | null,
  qty: number,
  unitCost: number,
): number {
  if (avgOld === null || stockOld <= 0) return unitCost;
  const base = BigInt(stockOld);
  const denom = base + BigInt(qty);
  const numer = base * BigInt(avgOld) + BigInt(qty) * BigInt(unitCost);
  const two = BigInt(2);
  return Number((two * numer + denom) / (two * denom));
}
