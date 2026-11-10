import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { AppError } from '../src/lib/errors.js';
import { prisma } from '../src/lib/prisma.js';
import { asyncHandler } from '../src/lib/asyncHandler.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import { notFound } from '../src/middlewares/notFound.js';
import { requestId } from '../src/middlewares/requestId.js';
import { validate } from '../src/middlewares/validate.js';

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/v1/health', () => {
  it('trả 200 đúng contract khi DB hoạt động', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'ok', db: 'up', version: '0.1.0' });
    expect(typeof res.body.data.uptimeSec).toBe('number');
    expect(new Date(res.body.data.time).toISOString()).toBe(res.body.data.time);
  });

  it('không bị rate limit chung', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBeUndefined();
    }
  });
});

describe('X-Request-Id', () => {
  it('luôn có trong response', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('dùng lại id hợp lệ client gửi, thay id không hợp lệ', async () => {
    const ok = await request(app).get('/api/v1/health').set('X-Request-Id', 'client-req-12345');
    expect(ok.headers['x-request-id']).toBe('client-req-12345');
    const bad = await request(app).get('/api/v1/health').set('X-Request-Id', 'x"<script>');
    expect(bad.headers['x-request-id']).not.toBe('x"<script>');
    expect(bad.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('route không tồn tại', () => {
  it('trả 404 NOT_FOUND đúng format và vẫn có X-Request-Id', async () => {
    const res = await request(app).get('/api/v1/khong-ton-tai');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});

describe('CORS', () => {
  it('cho origin trong whitelist kèm credentials, không cho origin lạ', async () => {
    const ok = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:3000');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const bad = await request(app).get('/api/v1/health').set('Origin', 'http://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('errorHandler (app thử nghiệm)', () => {
  const t = express();
  t.use(requestId);
  t.use(express.json({ limit: '100kb' }));
  t.post(
    '/validate',
    validate(
      z.object({ email: z.email('Email không đúng định dạng'), qty: z.number().int().min(1) }),
    ),
    (_req, res) => {
      res.json({ data: 'ok' });
    },
  );
  t.get('/app-error', () => {
    throw new AppError(409, 'OUT_OF_STOCK', 'Không đủ tồn kho', { items: [] });
  });
  t.get(
    '/boom',
    asyncHandler(async () => {
      throw new Error('chi tiết nội bộ bí mật');
    }),
  );
  t.use(notFound);
  t.use(errorHandler);

  it('ZodError -> 400 VALIDATION_ERROR kèm details[{field,message}]', async () => {
    const res = await request(t).post('/validate').send({ email: 'abc', qty: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toBe('Dữ liệu không hợp lệ');
    const fields = res.body.error.details.map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(['email', 'qty']);
    expect(res.body.error.details[0]).toHaveProperty('message');
  });

  it('hợp lệ thì đi tiếp', async () => {
    const res = await request(t).post('/validate').send({ email: 'a@b.vn', qty: 2 });
    expect(res.status).toBe(200);
  });

  it('JSON hỏng -> 400 VALIDATION_ERROR', async () => {
    const res = await request(t)
      .post('/validate')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('AppError giữ nguyên status/code/details', async () => {
    const res = await request(t).get('/app-error');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: 'OUT_OF_STOCK', message: 'Không đủ tồn kho', details: { items: [] } },
    });
  });

  it('lỗi lạ -> 500 INTERNAL_ERROR, không lộ chi tiết/stack', async () => {
    const res = await request(t).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('bí mật');
    expect(JSON.stringify(res.body)).not.toContain('at ');
  });
});

describe('rate limit chung', () => {
  it('vượt 100 req/phút -> 429 RATE_LIMITED + Retry-After', async () => {
    const limited = createApp();
    let last = await request(limited).get('/api/v1/x');
    for (let i = 0; i < 100; i++) last = await request(limited).get('/api/v1/x');
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe('RATE_LIMITED');
    expect(Number(last.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('health khi DB lỗi', () => {
  it('trả 503 SERVICE_UNAVAILABLE', async () => {
    const spy = vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/api/v1/health');
    spy.mockRestore();
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
