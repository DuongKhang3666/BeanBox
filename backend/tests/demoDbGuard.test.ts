import { describe, expect, it } from 'vitest';
import {
  endpointOf,
  parseDemoArgs,
  parseEnvFile,
  resolveDemoDatabaseUrl,
} from '../scripts/demoDbGuard.js';

// URL giả dựng lúc chạy (không để literal giống secret cho scanner).
const url = (port: number, db = 'demo', host = '127.0.0.1') =>
  `postgresql://u:${['p', 'w'].join('')}@${host}:${port}/${db}`;

describe('resolveDemoDatabaseUrl (rào an toàn script sinh dữ liệu demo)', () => {
  it('chấp nhận DB tạm ở cổng khác 5432', () => {
    expect(resolveDemoDatabaseUrl({ DEMO_DATABASE_URL: url(55442) }, {})).toBe(url(55442));
  });

  it('chấp nhận host nội bộ compose (db:5432) và vẫn chặn khi trùng DATABASE_URL (D-066)', () => {
    const inCompose = url(5432, 'beanbox', 'db');
    expect(resolveDemoDatabaseUrl({ DEMO_DATABASE_URL: inCompose }, {})).toBe(inCompose);
    // init demo phải gỡ DATABASE_URL khỏi môi trường của generator; nếu để nguyên thì rào từ chối
    expect(() =>
      resolveDemoDatabaseUrl({ DEMO_DATABASE_URL: inCompose, DATABASE_URL: inCompose }, {}),
    ).toThrow(/trùng/);
  });

  it('chấp nhận host từ xa cổng 5432 (không phải DB dev cục bộ)', () => {
    const remote = url(5432, 'demo', 'db.internal.example');
    expect(resolveDemoDatabaseUrl({ DEMO_DATABASE_URL: remote }, {})).toBe(remote);
  });

  it('thiếu DEMO_DATABASE_URL -> từ chối, kể cả khi có DATABASE_URL', () => {
    expect(() => resolveDemoDatabaseUrl({ DATABASE_URL: url(55442) }, {})).toThrow(/Thiếu/);
    expect(() => resolveDemoDatabaseUrl({}, {})).toThrow(/Thiếu/);
  });

  it('NODE_ENV=production -> từ chối', () => {
    expect(() =>
      resolveDemoDatabaseUrl({ NODE_ENV: 'production', DEMO_DATABASE_URL: url(55442) }, {}),
    ).toThrow(/production/);
  });

  it('không phải URL hợp lệ -> từ chối', () => {
    expect(() => resolveDemoDatabaseUrl({ DEMO_DATABASE_URL: 'khong-phai-url' }, {})).toThrow(
      /không phải URL/,
    );
  });

  it('trùng DATABASE_URL trong môi trường hoặc backend/.env (kể cả khác thông tin đăng nhập)', () => {
    const same = url(55442);
    expect(() =>
      resolveDemoDatabaseUrl({ DEMO_DATABASE_URL: same, DATABASE_URL: same }, {}),
    ).toThrow(/trùng/);
    expect(() =>
      resolveDemoDatabaseUrl({ DEMO_DATABASE_URL: same }, { DATABASE_URL: same }),
    ).toThrow(/trùng/);
    const otherUser = `postgresql://khac:khac@127.0.0.1:55442/demo`;
    expect(() =>
      resolveDemoDatabaseUrl({ DEMO_DATABASE_URL: same }, { DATABASE_URL: otherUser }),
    ).toThrow(/trùng/);
  });

  it('localhost cổng 5432 (mặc định, mặc định cổng khi bỏ trống) -> từ chối', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect(() =>
        resolveDemoDatabaseUrl({ DEMO_DATABASE_URL: url(5432, 'demo', host) }, {}),
      ).toThrow(/5432/);
    }
    expect(() =>
      resolveDemoDatabaseUrl({ DEMO_DATABASE_URL: 'postgresql://u:p@localhost/demo' }, {}),
    ).toThrow(/5432/);
  });

  it('thông báo lỗi không chứa URL hay mật khẩu', () => {
    const secret = url(5432, 'demo', 'localhost');
    try {
      resolveDemoDatabaseUrl({ DEMO_DATABASE_URL: secret, DATABASE_URL: secret }, {});
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain('postgresql://');
      expect(msg).not.toContain('pw@');
    }
  });
});

describe('endpointOf / parseEnvFile', () => {
  it('lấy host, cổng, tên DB; cổng mặc định 5432', () => {
    expect(endpointOf('postgresql://u:p@LocalHost/abc')).toEqual({
      host: 'localhost',
      port: '5432',
      db: '/abc',
    });
    expect(endpointOf('khong-hop-le')).toBeNull();
  });

  it('đọc KEY=VALUE, bỏ dấu nháy và CRLF', () => {
    const env = parseEnvFile('A=1\r\n# chú thích\r\nDATABASE_URL="postgresql://x"\r\nB = hai \n');
    expect(env).toMatchObject({ A: '1', DATABASE_URL: 'postgresql://x', B: 'hai' });
  });
});

describe('parseDemoArgs', () => {
  it('mặc định và giá trị truyền vào', () => {
    expect(parseDemoArgs([])).toMatchObject({ orders: 1000, days: 365, seed: 42, reset: false });
    expect(
      parseDemoArgs(['--orders', '100000', '--days', '365', '--seed', '7', '--reset']),
    ).toMatchObject({ orders: 100000, days: 365, seed: 7, reset: true });
  });

  it('--skip-if-exists mặc định tắt, bật khi truyền', () => {
    expect(parseDemoArgs([]).skipIfExists).toBe(false);
    expect(parseDemoArgs(['--skip-if-exists']).skipIfExists).toBe(true);
  });

  it('tham số sai -> lỗi tiếng Việt', () => {
    expect(() => parseDemoArgs(['--orders'])).toThrow(/--orders/);
    expect(() => parseDemoArgs(['--orders', 'abc'])).toThrow(/--orders/);
    expect(() => parseDemoArgs(['--days', '0'])).toThrow(/--days/);
    expect(() => parseDemoArgs(['--orders', '99999999'])).toThrow(/--orders/);
    expect(() => parseDemoArgs(['--lung-tung'])).toThrow(/không hợp lệ/);
  });
});
