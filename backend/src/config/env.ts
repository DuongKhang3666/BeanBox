import 'dotenv/config';
import { randomBytes } from 'node:crypto';
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

/** Tiền tố byte của khóa TOTP mẫu dev (`.env.example`); production từ chối khóa bắt đầu bằng chuỗi này. */
export const TOTP_DEV_KEY_PREFIX = 'beanbox-dev-';

/**
 * Khóa AES-256 cho secret TOTP (D-063): 64 ký tự hex hoặc base64 (standard/url, có hoặc không padding)
 * giải mã ra đúng 32 byte. Ném lỗi (không chứa giá trị khóa) nếu sai.
 */
export function parseTotpKey(raw: string): Buffer {
  const v = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, 'hex');
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(v)) {
    const buf = Buffer.from(v, 'base64'); // Node chấp nhận cả base64url
    if (buf.length === 32) return buf;
  }
  throw new Error('TOTP_ENCRYPTION_KEY phải là 32 byte, dạng 64 ký tự hex hoặc base64');
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
    // D-056: true = TLS ngầm định (thường cổng 465); false = STARTTLS cơ hội (cổng 587/1025).
    SMTP_SECURE: z.enum(['true', 'false']).optional(),
    // D-056: bắt buộc nâng cấp TLS (STARTTLS) trước khi gửi. Mặc định true ở production, false nơi khác.
    SMTP_REQUIRE_TLS: z.enum(['true', 'false']).optional(),
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
    // D-060: cổng thanh toán GIẢ cho demo (VNPay giả + MoMo giả). Mặc định tắt; cấm ở production.
    PAYMENT_MOCKS_ENABLED: z.enum(['true', 'false']).optional(),
    // Khóa ký của cổng giả. Trống thì sinh ngẫu nhiên lúc khởi động (chỉ dev; đổi mỗi lần chạy lại).
    PAYMENT_MOCK_SECRET: z
      .string()
      .min(16, 'PAYMENT_MOCK_SECRET phải có ít nhất 16 ký tự')
      .optional(),
    // D-061: chuyển khoản/VietQR. Thông tin tài khoản nằm ở settings admin (`payment.bankTransfer`).
    BANK_TRANSFER_ENABLED: z.enum(['true', 'false']).optional(),
    BANK_TRANSFER_HOLD_HOURS: z.coerce
      .number()
      .int('BANK_TRANSFER_HOLD_HOURS phải là số nguyên từ 1 đến 72')
      .min(1, 'BANK_TRANSFER_HOLD_HOURS phải là số nguyên từ 1 đến 72')
      .max(72, 'BANK_TRANSFER_HOLD_HOURS phải là số nguyên từ 1 đến 72')
      .default(24),
    GENERAL_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(100),
    // Limiter nhóm auth (register/login/forgot/reset/change-password). Production giữ 5; E2E đặt cao hơn.
    AUTH_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(5),
    ORDER_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(10),
    COUPON_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(10),
    QUOTE_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(30),
    // D-053: xuất CSV phân tích (GET /admin/analytics/export), theo IP.
    EXPORT_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(10),
    // D-028: captcha bật khi có ĐỦ cả hai; chỉ một trong hai là lỗi cấu hình.
    TURNSTILE_SITE_KEY: z.string().optional(),
    TURNSTILE_SECRET_KEY: z.string().optional(),
    // D-029: 0 = tắt job xóa tin liên hệ cũ.
    CONTACT_RETENTION_DAYS: z.coerce
      .number()
      .int('CONTACT_RETENTION_DAYS phải là số nguyên >= 0')
      .min(0, 'CONTACT_RETENTION_DAYS phải là số nguyên >= 0')
      .default(365),
    // D-057: đơn COD của khách vãng lai (chưa đăng nhập) PENDING quá số giờ này thì job tự hủy.
    GUEST_COD_HOLD_HOURS: z.coerce
      .number()
      .int('GUEST_COD_HOLD_HOURS phải là số nguyên từ 1 đến 720')
      .min(1, 'GUEST_COD_HOLD_HOURS phải là số nguyên từ 1 đến 720')
      .max(720, 'GUEST_COD_HOLD_HOURS phải là số nguyên từ 1 đến 720')
      .default(48),
    // D-057: số đơn COD khách vãng lai đang PENDING tối đa cho cùng SĐT hoặc cùng email.
    GUEST_COD_MAX_OPEN: z.coerce
      .number()
      .int('GUEST_COD_MAX_OPEN phải là số nguyên từ 1 đến 100')
      .min(1, 'GUEST_COD_MAX_OPEN phải là số nguyên từ 1 đến 100')
      .max(100, 'GUEST_COD_MAX_OPEN phải là số nguyên từ 1 đến 100')
      .default(3),
    // D-058: pool chính và pool riêng cho truy vấn phân tích.
    DATABASE_POOL_MAX: z.coerce
      .number()
      .int('DATABASE_POOL_MAX phải là số nguyên từ 1 đến 100')
      .min(1, 'DATABASE_POOL_MAX phải là số nguyên từ 1 đến 100')
      .max(100, 'DATABASE_POOL_MAX phải là số nguyên từ 1 đến 100')
      .default(10),
    ANALYTICS_POOL_MAX: z.coerce
      .number()
      .int('ANALYTICS_POOL_MAX phải là số nguyên từ 1 đến 50')
      .min(1, 'ANALYTICS_POOL_MAX phải là số nguyên từ 1 đến 50')
      .max(50, 'ANALYTICS_POOL_MAX phải là số nguyên từ 1 đến 50')
      .default(4),
    ANALYTICS_STATEMENT_TIMEOUT_MS: z.coerce
      .number()
      .int('ANALYTICS_STATEMENT_TIMEOUT_MS phải là số nguyên từ 1000 đến 120000')
      .min(1000, 'ANALYTICS_STATEMENT_TIMEOUT_MS phải là số nguyên từ 1000 đến 120000')
      .max(120000, 'ANALYTICS_STATEMENT_TIMEOUT_MS phải là số nguyên từ 1000 đến 120000')
      .default(15000),
    // D-063: khóa AES-256-GCM mã hóa secret 2FA (TOTP). Thiếu -> bật 2FA trả 503; production bắt buộc.
    TOTP_ENCRYPTION_KEY: z
      .string()
      .transform((s, ctx) => {
        try {
          return parseTotpKey(s);
        } catch (e) {
          ctx.addIssue({ code: 'custom', message: (e as Error).message });
          return z.NEVER;
        }
      })
      .optional(),
    // D-070: bắt buộc Admin bật 2FA mới dùng được /admin/*. Mặc định tắt ở mọi môi trường (demo).
    REQUIRE_ADMIN_2FA: z.enum(['true', 'false']).optional(),
    SEED_ADMIN_PASSWORD: z.string().optional(),
    SEED_STAFF_PASSWORD: z.string().optional(),
    SEED_CUSTOMER_PASSWORD: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    const missing = (['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'] as const).filter((k) => !v[k]);
    if (missing.length === 1) {
      ctx.addIssue({
        code: 'custom',
        path: [missing[0]!],
        message: `Thiếu ${missing[0]!}: phải đặt cả TURNSTILE_SITE_KEY và TURNSTILE_SECRET_KEY, hoặc bỏ trống cả hai`,
      });
    }
  })
  .superRefine((v, ctx) => {
    // D-060: cổng giả không bao giờ ở production, và không chạy chung với VNPay thật.
    if (v.PAYMENT_MOCKS_ENABLED !== 'true') return;
    if (v.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_MOCKS_ENABLED'],
        message: 'PAYMENT_MOCKS_ENABLED=true không được phép ở production (cổng thanh toán giả)',
      });
    }
    if (v.VNPAY_TMN_CODE) {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_MOCKS_ENABLED'],
        message:
          'PAYMENT_MOCKS_ENABLED=true xung đột với VNPAY_TMN_CODE (VNPay thật đã cấu hình); chỉ bật một trong hai',
      });
    }
  })
  .superRefine((v, ctx) => {
    // Chặn secret mẫu ở production; thông báo KHÔNG in giá trị.
    if (v.NODE_ENV !== 'production') return;
    if (!v.INTERNAL_API_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['INTERNAL_API_SECRET'],
        message:
          'INTERNAL_API_SECRET là bắt buộc ở production (thiếu thì mọi request SSR dùng chung một IP và dính 429)',
      });
    }
    if (v.COOKIE_SECURE === 'false') {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message:
          'COOKIE_SECURE=false không được phép ở production (cookie refresh token phải có cờ Secure); bỏ biến này hoặc đặt true',
      });
    }
    if (!v.TOTP_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['TOTP_ENCRYPTION_KEY'],
        message:
          'TOTP_ENCRYPTION_KEY là bắt buộc ở production (khóa mã hóa secret 2FA, 32 byte: openssl rand -base64 32)',
      });
    } else if (v.TOTP_ENCRYPTION_KEY.subarray(0, 12).toString('utf8') === TOTP_DEV_KEY_PREFIX) {
      ctx.addIssue({
        code: 'custom',
        path: ['TOTP_ENCRYPTION_KEY'],
        message:
          'TOTP_ENCRYPTION_KEY đang dùng giá trị mẫu dev; production phải dùng khóa ngẫu nhiên riêng',
      });
    }
    for (const key of ['JWT_ACCESS_SECRET', 'INTERNAL_API_SECRET'] as const) {
      if (v[key]?.startsWith('dev-')) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} đang dùng giá trị mẫu (bắt đầu bằng "dev-"); production phải dùng secret ngẫu nhiên riêng`,
        });
      }
    }
  })
  .transform(
    ({
      COOKIE_SECURE,
      JOBS_ENABLED,
      SMTP_SECURE,
      SMTP_REQUIRE_TLS,
      PAYMENT_MOCKS_ENABLED,
      BANK_TRANSFER_ENABLED,
      REQUIRE_ADMIN_2FA,
      PAYMENT_MOCK_SECRET,
      ...v
    }) => ({
      ...v,
      PAYMENT_MOCKS_ENABLED: PAYMENT_MOCKS_ENABLED === 'true',
      /** Có giá trị khi mock bật: đặt tường minh hoặc sinh ngẫu nhiên (PAYMENT_MOCK_SECRET_GENERATED). */
      PAYMENT_MOCK_SECRET:
        PAYMENT_MOCKS_ENABLED === 'true'
          ? (PAYMENT_MOCK_SECRET ?? randomBytes(24).toString('hex'))
          : undefined,
      PAYMENT_MOCK_SECRET_GENERATED: PAYMENT_MOCKS_ENABLED === 'true' && !PAYMENT_MOCK_SECRET,
      BANK_TRANSFER_ENABLED: BANK_TRANSFER_ENABLED === 'true',
      /** D-070: mặc định false (chỉ bật tường minh). */
      REQUIRE_ADMIN_2FA: REQUIRE_ADMIN_2FA === 'true',
      /** Mặc định false (TLS ngầm định chỉ bật tường minh). */
      SMTP_SECURE: SMTP_SECURE === 'true',
      /** Mặc định true khi production, false nơi khác; đặt tường minh thì theo giá trị đặt. */
      SMTP_REQUIRE_TLS: SMTP_REQUIRE_TLS
        ? SMTP_REQUIRE_TLS === 'true'
        : v.NODE_ENV === 'production',
      VNPAY_RETURN_URL: v.VNPAY_RETURN_URL ?? `${v.WEB_APP_URL}/thanh-toan/ket-qua?provider=vnpay`,
      /** Mặc định true; NODE_ENV=test luôn false. */
      JOBS_ENABLED: v.NODE_ENV === 'test' ? false : JOBS_ENABLED !== 'false',
      /** Đã tính: mặc định true khi production. */
      COOKIE_SECURE: COOKIE_SECURE ? COOKIE_SECURE === 'true' : v.NODE_ENV === 'production',
      accessTokenTtlSec: ttlToSeconds(v.ACCESS_TOKEN_TTL),
    }),
  );

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
