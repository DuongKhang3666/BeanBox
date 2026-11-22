import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..');
const TSX_CLI = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CHECK_ENV = path.join(ROOT, 'src', 'checkEnv.ts');

const DEV_SECRET = 'dev-' + 'b'.repeat(40);
const GOOD_SECRET = 'Qx4' + 'm8'.repeat(20);
const GOOD_INTERNAL = 'Hv2' + 'p7'.repeat(20);

/** Chạy checkEnv trong tiến trình con với env tối thiểu (cwd ngoài repo nên không nạp backend/.env). */
function run(env: Record<string, string>) {
  const r = spawnSync(process.execPath, [TSX_CLI, CHECK_ENV], {
    cwd: tmpdir(),
    env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', ...env },
    encoding: 'utf8',
    timeout: 30_000,
  });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
}

describe('checkEnv (entrypoint kiểm env trước migrate)', () => {
  it('production + JWT_ACCESS_SECRET dạng dev- -> thoát khác 0, không in giá trị secret', () => {
    const r = run({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@db:5432/x',
      JWT_ACCESS_SECRET: DEV_SECRET,
      INTERNAL_API_SECRET: GOOD_INTERNAL,
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('JWT_ACCESS_SECRET');
    expect(r.out).not.toContain(DEV_SECRET);
    expect(r.out).not.toContain(GOOD_INTERNAL);
  });

  it('thiếu biến bắt buộc -> thoát khác 0', () => {
    const r = run({ NODE_ENV: 'production' });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('DATABASE_URL');
  });

  it('env hợp lệ -> thoát 0, không in giá trị secret/URL', () => {
    const r = run({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:pw-secret-xyz@db:5432/x',
      JWT_ACCESS_SECRET: GOOD_SECRET,
      INTERNAL_API_SECRET: GOOD_INTERNAL,
      TOTP_ENCRYPTION_KEY: 'a1'.repeat(32),
    });
    expect(r.code).toBe(0);
    expect(r.out).not.toContain(GOOD_SECRET);
    expect(r.out).not.toContain(GOOD_INTERNAL);
    expect(r.out).not.toContain('pw-secret-xyz');
  });
});
