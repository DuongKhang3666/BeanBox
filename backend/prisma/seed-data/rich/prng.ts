/* PRNG tất định cho seed nhiều (D-084). KHÔNG dùng Math.random: cùng seed luôn ra cùng dữ liệu. */

export type Rng = () => number;

/** mulberry32: trả số thực trong [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Băm chuỗi thành số 32 bit (FNV-1a), dùng để tách luồng ngẫu nhiên theo khóa. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export const int = (r: Rng, min: number, max: number): number =>
  min + Math.floor(r() * (max - min + 1));

export const chance = (r: Rng, p: number): boolean => r() < p;

export function pick<T>(r: Rng, xs: readonly T[]): T {
  if (xs.length === 0) throw new Error('pick: mảng rỗng');
  return xs[Math.floor(r() * xs.length)] as T;
}

/** Chọn theo trọng số; trả về chỉ số. */
export function weightedIndex(r: Rng, weights: readonly number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let x = r() * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i] as number;
    if (x < 0) return i;
  }
  return weights.length - 1;
}

/** Xáo trộn Fisher-Yates trên bản sao. */
export function shuffled<T>(r: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** Số có `digits` chữ số, đệm 0 bên trái. */
export const pad = (n: number, digits: number): string => String(n).padStart(digits, '0');
