/**
 * Rào an toàn cho script sinh dữ liệu demo (generate-demo-orders.ts). Hàm thuần, dễ kiểm thử.
 * Script CHỈ được chạy trên một DB tạm; mọi thông báo lỗi KHÔNG in URL hay mật khẩu.
 */

export interface DbEndpoint {
  host: string;
  port: string;
  db: string;
}

export function endpointOf(url: string): DbEndpoint | null {
  try {
    const u = new URL(url);
    return {
      host: u.hostname.replace(/^\[|\]$/g, '').toLowerCase(),
      port: u.port || '5432',
      db: u.pathname,
    };
  } catch {
    return null;
  }
}

/** Đọc các dòng KEY=VALUE của một file .env (đơn giản, đủ cho DATABASE_URL). */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];

/**
 * Trả URL DB demo nếu an toàn, ngược lại ném lỗi. Chỉ đọc `DEMO_DATABASE_URL` (không dùng
 * `DATABASE_URL`). Từ chối khi: thiếu, không phải URL, NODE_ENV=production, trùng DATABASE_URL
 * (trong môi trường hoặc backend/.env), hoặc là localhost cổng 5432 (DB dev mặc định).
 */
export function resolveDemoDatabaseUrl(
  env: Readonly<Record<string, string | undefined>>,
  backendEnv: Readonly<Record<string, string>>,
): string {
  if (env.NODE_ENV === 'production') {
    throw new Error('Từ chối chạy khi NODE_ENV=production.');
  }
  const url = env.DEMO_DATABASE_URL;
  if (!url) {
    throw new Error(
      'Thiếu DEMO_DATABASE_URL. Script chỉ chạy trên DB tạm (xem docs/testing.md, mục dữ liệu demo).',
    );
  }
  const target = endpointOf(url);
  if (!target) throw new Error('DEMO_DATABASE_URL không phải URL hợp lệ.');
  const devUrls = [backendEnv.DATABASE_URL, env.DATABASE_URL].filter((v): v is string => !!v);
  for (const dev of devUrls) {
    const d = endpointOf(dev);
    if (
      dev === url ||
      (d && d.host === target.host && d.port === target.port && d.db === target.db)
    ) {
      throw new Error('DEMO_DATABASE_URL trùng DATABASE_URL (DB dev). Dùng DB tạm riêng.');
    }
  }
  if (LOCAL_HOSTS.includes(target.host) && target.port === '5432') {
    throw new Error(
      'DEMO_DATABASE_URL trỏ cổng 5432 trên máy này (DB dev). Dùng DB tạm ở cổng khác, ví dụ 55442.',
    );
  }
  return url;
}

export interface DemoArgs {
  orders: number;
  days: number;
  seed: number;
  batch: number;
  reset: boolean;
  /** Đã có dữ liệu demo cùng seed thì thoát thành công, không sinh thêm (dùng cho `up` lặp lại của demo một lệnh, D-066). */
  skipIfExists: boolean;
}

/** Phân tích tham số dòng lệnh; ném lỗi tiếng Việt khi sai. */
export function parseDemoArgs(argv: readonly string[]): DemoArgs {
  const out: DemoArgs = {
    orders: 1000,
    days: 365,
    seed: 42,
    batch: 10000,
    reset: false,
    skipIfExists: false,
  };
  const intArg = (name: string, raw: string | undefined, min: number, max: number): number => {
    if (raw === undefined || !/^\d+$/.test(raw))
      throw new Error(`${name} phải là số nguyên không âm.`);
    const n = Number(raw);
    if (n < min || n > max) throw new Error(`${name} phải trong khoảng ${min}..${max}.`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--reset') out.reset = true;
    else if (a === '--skip-if-exists') out.skipIfExists = true;
    else if (a === '--orders') out.orders = intArg('--orders', argv[++i], 1, 2_000_000);
    else if (a === '--days') out.days = intArg('--days', argv[++i], 1, 1095);
    else if (a === '--seed') out.seed = intArg('--seed', argv[++i], 0, 2_000_000_000);
    else if (a === '--batch') out.batch = intArg('--batch', argv[++i], 100, 50_000);
    else throw new Error(`Tham số không hợp lệ: ${a}`);
  }
  return out;
}
