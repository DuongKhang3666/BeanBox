import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { API } from './authHelpers.js';

describe('GET /health/live (D-030)', () => {
  it('200 { data: { status: "ok" } }, không cần auth', async () => {
    const res = await request(createApp()).get(`${API}/health/live`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok' } });
  });

  it('không bị rate limit chung (health và health/live)', async () => {
    const app = createApp({ generalRateLimit: 2 });
    for (let i = 0; i < 6; i++) {
      expect((await request(app).get(`${API}/health/live`)).status).toBe(200);
    }
    for (let i = 0; i < 6; i++) {
      expect((await request(app).get(`${API}/health`)).status).toBe(200);
    }
    // Đối chứng: route khác vẫn bị giới hạn.
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await request(app).get(`${API}/brands`)).status);
    expect(codes).toContain(429);
  });
});
