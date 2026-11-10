import type { Express } from 'express';
import request from 'supertest';
import { clearTestOutbox, testOutbox } from '../src/lib/mailer.js';
import { sha256Hex } from '../src/lib/tokens.js';

export const PREFIX = 'tm2a-';
export const PW = 'Matkhau123';
export const ORIGIN = 'http://localhost:3000';
export const API = '/api/v1';

export const emailOf = (key: string) => `${PREFIX}${key}@example.test`;

export function setCookies(res: request.Response): string[] {
  const h = res.headers['set-cookie'] as unknown;
  return Array.isArray(h) ? (h as string[]) : [];
}

/** Giá trị bb_rt trong Set-Cookie của response (chuỗi rỗng nếu là lệnh xóa). */
export function rtOf(res: request.Response): string | undefined {
  const line = setCookies(res).find((c) => c.startsWith('bb_rt='));
  if (!line) return undefined;
  const v = line.slice('bb_rt='.length).split(';')[0];
  return v === '' ? undefined : v;
}

export const tokenFromMail = (text: string): string => {
  const m = /token=([\w-]+)/.exec(text);
  if (!m?.[1]) throw new Error('Không tìm thấy token trong email');
  return m[1];
};

export const hashOf = sha256Hex;

export { clearTestOutbox, testOutbox };

/** Đợi mail nền tới `to` (gửi không chờ) rồi trả mail mới nhất. */
export async function waitForMail(to: string, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = testOutbox.filter((m) => m.to === to);
    if (found.length > 0) return found[found.length - 1]!;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Không có mail gửi tới ${to}`);
}

export async function registerUser(
  app: Express,
  email: string,
  extra: Record<string, unknown> = {},
) {
  const res = await request(app)
    .post(`${API}/auth/register`)
    .send({ fullName: 'Nguyễn Văn An', email, password: PW, ...extra });
  return {
    res,
    rt: rtOf(res),
    accessToken: (res.body as { data?: { accessToken?: string } }).data?.accessToken ?? '',
    userId: (res.body as { data?: { user?: { id?: string } } }).data?.user?.id ?? '',
  };
}

export const login = (app: Express, email: string, password: string = PW) =>
  request(app).post(`${API}/auth/login`).send({ email, password });

export const refreshWith = (app: Express, rt: string | undefined) => {
  const r = request(app).post(`${API}/auth/refresh`).set('Origin', ORIGIN);
  return rt ? r.set('Cookie', `bb_rt=${rt}`) : r;
};

export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
