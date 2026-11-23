/**
 * Đo tải đặt hàng đồng thời cùng một SKU (D-083). Không thêm phụ thuộc: `fetch` + hàng đợi worker.
 *
 * Kịch bản mỗi lượt: đặt tồn của 1 biến thể = S; tạo trước N giỏ guest (mỗi giỏ 1 cái biến thể đó,
 * email/SĐT khác nhau theo chỉ số); bắn N `POST /orders` COD (Idempotency-Key khác nhau) với tối đa C
 * request cùng bay. Kỳ vọng: đúng S đơn 201, N-S đơn 409 OUT_OF_STOCK, 0 lỗi 5xx, tồn cuối = 0,
 * số InventoryMovement ORDER_RESERVE tăng đúng S, `pg_stat_database.deadlocks` không tăng.
 *
 * CHỈ chạy trên backend + DB TẠM:
 *   LOAD_API_URL=http://127.0.0.1:4300 LOAD_DATABASE_URL=postgresql://...@127.0.0.1:5440/... \
 *     npx tsx scripts/load-order-concurrency.ts
 * Backend tạm cần: ORDER_RATE_LIMIT_PER_MIN, GENERAL_RATE_LIMIT_PER_MIN, QUOTE_RATE_LIMIT_PER_MIN đủ lớn
 * (>= vài nghìn) và GUEST_COD_MAX_OPEN đủ lớn (tối đa 100); DB đã `migrate deploy` + seed.
 *
 * Biến tùy chọn: LOAD_STOCK (20), LOAD_ORDERS (100), LOAD_CONCURRENCY ("25,50,100"), LOAD_REPEATS (3),
 * LOAD_SKU (mặc định biến thể còn bán đầu tiên theo SKU), LOAD_TAG (hậu tố Idempotency-Key),
 * LOAD_ALLOW_PROTECTED=1 (cho phép cổng API 4000/4100 hoặc DB localhost:5432; mặc định từ chối).
 * Kết quả in ra stdout dạng JSON; mã thoát 1 nếu có lượt vi phạm kỳ vọng.
 */
import { createHash } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { endpointOf } from './demoDbGuard.js';

const PROTECTED_API_PORTS = ['4000', '4100'];
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];

export interface LoadConfig {
  apiUrl: string;
  databaseUrl: string;
  stock: number;
  orders: number;
  concurrency: number[];
  repeats: number;
  sku: string | null;
  tag: string;
}

/** Hàm thuần: đọc và kiểm env, ném lỗi (không in URL/mật khẩu) khi không an toàn. */
export function resolveLoadConfig(env: Record<string, string | undefined>): LoadConfig {
  const apiUrl = (env.LOAD_API_URL ?? '').replace(/\/$/, '');
  const databaseUrl = env.LOAD_DATABASE_URL ?? '';
  if (!apiUrl) throw new Error('Thiếu LOAD_API_URL (backend TẠM, ví dụ http://127.0.0.1:4300)');
  if (!databaseUrl) throw new Error('Thiếu LOAD_DATABASE_URL (DB TẠM để đặt tồn và kiểm kết quả)');
  if (env.NODE_ENV === 'production') throw new Error('Từ chối chạy khi NODE_ENV=production');
  const allowProtected = env.LOAD_ALLOW_PROTECTED === '1';

  let api: URL;
  try {
    api = new URL(apiUrl);
  } catch {
    throw new Error('LOAD_API_URL không phải URL hợp lệ');
  }
  const host = api.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!LOCAL_HOSTS.includes(host)) throw new Error('LOAD_API_URL phải là localhost');
  if (!allowProtected && PROTECTED_API_PORTS.includes(api.port)) {
    throw new Error(
      `Từ chối cổng API ${api.port} (backend dev); dùng backend tạm hoặc LOAD_ALLOW_PROTECTED=1`,
    );
  }

  const db = endpointOf(databaseUrl);
  if (!db) throw new Error('LOAD_DATABASE_URL không phải URL hợp lệ');
  if (!allowProtected && LOCAL_HOSTS.includes(db.host) && db.port === '5432') {
    throw new Error('Từ chối DB localhost:5432 (DB dev); dùng DB tạm hoặc LOAD_ALLOW_PROTECTED=1');
  }

  const int = (name: string, fallback: number, min: number, max: number): number => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max)
      throw new Error(`${name} phải là số nguyên ${min}..${max}`);
    return n;
  };
  const orders = int('LOAD_ORDERS', 100, 1, 500);
  const stock = int('LOAD_STOCK', 20, 1, orders);
  const repeats = int('LOAD_REPEATS', 3, 1, 10);
  const concurrency = (env.LOAD_CONCURRENCY ?? '25,50,100').split(',').map((s) => {
    const n = Number(s.trim());
    if (!Number.isInteger(n) || n < 1 || n > 500)
      throw new Error('LOAD_CONCURRENCY: danh sách số nguyên 1..500');
    return n;
  });
  return {
    apiUrl,
    databaseUrl,
    stock,
    orders,
    concurrency,
    repeats,
    sku: env.LOAD_SKU || null,
    tag: env.LOAD_TAG || Date.now().toString(36),
  };
}

/** Phân vị nearest-rank trên mảng đã sắp xếp tăng dần. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
}

/** UUID v4 tất định từ một chuỗi (Idempotency-Key bắt buộc UUID v4): cùng đầu vào, cùng khóa. */
export function deterministicUuidV4(seed: string): string {
  const h = createHash('sha256').update(seed).digest('hex');
  const variant = ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const round = (n: number, digits = 1): number => Math.round(n * 10 ** digits) / 10 ** digits;

interface Shot {
  status: number;
  code: string | null;
  ms: number;
  /** Thân phản hồi rút gọn, chỉ giữ cho phản hồi bất ngờ (không phải 201/409 OUT_OF_STOCK). */
  sample?: string;
}

/** Chạy `tasks` với tối đa `limit` cái cùng bay; giữ thứ tự chỉ số. */
async function pool<T>(count: number, limit: number, fn: (i: number) => Promise<T>): Promise<T[]> {
  const out = new Array<T>(count);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < count) {
      const i = next++;
      out[i] = await fn(i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, count) }, worker));
  return out;
}

async function main(): Promise<void> {
  const cfg = resolveLoadConfig(process.env);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: cfg.databaseUrl }) });
  const api = `${cfg.apiUrl}/api/v1`;

  const variants = await prisma.$queryRawUnsafe<{ id: string; sku: string }[]>(
    `SELECT v."id", v."sku" FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
      WHERE v."isActive" AND v."deletedAt" IS NULL AND p."status" = 'ACTIVE' AND p."deletedAt" IS NULL
        AND ($1::text IS NULL OR v."sku" = $1)
      ORDER BY v."sku" LIMIT 1`,
    cfg.sku,
  );
  const variant = variants[0];
  if (!variant)
    throw new Error('Không tìm thấy biến thể bán được (đã seed chưa? LOAD_SKU đúng chưa?)');
  // Bỏ ràng buộc độ tươi/giá sale của dữ liệu seed để kịch bản chỉ đo tranh chấp tồn kho.
  await prisma.$executeRawUnsafe(
    `UPDATE "ProductVariant" SET "roastDate" = NULL, "salePrice" = NULL, "saleStart" = NULL, "saleEnd" = NULL WHERE "id" = $1`,
    variant.id,
  );

  const numberOf = async (sql: string, ...args: unknown[]): Promise<number> =>
    Number((await prisma.$queryRawUnsafe<{ n: bigint | number }[]>(sql, ...args))[0]!.n);
  const deadlocks = (): Promise<number> =>
    numberOf(`SELECT deadlocks AS n FROM pg_stat_database WHERE datname = current_database()`);
  const reserveCount = (): Promise<number> =>
    numberOf(
      `SELECT count(*) AS n FROM "InventoryMovement" WHERE "variantId" = $1 AND "reason" = 'ORDER_RESERVE'`,
      variant.id,
    );

  const runs: Record<string, unknown>[] = [];
  let runIndex = 0;
  for (const c of cfg.concurrency) {
    for (let rep = 1; rep <= cfg.repeats; rep++) {
      runIndex += 1;
      const label = `${cfg.tag}-c${c}-r${rep}`;
      await prisma.$executeRawUnsafe(
        `UPDATE "ProductVariant" SET "stock" = $1 WHERE "id" = $2`,
        cfg.stock,
        variant.id,
      );
      const reserveBefore = await reserveCount();
      const deadlocksBefore = await deadlocks();

      // 1) N giỏ guest (tạo có kiểm soát, không tính vào số đo)
      const tokens = await pool(cfg.orders, 10, async () => {
        const res = await fetch(`${api}/cart/items`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ variantId: variant.id, quantity: 1 }),
        });
        const token = res.headers.get('x-cart-token');
        await res.arrayBuffer();
        if (res.status >= 300 || !token) throw new Error(`Tạo giỏ thất bại: HTTP ${res.status}`);
        return token;
      });

      // 2) N đơn với tối đa C request cùng bay
      const started = performance.now();
      const shots = await pool<Shot>(cfg.orders, c, async (i) => {
        // SĐT/email tất định theo (lượt, chỉ số): 09 + 8 chữ số.
        const phone = `09${String(runIndex * 1000 + i).padStart(8, '0')}`;
        const t0 = performance.now();
        try {
          const res = await fetch(`${api}/orders`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-cart-token': tokens[i]!,
              'idempotency-key': deterministicUuidV4(`load-${label}-${i}`),
            },
            body: JSON.stringify({
              contact: { email: `load+${label}-${i}@example.com`, phone },
              shippingAddress: {
                fullName: 'Nguyễn Đo Tải',
                phone,
                provinceCode: '79',
                wardCode: '26740',
                line1: '12 Lê Lợi',
              },
              shippingMethod: 'STANDARD',
              paymentMethod: 'COD',
              acceptTerms: true,
            }),
          });
          const text = await res.text();
          let code: string | null = null;
          try {
            code = (JSON.parse(text) as { error?: { code?: string } }).error?.code ?? null;
          } catch {
            code = null;
          }
          const unexpected = res.status !== 201 && code !== 'OUT_OF_STOCK';
          return {
            status: res.status,
            code,
            ms: performance.now() - t0,
            ...(unexpected ? { sample: text.slice(0, 300) } : {}),
          };
        } catch {
          return { status: 0, code: 'NETWORK_ERROR', ms: performance.now() - t0 };
        }
      });
      const totalMs = performance.now() - started;

      // 3) Kiểm bằng SQL
      const stockAfter = await numberOf(
        `SELECT "stock" AS n FROM "ProductVariant" WHERE "id" = $1`,
        variant.id,
      );
      const reserved = (await reserveCount()) - reserveBefore;
      const orderRows = await numberOf(
        `SELECT count(*) AS n FROM "Order" WHERE "contactEmail" LIKE $1`,
        `load+${label}-%@example.com`,
      );
      const deadlockDelta = (await deadlocks()) - deadlocksBefore;

      const count = (pred: (s: Shot) => boolean): number => shots.filter(pred).length;
      const created = count((s) => s.status === 201);
      const outOfStock = count((s) => s.status === 409 && s.code === 'OUT_OF_STOCK');
      const server5xx = count((s) => s.status >= 500);
      const other = cfg.orders - created - outOfStock - server5xx;
      const breakdown: Record<string, number> = {};
      for (const s of shots) {
        const key = `${s.status}${s.code ? ` ${s.code}` : ''}`;
        breakdown[key] = (breakdown[key] ?? 0) + 1;
      }
      const sorted = shots.map((s) => s.ms).sort((a, b) => a - b);
      const expected = Math.min(cfg.stock, cfg.orders);
      const ok =
        created === expected &&
        outOfStock === cfg.orders - expected &&
        server5xx === 0 &&
        other === 0 &&
        stockAfter === cfg.stock - expected &&
        reserved === expected &&
        orderRows === expected &&
        deadlockDelta === 0;

      runs.push({
        concurrency: c,
        repeat: rep,
        created,
        outOfStock,
        server5xx,
        other,
        breakdown,
        firstUnexpected: shots.find((s) => s.sample)?.sample ?? null,
        stockAfter,
        reserveMovements: reserved,
        orderRows,
        deadlocks: deadlockDelta,
        p50Ms: round(percentile(sorted, 50)),
        p95Ms: round(percentile(sorted, 95)),
        p99Ms: round(percentile(sorted, 99)),
        totalMs: round(totalMs),
        throughputPerSec: round(cfg.orders / (totalMs / 1000)),
        ok,
      });
    }
  }

  const summary = cfg.concurrency.map((c) => {
    const rs = runs.filter((r) => r.concurrency === c);
    const med = (k: string): number => round(median(rs.map((r) => r[k] as number)));
    return {
      concurrency: c,
      runs: rs.length,
      allOk: rs.every((r) => r.ok === true),
      medianP50Ms: med('p50Ms'),
      medianP95Ms: med('p95Ms'),
      medianP99Ms: med('p99Ms'),
      medianTotalMs: med('totalMs'),
      medianThroughputPerSec: med('throughputPerSec'),
    };
  });

  const report = {
    config: {
      orders: cfg.orders,
      stock: cfg.stock,
      repeats: cfg.repeats,
      sku: variant.sku,
      tag: cfg.tag,
    },
    summary,
    runs,
  };
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
  if (!runs.every((r) => r.ok === true)) process.exitCode = 1;
}

// Chỉ chạy khi gọi trực tiếp (test có thể import các hàm thuần).
if (process.argv[1] && /load-order-concurrency\.[tj]s$/.test(process.argv[1])) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
