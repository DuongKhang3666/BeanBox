/**
 * Sinh đơn hàng DEMO/tải để đo hiệu năng phân tích kinh doanh và chụp ảnh README.
 *
 * Chạy (trong backend/), CHỈ trên DB tạm đã `prisma migrate deploy` + seed:
 *   DEMO_DATABASE_URL=postgresql://... npx tsx scripts/generate-demo-orders.ts --orders 100000 --days 365 [--seed 42] [--reset]
 *
 * Dữ liệu sinh bằng SQL tập hợp theo lô (generate_series / INSERT ... SELECT), không vòng lặp từng đơn.
 * KHÔNG cập nhật tồn kho, InventoryMovement, soldCount, CouponRedemption, usedCount: đây là dữ liệu
 * demo, không nhất quán với sổ kho. Mọi dòng demo nhận dạng được: `Order.idempotencyKey LIKE 'demo-%'`,
 * `User.email LIKE 'demo.%@example.com'`; `--reset` xóa đúng các dòng đó rồi sinh lại.
 * Rào an toàn: xem scripts/demoDbGuard.ts (chỉ đọc DEMO_DATABASE_URL, từ chối DB dev/production).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { loadLocations } from '../src/modules/locations/locations.data.js';
import { parseDemoArgs, parseEnvFile, resolveDemoDatabaseUrl } from './demoDbGuard.js';

type Tx = Pick<PrismaClient, '$executeRawUnsafe' | '$queryRawUnsafe'>;

const EXPIRE_REASON = 'Quá hạn thanh toán'; // trùng jobs/cleanup.ts (EXPIRE_REASON)
const STORE_CANCEL_DEFAULT = 'Cửa hàng hủy đơn'; // trùng DEFAULT_CANCEL_REASON của admin

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (xs: readonly string[]) => `ARRAY[${xs.map(lit).join(',')}]::text[]`;

const HO = [
  'Nguyễn',
  'Trần',
  'Lê',
  'Phạm',
  'Hoàng',
  'Huỳnh',
  'Phan',
  'Vũ',
  'Võ',
  'Đặng',
  'Bùi',
  'Đỗ',
  'Hồ',
  'Ngô',
  'Dương',
  'Lý',
];
const DEM = ['Minh', 'Thanh', 'Gia', 'Hoài', 'Khánh', 'Bảo', 'Anh', 'Ngọc', 'Quốc', 'Kim'];
const TEN = [
  'An',
  'Bình',
  'Châu',
  'Dũng',
  'Giang',
  'Hà',
  'Hạnh',
  'Hiếu',
  'Hùng',
  'Khoa',
  'Lan',
  'Linh',
  'Long',
  'Mai',
  'Nam',
  'Phúc',
  'Phương',
  'Quân',
  'Quang',
  'Sơn',
  'Thảo',
  'Trang',
  'Trung',
  'Tú',
  'Tuấn',
  'Việt',
  'Vy',
  'Yến',
  'Đạt',
  'Hương',
];
const STREETS = [
  'Lê Lợi',
  'Nguyễn Huệ',
  'Trần Hưng Đạo',
  'Hai Bà Trưng',
  'Lý Thường Kiệt',
  'Phan Chu Trinh',
  'Điện Biên Phủ',
  'Nguyễn Trãi',
  'Hoàng Diệu',
  'Võ Thị Sáu',
  'Nguyễn Văn Cừ',
  'Pasteur',
  'Lạc Long Quân',
  'Trường Chinh',
  'Cách Mạng Tháng Tám',
];
const CUSTOMER_CANCEL_NOTES = [
  'Đổi ý, không muốn mua nữa',
  'Đặt nhầm sản phẩm',
  'Muốn đổi địa chỉ giao hàng',
  'Tìm được giá tốt hơn',
];
const STORE_CANCEL_NOTES = ['Hết hàng', 'Không liên lạc được với khách', STORE_CANCEL_DEFAULT];
const CARRIERS = ['GHN', 'GHTK', 'Viettel Post'];

function setup(seed: number) {
  return [
    `SET LOCAL TIME ZONE 'UTC'`,
    // u: số ngẫu nhiên [0,1) xác định theo (khóa, muối, seed); uc: cố định theo khóa (thuộc tính khách).
    `CREATE OR REPLACE FUNCTION pg_temp.u(k bigint, salt int) RETURNS float8 LANGUAGE sql IMMUTABLE AS $$
       SELECT ((hashtextextended(k::text || ':' || salt::text, ${seed}) & 2147483647)::float8) / 2147483648.0 $$`,
    `CREATE OR REPLACE FUNCTION pg_temp.uc(k bigint, salt int) RETURNS float8 LANGUAGE sql IMMUTABLE AS $$
       SELECT ((hashtextextended(k::text || ':' || salt::text, 7) & 2147483647)::float8) / 2147483648.0 $$`,
    `CREATE OR REPLACE FUNCTION pg_temp.pick(a text[], k bigint, salt int) RETURNS text LANGUAGE sql IMMUTABLE AS $$
       SELECT a[1 + floor(pg_temp.uc(k, salt) * array_length(a, 1))::int] $$`,
    `CREATE OR REPLACE FUNCTION pg_temp.vn_name(k bigint) RETURNS text LANGUAGE sql IMMUTABLE AS $$
       SELECT pg_temp.pick(${arr(HO)}, k, 31) || ' '
           || CASE WHEN pg_temp.uc(k, 32) < 0.55 THEN pg_temp.pick(${arr(DEM)}, k, 33) || ' ' ELSE '' END
           || pg_temp.pick(${arr(TEN)}, k, 34) $$`,
    `CREATE OR REPLACE FUNCTION pg_temp.vn_phone(k bigint) RETURNS text LANGUAGE sql IMMUTABLE AS $$
       SELECT '09' || lpad((floor(pg_temp.uc(k, 35) * 100000000))::bigint::text, 8, '0') $$`,
  ];
}

/** Bảng tạm: địa điểm (từ data/provinces-wards.json), biến thể, mã giảm giá, nhân viên. */
async function prepareLookups(
  db: Tx,
): Promise<{ variants: number; provinces: number; wardsPer: number; staff: string[] }> {
  const idx = loadLocations();
  const wanted = ['79', '01', '48'];
  const codes = [
    ...wanted.filter((c) => idx.provinces.has(c)),
    ...[...idx.provinces.keys()].filter((c) => !wanted.includes(c)).sort(),
  ];
  const sampled = codes.map((code) => {
    const p = idx.provinces.get(code)!;
    return { p, wards: [...p.wards.values()].sort((a, b) => (a.code < b.code ? -1 : 1)) };
  });
  const wardsPer = Math.min(8, ...sampled.map((s) => s.wards.length));
  if (wardsPer < 1) throw new Error('Dữ liệu địa điểm không có phường/xã.');
  const rows: string[] = [];
  sampled.forEach((s, pidx) => {
    const step = Math.max(1, Math.floor(s.wards.length / wardsPer));
    for (let w = 0; w < wardsPer; w++) {
      const ward = s.wards[Math.min(w * step, s.wards.length - 1)]!;
      rows.push(
        `(${pidx},${w},${lit(s.p.code)},${lit(s.p.name)},${lit(ward.code)},${lit(ward.name)})`,
      );
    }
  });
  await db.$executeRawUnsafe(
    `CREATE TEMP TABLE _loc (pidx int, widx int, pc text, pn text, wc text, wn text) ON COMMIT DROP`,
  );
  await db.$executeRawUnsafe(`INSERT INTO _loc VALUES ${rows.join(',')}`);

  await db.$executeRawUnsafe(`
    CREATE TEMP TABLE _var ON COMMIT DROP AS
    SELECT (row_number() OVER (ORDER BY md5(v."id")))::int AS rn,
           v."id" AS "variantId", v."productId", p."name" AS "productName", v."name" AS "variantName",
           v."sku", v."weightGram", v."price" AS "unitPrice",
           (SELECT i."url" FROM "ProductImage" i WHERE i."productId" = p."id"
              ORDER BY i."isPrimary" DESC, i."sortOrder" ASC LIMIT 1) AS "imageUrl"
    FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
    WHERE v."isActive" AND v."deletedAt" IS NULL AND p."deletedAt" IS NULL AND p."status" = 'ACTIVE'`);
  const v = await db.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM _var`);
  const variants = v[0]?.n ?? 0;
  if (variants < 30)
    throw new Error(`Cần seed catalog trước (chỉ có ${variants} biến thể đang bán, cần >= 30).`);

  await db.$executeRawUnsafe(`
    CREATE TEMP TABLE _cp ON COMMIT DROP AS SELECT "id", "code" FROM "Coupon"
    WHERE "code" IN ('WELCOME10', 'FREESHIP30', 'GIAM50K')`);
  const staffRows = await db.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "User" WHERE "role" IN ('STAFF','ADMIN') ORDER BY "id"`,
  );
  if (staffRows.length === 0) throw new Error('Cần seed tài khoản STAFF/ADMIN trước.');
  return { variants, provinces: codes.length, wardsPer, staff: staffRows.map((r) => r.id) };
}

async function insertUsers(db: Tx, total: number, days: number, nowIso: string) {
  await db.$executeRawUnsafe(`
    INSERT INTO "User" ("id", "email", "passwordHash", "fullName", "phone", "role", "status",
                        "emailVerifiedAt", "createdAt", "updatedAt")
    SELECT 'demou' || substr(md5('u:' || i), 1, 19),
           'demo.khach' || i || '@example.com',
           '!demo-khong-dang-nhap-duoc',
           pg_temp.vn_name(i * 2), pg_temp.vn_phone(i * 2),
           'CUSTOMER', 'ACTIVE', ${lit(nowIso)}::timestamptz AT TIME ZONE 'UTC',
           (${lit(nowIso)}::timestamptz - ((${days} + 30) * pg_temp.uc(i, 90)) * interval '1 day') AT TIME ZONE 'UTC',
           ${lit(nowIso)}::timestamptz AT TIME ZONE 'UTC'
    FROM generate_series(0, ${total - 1}) i
    ON CONFLICT DO NOTHING`);
}

/** Một lô đơn [a, b): chuỗi bảng tạm rồi INSERT ... SELECT vào Order, OrderItem, OrderStatusHistory, Payment. */
async function generateBatch(
  db: Tx,
  o: {
    a: number;
    b: number;
    days: number;
    seed: number;
    nowIso: string;
    reg: number;
    guests: number;
  },
  ctx: { variants: number; provinces: number; wardsPer: number; staff: string[] },
) {
  const NOW = `${lit(o.nowIso)}::timestamptz`;
  const staff = arr(ctx.staff);
  const tag = (g: string) => `'demo-${o.seed}-' || ${g}`;

  await db.$executeRawUnsafe(`
    CREATE TEMP TABLE _g1 ON COMMIT DROP AS
    WITH s AS (
      SELECT g,
        floor(${o.days} * pg_temp.u(g, 1))::int AS day_off,
        7 + floor(16 * (pg_temp.u(g, 2) + pg_temp.u(g, 3)) / 2)::int AS hr,
        CASE WHEN pg_temp.u(g, 4) < 0.50 THEN 'COD' WHEN pg_temp.u(g, 4) < 0.80 THEN 'VNPAY' ELSE 'STRIPE' END AS method,
        CASE WHEN pg_temp.u(g, 5) < 0.20 THEN 'EXPRESS' ELSE 'STANDARD' END AS ship,
        pg_temp.u(g, 6) < 0.55 AS is_reg,
        CASE WHEN pg_temp.u(g, 7) < 0.15 THEN 1 WHEN pg_temp.u(g, 7) < 0.37 THEN 2
             WHEN pg_temp.u(g, 7) < 0.67 THEN 3 WHEN pg_temp.u(g, 7) < 0.87 THEN 4 ELSE 5 END AS nl,
        pg_temp.u(g, 8) AS x_plan, pg_temp.u(g, 9) AS x_cancel
      FROM generate_series(${o.a}::bigint, ${o.b - 1}::bigint) g
    ), t AS (
      SELECT s.*,
        LEAST(
          (date_trunc('day', ${NOW} AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')
            - day_off * interval '1 day' + hr * interval '1 hour'
            + floor(pg_temp.u(g, 10) * 3600) * interval '1 second',
          ${NOW} - interval '3 hours' - floor(pg_temp.u(g, 11) * 7200) * interval '1 second') AS created,
        CASE WHEN is_reg THEN floor(${o.reg} * power(pg_temp.u(g, 12), 2))::bigint
             ELSE floor(${o.guests} * power(pg_temp.u(g, 12), 1.6))::bigint END AS cidx
      FROM s
    )
    SELECT t.*,
      CASE WHEN is_reg THEN cidx * 2 ELSE cidx * 2 + 1 END AS ckey,
      CASE WHEN x_plan < 0.86 THEN 'D' WHEN x_plan < 0.89 THEN 'R' WHEN x_plan < 0.99 THEN 'C'
           WHEN created > ${NOW} - interval '60 days' THEN 'F' ELSE 'D' END AS plan,
      CASE WHEN method = 'COD' THEN (CASE WHEN x_cancel < 0.6 THEN 'customer' ELSE 'store' END)
           ELSE (CASE WHEN x_cancel < 0.35 THEN 'expired' WHEN x_cancel < 0.75 THEN 'customer' ELSE 'store' END) END AS ckind
    FROM t`);

  await db.$executeRawUnsafe(`
    CREATE TEMP TABLE _g2 ON COMMIT DROP AS
    SELECT g1.*,
      CASE WHEN is_reg THEN 'demou' || substr(md5('u:' || cidx), 1, 19) END AS uid,
      CASE WHEN is_reg THEN 'demo.khach' || cidx || '@example.com' ELSE 'demo.vanglai' || cidx || '@example.com' END AS email,
      pg_temp.vn_name(ckey) AS cname, pg_temp.vn_phone(ckey) AS cphone,
      (1 + floor(pg_temp.uc(ckey, 36) * 300))::int || ' ' || pg_temp.pick(${arr(STREETS)}, ckey, 37) AS line1,
      l.pc, l.pn, l.wc, l.wn
    FROM _g1 g1
    JOIN _loc l ON l.pidx = floor(${ctx.provinces} * power(pg_temp.uc(g1.ckey, 38), 2))::int
               AND l.widx = floor(${ctx.wardsPer} * pg_temp.uc(g1.ckey, 39))::int`);

  await db.$executeRawUnsafe(`
    CREATE TEMP TABLE _line ON COMMIT DROP AS
    SELECT g2.g, j.j, v."variantId", v."productId", v."productName", v."variantName", v."sku",
           v."imageUrl", v."weightGram", v."unitPrice",
           (CASE WHEN pg_temp.u(g2.g * 8 + j.j, 14) < 0.70 THEN 1 WHEN pg_temp.u(g2.g * 8 + j.j, 14) < 0.92 THEN 2 ELSE 3 END)::int AS quantity
    FROM _g2 g2 CROSS JOIN generate_series(0, 4) j(j)
    JOIN _var v ON v.rn = ((floor(${ctx.variants} * power(pg_temp.u(g2.g, 13), 1.8))::int
                            + j.j * (1 + floor(6 * pg_temp.u(g2.g, 15))::int)) % ${ctx.variants}) + 1
    WHERE j.j < g2.nl`);

  // Tổng tiền, mã giảm giá, phí ship (theo cấu hình seed: inner 01/79, ngưỡng freeship 500.000, phụ phí khối lượng).
  await db.$executeRawUnsafe(`
    CREATE TEMP TABLE _g3 ON COMMIT DROP AS
    WITH tot AS (
      SELECT g, SUM("unitPrice" * quantity)::int AS subtotal, SUM("weightGram" * quantity)::int AS weight
      FROM _line GROUP BY g
    ), c AS (
      SELECT g2.*, tot.subtotal, tot.weight,
        CASE WHEN pg_temp.u(g2.g, 16) >= 0.28 THEN NULL
             WHEN pg_temp.u(g2.g, 16) < 0.126 AND tot.subtotal >= 200000 THEN 'WELCOME10'
             WHEN pg_temp.u(g2.g, 16) >= 0.126 AND pg_temp.u(g2.g, 16) < 0.21 THEN 'FREESHIP30'
             WHEN pg_temp.u(g2.g, 16) >= 0.21 AND tot.subtotal >= 500000 THEN 'GIAM50K' END AS ccode,
        (CASE WHEN pc IN ('01', '79') THEN (CASE WHEN ship = 'EXPRESS' THEN 35000 ELSE 20000 END)
              ELSE (CASE WHEN ship = 'EXPRESS' THEN 55000 ELSE 35000 END) END
         + 5000 * ceil(greatest(0, tot.weight - 2000) / 1000.0)::int) AS fee
      FROM _g2 g2 JOIN tot ON tot.g = g2.g
    ), d AS (
      SELECT c.*,
        CASE ccode WHEN 'WELCOME10' THEN LEAST(50000, floor(subtotal * 0.10)::int)
                   WHEN 'GIAM50K' THEN 50000 ELSE 0 END AS disc
      FROM c
    )
    SELECT d.*,
      GREATEST(CASE WHEN subtotal - disc >= 500000 THEN fee ELSE 0 END,
               CASE WHEN ccode = 'FREESHIP30' THEN LEAST(30000, fee) ELSE 0 END) AS ship_disc,
      (SELECT cp."id" FROM _cp cp WHERE cp."code" = d.ccode) AS coupon_id
    FROM d`);

  // Dòng thời gian thô theo kế hoạch, cắt tại "bây giờ" (mốc sau hiện tại -> chưa xảy ra -> NULL).
  await db.$executeRawUnsafe(`
    CREATE TEMP TABLE _g4 ON COMMIT DROP AS
    WITH raw AS (
      SELECT g3.*,
        created + CASE WHEN method = 'COD'
          THEN (CASE WHEN pg_temp.u(g, 40) < 0.96 THEN 0.1 + 14 * power(pg_temp.u(g, 41), 2) ELSE 24 + 40 * pg_temp.u(g, 41) END) * interval '1 hour'
          ELSE (1 + 12 * power(pg_temp.u(g, 42), 2)) * interval '1 minute' END AS r_conf
      FROM _g3 g3
    ), r2 AS (
      SELECT raw.*,
        r_conf + (2 + 22 * pg_temp.u(g, 43)) * interval '1 hour' AS r_proc
      FROM raw
    ), r3 AS (
      SELECT r2.*, r_proc + (4 + 20 * pg_temp.u(g, 44)) * interval '1 hour' AS r_ship FROM r2
    ), r4 AS (
      SELECT r3.*,
        r_ship + (CASE WHEN ship = 'EXPRESS' THEN 1 + 1.5 * pg_temp.u(g, 45) ELSE 2 + 3 * pg_temp.u(g, 45) END) * interval '1 day' AS r_deliv,
        r_ship + (1 + 2 * pg_temp.u(g, 46)) * interval '1 day' AS r_fail
      FROM r3
    ), r5 AS (
      SELECT r4.*, r_deliv + (1 + 4 * pg_temp.u(g, 47)) * interval '1 day' AS r_retreq FROM r4
    ), r6 AS (
      SELECT r5.*, r_retreq + (1 + 5 * pg_temp.u(g, 48)) * interval '1 day' AS r_ret,
        -- Hủy: thời điểm và trạng thái nguồn theo loại.
        CASE WHEN plan <> 'C' THEN NULL
             WHEN ckind = 'expired' THEN created + interval '15 minutes'
             WHEN ckind = 'customer' AND method <> 'COD' THEN created + (1 + 12 * pg_temp.u(g, 49)) * interval '1 minute'
             WHEN ckind = 'customer' THEN created + (0.1 + 10 * pg_temp.u(g, 49)) * interval '1 hour'
             ELSE r_conf + (1 + 19 * pg_temp.u(g, 49)) * interval '1 hour' END AS r_cancel
      FROM r5
    )
    SELECT r6.*,
      CASE WHEN plan = 'C' AND ckind <> 'store' THEN NULL WHEN r_conf <= ${NOW} THEN r_conf END AS t_conf,
      CASE WHEN plan IN ('D', 'R', 'F') AND r_proc <= ${NOW} THEN r_proc END AS t_proc,
      CASE WHEN plan IN ('D', 'R', 'F') AND r_ship <= ${NOW} THEN r_ship END AS t_ship,
      CASE WHEN plan IN ('D', 'R') AND r_deliv <= ${NOW} THEN r_deliv END AS t_deliv,
      CASE WHEN plan = 'F' AND r_fail <= ${NOW} THEN r_fail END AS t_fail,
      CASE WHEN plan = 'R' AND r_retreq <= ${NOW} THEN r_retreq END AS t_retreq,
      CASE WHEN plan = 'R' AND r_ret <= ${NOW} THEN r_ret END AS t_ret,
      CASE WHEN r_cancel <= ${NOW} THEN r_cancel END AS t_cancel
    FROM r6`);

  // Trạng thái hiện tại, thanh toán, hoàn tiền (suy ra từ các mốc đã xảy ra).
  await db.$executeRawUnsafe(`
    CREATE TEMP TABLE _g5 ON COMMIT DROP AS
    WITH s AS (
      SELECT g4.*,
        CASE WHEN t_cancel IS NOT NULL THEN 'CANCELLED' WHEN t_ret IS NOT NULL THEN 'RETURNED'
             WHEN t_retreq IS NOT NULL THEN 'RETURN_REQUESTED' WHEN t_deliv IS NOT NULL THEN 'DELIVERED'
             WHEN t_fail IS NOT NULL THEN 'FAILED_DELIVERY' WHEN t_ship IS NOT NULL THEN 'SHIPPING'
             WHEN t_proc IS NOT NULL THEN 'PROCESSING' WHEN t_conf IS NOT NULL THEN 'CONFIRMED'
             WHEN method = 'COD' THEN 'PENDING' ELSE 'PENDING_PAYMENT' END AS status,
        CASE WHEN method = 'COD' THEN t_deliv ELSE t_conf END AS paid_at,
        CASE WHEN t_cancel IS NULL THEN NULL
             WHEN ckind = 'store' THEN 'CONFIRMED'
             WHEN method = 'COD' THEN 'PENDING' ELSE 'PENDING_PAYMENT' END AS cancel_from,
        CASE WHEN t_cancel IS NULL THEN NULL
             WHEN ckind = 'expired' THEN ${lit(EXPIRE_REASON)}
             WHEN ckind = 'customer' THEN (CASE WHEN pg_temp.u(g, 50) < 0.3 THEN NULL
               ELSE (${arr(CUSTOMER_CANCEL_NOTES)})[1 + floor(pg_temp.u(g, 51) * ${CUSTOMER_CANCEL_NOTES.length})::int] END)
             ELSE (${arr(STORE_CANCEL_NOTES)})[1 + floor(pg_temp.u(g, 51) * ${STORE_CANCEL_NOTES.length})::int] END AS cancel_note,
        (${staff})[1 + (g % ${ctx.staff.length})::int] AS staff_id,
        'BB-' || to_char(created AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' ||
        (SELECT string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + ((n / p) % 31)::int, 1), '' ORDER BY p DESC)
           FROM (SELECT ((g * 7919 + ${o.seed} * 104729) % 923521) AS n) q,
                unnest(ARRAY[29791, 961, 31, 1]) AS p) AS code
      FROM _g4 g4
    )
    SELECT s.*,
      -- Hoàn tiền Payment online đã thu: đơn hủy (cửa hàng) hoặc trả hàng, ~88% đã hoàn khi đủ thời gian.
      CASE WHEN method <> 'COD' AND paid_at IS NOT NULL AND pg_temp.u(g, 52) < 0.88 THEN
             CASE WHEN status = 'CANCELLED' THEN t_cancel + (2 + 46 * pg_temp.u(g, 53)) * interval '1 hour'
                  WHEN status = 'RETURNED' THEN t_ret + (1 + 2 * pg_temp.u(g, 53)) * interval '1 day' END
      END AS r_refund
    FROM s`);
  await db.$executeRawUnsafe(`ALTER TABLE _g5 ADD COLUMN refunded_at timestamptz`);
  await db.$executeRawUnsafe(`UPDATE _g5 SET refunded_at = r_refund WHERE r_refund <= ${NOW}`);

  const utc = (e: string) => `(${e}) AT TIME ZONE 'UTC'`;
  const oid = (g: string) => `'demo' || substr(md5(${tag(g)}), 1, 21)`;

  await db.$executeRawUnsafe(`
    INSERT INTO "Order" ("id", "code", "userId", "contactEmail", "contactPhone", "status", "paymentStatus",
      "paymentMethod", "shippingMethod", "shippingAddress", "totalWeightGram", "subtotal", "discountTotal",
      "shippingFee", "shippingDiscount", "grandTotal", "couponId", "couponCode", "trackingNumber", "carrier",
      "cancelReason", "expiresAt", "paidAt", "confirmedAt", "deliveredAt", "cancelledAt",
      "idempotencyKey", "requestFingerprint", "createdAt", "updatedAt")
    SELECT ${oid('g')},
      code,
      uid, email, cphone, status::"OrderStatus",
      CASE WHEN refunded_at IS NOT NULL THEN 'REFUNDED' WHEN paid_at IS NOT NULL THEN 'PAID' ELSE 'UNPAID' END::"PaymentStatus",
      method::"PaymentMethod", ship::"ShippingMethod",
      jsonb_build_object('fullName', cname, 'phone', cphone, 'provinceCode', pc, 'provinceName', pn,
                         'wardCode', wc, 'wardName', wn, 'line1', line1),
      weight, subtotal, disc, fee, ship_disc, subtotal - disc + fee - ship_disc,
      coupon_id, ccode,
      CASE WHEN t_ship IS NOT NULL THEN 'DEMO' || lpad(((g * 2654435761) % 1000000000)::text, 9, '0') END,
      CASE WHEN t_ship IS NOT NULL THEN (${arr(CARRIERS)})[1 + floor(pg_temp.u(g, 54) * ${CARRIERS.length})::int] END,
      CASE WHEN t_cancel IS NOT NULL THEN cancel_note END,
      ${utc(`CASE WHEN method <> 'COD' THEN created + interval '15 minutes' END`)},
      ${utc('paid_at')}, ${utc('t_conf')}, ${utc('t_deliv')}, ${utc('t_cancel')},
      ${tag('g')}, encode(sha256(convert_to(${tag('g')}, 'UTF8')), 'hex'),
      ${utc('created')},
      ${utc(`GREATEST(created, t_conf, t_proc, t_ship, t_deliv, t_fail, t_retreq, t_ret, t_cancel, refunded_at)`)}
    FROM _g5
    -- Bỏ đơn trùng mã (hậu tố chỉ có 923.521 giá trị mỗi ngày, trùng khi chạy nhiều seed trên cùng DB).
    WHERE NOT EXISTS (SELECT 1 FROM "Order" x WHERE x."code" = _g5.code)`);

  await db.$executeRawUnsafe(`
    INSERT INTO "OrderItem" ("id", "orderId", "productId", "variantId", "productName", "variantName", "sku",
      "imageUrl", "weightGram", "unitPrice", "quantity", "lineTotal")
    SELECT 'demi' || substr(md5(${tag("l.g::text || ':' || l.j")}), 1, 21), ${oid('l.g')},
      l."productId", l."variantId", l."productName", l."variantName", l."sku", l."imageUrl",
      l."weightGram", l."unitPrice", l.quantity, l."unitPrice" * l.quantity
    FROM _line l WHERE EXISTS (SELECT 1 FROM "Order" x WHERE x."id" = ${oid('l.g')})`);

  // Lịch sử trạng thái đúng cách mã thật ghi (khởi tạo, xác nhận, xử lý, giao, hủy, trả hàng).
  const hist = (
    to: string,
    from: string,
    at: string,
    actor: string,
    note: string,
    cond: string,
    salt: number,
  ) =>
    `SELECT g, ${from} AS from_s, '${to}' AS to_s, ${at} AS at, ${actor} AS actor, ${note} AS note, ${salt} AS seq, created AS c0
     FROM _g5 WHERE ${cond}`;
  await db.$executeRawUnsafe(`
    INSERT INTO "OrderStatusHistory" ("id", "orderId", "fromStatus", "toStatus", "note", "actorId", "createdAt")
    SELECT 'demh' || substr(md5(${tag("h.g::text || ':' || h.seq")}), 1, 21), ${oid('h.g')},
      h.from_s::"OrderStatus", h.to_s::"OrderStatus", h.note, h.actor, ${utc('h.at')}
    FROM (
      ${hist('PENDING', 'NULL', 'created', 'uid', 'NULL', `method = 'COD'`, 0)}
      UNION ALL ${hist('PENDING_PAYMENT', 'NULL', 'created', 'uid', 'NULL', `method <> 'COD'`, 1)}
      UNION ALL ${hist(
        'CONFIRMED',
        `CASE WHEN method = 'COD' THEN 'PENDING' ELSE 'PENDING_PAYMENT' END`,
        't_conf',
        `CASE WHEN method = 'COD' THEN staff_id END`,
        `CASE WHEN method = 'VNPAY' THEN 'Thanh toán VNPay thành công' WHEN method = 'STRIPE' THEN 'Thanh toán Stripe thành công' END`,
        't_conf IS NOT NULL',
        2,
      )}
      UNION ALL ${hist('PROCESSING', `'CONFIRMED'`, 't_proc', 'staff_id', 'NULL', 't_proc IS NOT NULL', 3)}
      UNION ALL ${hist('SHIPPING', `'PROCESSING'`, 't_ship', 'staff_id', 'NULL', 't_ship IS NOT NULL', 4)}
      UNION ALL ${hist('DELIVERED', `'SHIPPING'`, 't_deliv', 'staff_id', 'NULL', 't_deliv IS NOT NULL', 5)}
      UNION ALL ${hist('FAILED_DELIVERY', `'SHIPPING'`, 't_fail', 'staff_id', `'Khách không nghe máy'`, 't_fail IS NOT NULL', 6)}
      UNION ALL ${hist('RETURN_REQUESTED', `'DELIVERED'`, 't_retreq', 'uid', 'NULL', 't_retreq IS NOT NULL', 7)}
      UNION ALL ${hist('RETURNED', `'RETURN_REQUESTED'`, 't_ret', 'staff_id', 'NULL', 't_ret IS NOT NULL', 8)}
      UNION ALL ${hist(
        'CANCELLED',
        'cancel_from',
        't_cancel',
        `CASE ckind WHEN 'expired' THEN NULL WHEN 'customer' THEN uid ELSE staff_id END`,
        'cancel_note',
        't_cancel IS NOT NULL',
        9,
      )}
    ) h
    WHERE EXISTS (SELECT 1 FROM "Order" x WHERE x."id" = ${oid('h.g')})`);

  await db.$executeRawUnsafe(`
    INSERT INTO "Payment" ("id", "orderId", "provider", "providerTxnId", "providerRef", "amount", "status",
      "refundedAt", "refundNote", "refundedById", "createdAt", "updatedAt")
    SELECT 'demp' || substr(md5(${tag('g')}), 1, 21), ${oid('g')}, method::"PaymentProvider",
      CASE WHEN paid_at IS NOT NULL THEN 'demo-txn-' || substr(md5(${tag('g')}), 1, 16) END,
      'demo-ref-' || substr(md5(${tag('g')}), 1, 16), subtotal - disc + fee - ship_disc,
      CASE WHEN refunded_at IS NOT NULL THEN 'REFUNDED' WHEN paid_at IS NOT NULL THEN 'SUCCEEDED'
           WHEN status = 'CANCELLED' THEN 'FAILED' ELSE 'PENDING' END::"PaymentTxnStatus",
      ${utc('refunded_at')}, CASE WHEN refunded_at IS NOT NULL THEN 'Hoàn tiền (dữ liệu demo)' END,
      CASE WHEN refunded_at IS NOT NULL THEN staff_id END,
      ${utc('created')}, ${utc('GREATEST(created, t_conf, t_cancel, refunded_at)')}
    FROM _g5 WHERE method <> 'COD' AND EXISTS (SELECT 1 FROM "Order" x WHERE x."id" = ${oid('g')})`);
}

async function main() {
  const backendDir = path.resolve(import.meta.dirname, '..');
  let backendEnv: Record<string, string> = {};
  try {
    backendEnv = parseEnvFile(readFileSync(path.join(backendDir, '.env'), 'utf8'));
  } catch {
    /* không có .env: bỏ qua */
  }
  const url = resolveDemoDatabaseUrl(process.env, backendEnv);
  const args = parseDemoArgs(process.argv.slice(2));

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const started = Date.now();
  const nowIso = new Date().toISOString();
  const reg = Math.max(20, Math.ceil((args.orders * 0.55) / 6));
  const guests = Math.max(20, Math.ceil((args.orders * 0.45) / 2));
  const log = (m: string) => console.log(`[demo] ${m}`);

  try {
    if (args.reset) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "Payment" WHERE "orderId" IN (SELECT "id" FROM "Order" WHERE "idempotencyKey" LIKE 'demo-%')`,
      );
      const del = await prisma.$executeRawUnsafe(
        `DELETE FROM "Order" WHERE "idempotencyKey" LIKE 'demo-%'`,
      );
      await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE "email" LIKE 'demo.%@example.com'`);
      log(`đã xóa ${del} đơn demo cũ (kèm dòng hàng, lịch sử, payment) và user demo`);
    } else {
      const exist = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT count(*)::int AS n FROM "Order" WHERE "idempotencyKey" LIKE ${lit(`demo-${args.seed}-%`)}`,
      );
      if ((exist[0]?.n ?? 0) > 0)
        throw new Error(`Đã có dữ liệu demo seed ${args.seed}. Dùng --reset hoặc --seed khác.`);
    }

    let done = 0;
    for (let a = 0; a < args.orders; a += args.batch) {
      const b = Math.min(args.orders, a + args.batch);
      await prisma.$transaction(
        async (tx) => {
          for (const s of setup(args.seed)) await tx.$executeRawUnsafe(s);
          const ctx = await prepareLookups(tx);
          if (a === 0) await insertUsers(tx, reg, args.days, nowIso);
          await generateBatch(
            tx,
            { a, b, days: args.days, seed: args.seed, nowIso, reg, guests },
            ctx,
          );
        },
        { timeout: 20 * 60 * 1000, maxWait: 30_000 },
      );
      done = b;
      log(`${done}/${args.orders} đơn (${Math.round((Date.now() - started) / 1000)} giây)`);
    }

    // Ngày tạo tài khoản không muộn hơn đơn đầu tiên của họ (chỉ chỉnh user demo).
    await prisma.$executeRawUnsafe(`
      UPDATE "User" u SET "createdAt" = LEAST(u."createdAt", m.first_created - interval '30 minutes')
      FROM (SELECT "userId", min("createdAt") AS first_created FROM "Order"
            WHERE "idempotencyKey" LIKE 'demo-%' AND "userId" IS NOT NULL GROUP BY 1) m
      WHERE u."id" = m."userId" AND u."email" LIKE 'demo.%@example.com'`);
    for (const t of ['Order', 'OrderItem', 'OrderStatusHistory', 'Payment', 'User']) {
      await prisma.$executeRawUnsafe(`ANALYZE "${t}"`);
    }
    const c = await prisma.$queryRawUnsafe<
      Array<{ orders: number; items: number; users: number }>
    >(`
      SELECT (SELECT count(*) FROM "Order" WHERE "idempotencyKey" LIKE 'demo-%')::int AS orders,
             (SELECT count(*) FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId" WHERE o."idempotencyKey" LIKE 'demo-%')::int AS items,
             (SELECT count(*) FROM "User" WHERE "email" LIKE 'demo.%@example.com')::int AS users`);
    log(
      `xong: ${c[0]?.orders} đơn, ${c[0]?.items} dòng hàng, ${c[0]?.users} user demo trong ${Math.round((Date.now() - started) / 1000)} giây`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(`[demo] Lỗi: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
