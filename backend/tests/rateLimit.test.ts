import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const URL = '/api/v1/categories';
const SECRET = process.env.INTERNAL_API_SECRET!;

describe('rate limit chung', () => {
  it('lần 3 bị 429 kèm Retry-After; health không tính', async () => {
    const app = createApp({ generalRateLimit: 2 });
    for (let i = 0; i < 5; i++) expect((await request(app).get('/api/v1/health')).status).toBe(200);
    expect((await request(app).get(URL)).status).not.toBe(429);
    expect((await request(app).get(URL)).status).not.toBe(429);
    const r = await request(app).get(URL);
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('RATE_LIMITED');
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('secret nội bộ đúng -> không bị giới hạn', async () => {
    const app = createApp({ generalRateLimit: 2 });
    for (let i = 0; i < 6; i++) {
      const r = await request(app).get(URL).set('X-Internal-Secret', SECRET);
      expect(r.status).not.toBe(429);
    }
  });

  it('secret sai -> vẫn 429', async () => {
    const app = createApp({ generalRateLimit: 2 });
    let last = 0;
    for (let i = 0; i < 3; i++) {
      last = (await request(app).get(URL).set('X-Internal-Secret', 'sai-secret')).status;
    }
    expect(last).toBe(429);
  });
});
