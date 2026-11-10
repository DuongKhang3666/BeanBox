import express from 'express';
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { optionalAuth, requireAdmin, requireAuth, requireStaff } from '../src/middlewares/auth.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import { requireAllowedOrigin } from '../src/middlewares/originCheck.js';

const PREFIX = 'tauth-';
type R = 'CUSTOMER' | 'STAFF' | 'ADMIN';

const app = express();
app.get('/me', requireAuth, (req, res) => res.json({ auth: req.auth }));
app.get('/opt', optionalAuth, (req, res) => res.json({ auth: req.auth ?? null }));
app.get('/staff', requireAuth, requireStaff, (_req, res) => res.json({ ok: true }));
app.get('/admin', requireAuth, requireAdmin, (_req, res) => res.json({ ok: true }));
app.post('/origin', requireAllowedOrigin, (_req, res) => res.json({ ok: true }));
app.use(errorHandler);

const ids: Record<string, string> = {};
const tok = (key: string, role: R) => signAccessToken({ sub: ids[key]!, role, sid: 'sess1' });

async function mk(key: string, role: R, status: 'ACTIVE' | 'DISABLED' = 'ACTIVE') {
  const u = await prisma.user.create({
    data: { email: `${PREFIX}${key}@example.test`, passwordHash: 'x', fullName: key, role, status },
  });
  ids[key] = u.id;
}

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await mk('cust', 'CUSTOMER');
  await mk('staff', 'STAFF');
  await mk('admin', 'ADMIN');
  await mk('off', 'CUSTOMER', 'DISABLED');
  await mk('gone', 'CUSTOMER');
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('requireAuth', () => {
  it('thiếu token -> 401', async () => {
    const r = await request(app).get('/me');
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('UNAUTHORIZED');
  });
  it('token rác / sai scheme -> 401', async () => {
    expect((await request(app).get('/me').set(bearer('rac'))).status).toBe(401);
    expect((await request(app).get('/me').set('Authorization', 'Basic abc')).status).toBe(401);
  });
  it('token hợp lệ -> 200 với req.auth', async () => {
    const r = await request(app)
      .get('/me')
      .set(bearer(await tok('cust', 'CUSTOMER')));
    expect(r.status).toBe(200);
    expect(r.body.auth).toEqual({ userId: ids.cust, role: 'CUSTOMER', sessionId: 'sess1' });
  });
  it('token hết hạn -> 401', async () => {
    const t = await new SignJWT({ role: 'CUSTOMER', sid: 's' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(ids.cust!)
      .setIssuer('beanbox-api')
      .setAudience('beanbox-web')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET));
    expect((await request(app).get('/me').set(bearer(t))).status).toBe(401);
  });
  it('user DISABLED -> 403 ACCOUNT_DISABLED', async () => {
    const r = await request(app)
      .get('/me')
      .set(bearer(await tok('off', 'CUSTOMER')));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('ACCOUNT_DISABLED');
  });
  it('user đã xóa -> 401', async () => {
    const t = await tok('gone', 'CUSTOMER');
    await prisma.user.delete({ where: { id: ids.gone! } });
    expect((await request(app).get('/me').set(bearer(t))).status).toBe(401);
  });
});

describe('optionalAuth', () => {
  it('không header -> guest', async () => {
    const r = await request(app).get('/opt');
    expect(r.status).toBe(200);
    expect(r.body.auth).toBeNull();
  });
  it('token sai -> 401, không thành guest', async () => {
    expect((await request(app).get('/opt').set(bearer('rac'))).status).toBe(401);
  });
  it('token đúng -> có auth', async () => {
    const r = await request(app)
      .get('/opt')
      .set(bearer(await tok('cust', 'CUSTOMER')));
    expect(r.body.auth.userId).toBe(ids.cust);
  });
});

describe('requireRole', () => {
  it('CUSTOMER bị 403 FORBIDDEN ở route staff/admin', async () => {
    const t = await tok('cust', 'CUSTOMER');
    for (const p of ['/staff', '/admin']) {
      const r = await request(app).get(p).set(bearer(t));
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('FORBIDDEN');
    }
  });
  it('STAFF qua staff, không qua admin; ADMIN qua cả hai', async () => {
    const s = await tok('staff', 'STAFF');
    expect((await request(app).get('/staff').set(bearer(s))).status).toBe(200);
    expect((await request(app).get('/admin').set(bearer(s))).status).toBe(403);
    const a = await tok('admin', 'ADMIN');
    expect((await request(app).get('/staff').set(bearer(a))).status).toBe(200);
    expect((await request(app).get('/admin').set(bearer(a))).status).toBe(200);
  });
  it('claim role=ADMIN nhưng DB là CUSTOMER -> 403', async () => {
    const r = await request(app)
      .get('/admin')
      .set(bearer(await tok('cust', 'ADMIN')));
    expect(r.status).toBe(403);
  });
});

describe('requireAllowedOrigin', () => {
  it('thiếu / null / sai -> 403 INVALID_ORIGIN', async () => {
    const bad = [
      undefined,
      'null',
      'http://evil.test',
      'http://localhost:3000/',
      'http://localhost:3001',
    ];
    for (const o of bad) {
      const req = request(app).post('/origin');
      const r = await (o === undefined ? req : req.set('Origin', o));
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('INVALID_ORIGIN');
    }
  });
  it('đúng -> qua', async () => {
    const r = await request(app).post('/origin').set('Origin', 'http://localhost:3000');
    expect(r.status).toBe(200);
  });
});
