import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { API } from './authHelpers.js';

let app: Express;
beforeAll(() => {
  app = createApp({ generalRateLimit: 100_000, authRateLimit: 100_000 });
});

describe('GET /locations/provinces', () => {
  it('trả đủ 34 tỉnh, shape {code,name}, sắp theo code, có Cache-Control', async () => {
    const r = await request(app).get(`${API}/locations/provinces`);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('public, max-age=86400');
    expect(r.headers.etag).toBeTruthy();
    const data = r.body.data as Array<{ code: string; name: string }>;
    expect(data).toHaveLength(34);
    for (const p of data) expect(Object.keys(p).sort()).toEqual(['code', 'name']);
    const codes = data.map((p) => p.code);
    expect(codes).toEqual([...codes].sort());
    expect(data.find((p) => p.code === '01')?.name).toBe('Thành phố Hà Nội');
    expect(data.find((p) => p.code === '79')?.name).toBe('Thành phố Hồ Chí Minh');
  });
});

describe('GET /locations/provinces/:code/wards', () => {
  it('Hà Nội có Phường Hoàn Kiếm, sắp theo tên, có Cache-Control', async () => {
    const r = await request(app).get(`${API}/locations/provinces/01/wards`);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('public, max-age=86400');
    const data = r.body.data as Array<{ code: string; name: string }>;
    expect(data).toContainEqual({ code: '00070', name: 'Phường Hoàn Kiếm' });
    for (const w of data) expect(Object.keys(w).sort()).toEqual(['code', 'name']);
    const collator = new Intl.Collator('vi');
    const names = data.map((w) => w.name);
    expect(names).toEqual([...names].sort(collator.compare));
  });

  it('mã sai định dạng / không tồn tại / __proto__ -> 404, không gắn Cache-Control public', async () => {
    for (const code of ['99', 'abc', '__proto__', 'constructor', '1', '001']) {
      const r = await request(app).get(`${API}/locations/provinces/${code}/wards`);
      expect(r.status, code).toBe(404);
      expect(r.body.error.code).toBe('NOT_FOUND');
      expect(r.body.error.message).toBe('Không tìm thấy tỉnh/thành');
      expect(r.headers['cache-control'] ?? '').not.toContain('public');
    }
  });
});
