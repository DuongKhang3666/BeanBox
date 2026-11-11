import 'dotenv/config';
import { z } from 'zod';

/**
 * Chuyển TRUST_PROXY thành giá trị cho `app.set('trust proxy', ...)`.
 * "false" -> false; số nguyên không âm -> số hop; còn lại -> danh sách (loopback/linklocal/uniquelocal/IP/CIDR).
 * "true" bị từ chối vì cho phép client giả X-Forwarded-For.
 */
export function parseTrustProxy(raw: string): boolean | number | string {
  const v = raw.trim();
  if (v.toLowerCase() === 'false') return false;
  if (v.toLowerCase() === 'true') {
    throw new Error(
      'TRUST_PROXY="true" không được phép (cho phép giả mạo X-Forwarded-For); hãy dùng số hop, loopback/uniquelocal hoặc IP/CIDR cụ thể',
    );
  }
  if (/^\d+$/.test(v)) return Number(v);
  const list = v
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (list.length === 0) throw new Error('TRUST_PROXY không được rỗng');
  return list.join(',');
}

/** "15m" -> 900. */
export function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)([smh])$/.exec(ttl);
  if (!m) throw new Error('ACCESS_TOKEN_TTL không hợp lệ');
  const n = Number(m[1]);
  return m[2] === 's' ? n : m[2] === 'm' ? n * 60 : n * 3600;
}

export const DEFAULT_VNPAY_PAYMENT_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';

function isUrlWithProtocol(u: string, protocols: readonly string[]): boolean {
  try {
    return protocols.includes(new URL(u).protocol);
  } catch {
    return false;
  }
}

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    HOST: z.string().default('127.0.0.1'),
    TRUST_PROXY: z
      .string()
      .default('loopback')
      .transform((s, ctx) => {
        try {
          return parseTrustProxy(s);
        } catch (e) {
          ctx.addIssue({ code: 'custom', message: (e as Error).message });
          return z.NEVER;
        }
      }),
    INTERNAL_API_SECRET: z
      .string()
      .min(32, 'INTERNAL_API_SECRET phải có ít nhất 32 ký tự')
      .optional(),
    WEB_APP_URL: z
      .string()
      .default('http://localhost:3000')
      .refine((u) => {
        try {
          const p = new URL(u).protocol;
          return p === 'http:' || p === 'https:';
        } catch {
          return false;
        }
      }, 'WEB_APP_URL phải là URL http(s)')
      .transform((u) => u.replace(/\/+$/, '')),
    COOKIE_SECURE: z.enum(['true', 'false']).optional(),
    DATABASE_URL: z.string().min(1),
    FRONTEND_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((s) =>
        s
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET phải có ít nhất 32 ký tự'),
    ACCESS_TOKEN_TTL: z
      .string()
      .regex(/^\d+[smh]$/, 'ACCESS_TOKEN_TTL phải có dạng số + s|m|h, ví dụ 15m')
      .default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    JOBS_ENABLED: z.enum(['true', 'false']).optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default('BeanBox <no-reply@beanbox.local>'),
    VNPAY_TMN_CODE: z.string().optional(),
    VNPAY_HASH_SECRET: z.string().optional(),
    VNPAY_PAYMENT_URL: z
      .string()
      .default(DEFAULT_VNPAY_PAYMENT_URL)
      .refine((u) => isUrlWithProtocol(u, ['https:']), 'VNPAY_PAYMENT_URL phải là URL https'),
    /** Mặc định `${WEB_APP_URL}/thanh-toan/ket-qua?provider=vnpay` (tính ở bước transform). */
    VNPAY_RETURN_URL: z
      .string()
      .refine(
        (u) => isUrlWithProtocol(u, ['http:', 'https:']),
        'VNPAY_RETURN_URL phải là URL http(s)',
      )
      .optional(),
    // D-014: chỉ khóa test. Thông báo lỗi KHÔNG chứa giá trị khóa.
    STRIPE_SECRET_KEY: z
      .string()
      .refine(
        (k) => k.startsWith('sk_test_'),
        'STRIPE_SECRET_KEY phải bắt đầu bằng sk_test_ (khóa live bị từ chối)',
      )
      .optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    ORDER_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(10),
    COUPON_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(10),
    QUOTE_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(30),
    SEED_ADMIN_PASSWORD: z.string().optional(),
    SEED_STAFF_PASSWORD: z.string().optional(),
    SEED_CUSTOMER_PASSWORD: z.string().optional(),
  })
  .transform(({ COOKIE_SECURE, JOBS_ENABLED, ...v }) => ({
    ...v,
    VNPAY_RETURN_URL: v.VNPAY_RETURN_URL ?? `${v.WEB_APP_URL}/thanh-toan/ket-qua?provider=vnpay`,
    /** Mặc định true; NODE_ENV=test luôn false. */
    JOBS_ENABLED: v.NODE_ENV === 'test' ? false : JOBS_ENABLED !== 'false',
    /** Đã tính: mặc định true khi production. */
    COOKIE_SECURE: COOKIE_SECURE ? COOKIE_SECURE === 'true' : v.NODE_ENV === 'production',
    accessTokenTtlSec: ttlToSeconds(v.ACCESS_TOKEN_TTL),
  }));

export type Env = z.infer<typeof schema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  // Chuỗi rỗng trong .env (ví dụ STRIPE_SECRET_KEY=) coi như chưa đặt
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    console.error(`Cấu hình môi trường không hợp lệ:\n${lines.join('\n')}`);
    process.exit(1);
  }
  return result.data;
}

export const env = parseEnv(process.env);
