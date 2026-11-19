import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { API } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

const PREFIX = 'tm6a-';
const BIG = 100_000;

let app: Express;
const fx = createFixtures(() => app, PREFIX);
let admin: { id: string; who: Who };
let staff: { id: string; who: Who };
let customer: { id: string; who: Who };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const list = (q = '', who: Who = admin.who) => fx.call('get', `/admin/audit-logs${q}`, who);
const idsOf = (res: request.Response): string[] =>
  (dataOf(res) as Json[]).map((r) => r.id as string);

async function cleanAudit() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [{ action: { startsWith: 'tm6a' } }, { actorId: { in: users.map((u) => u.id) } }],
    },
  });
}

beforeAll(async () => {
  app = createApp({ generalRateLimit: BIG, authRateLimit: BIG });
  await cleanAudit();
  await fx.setup();
  admin = await fx.mkUser('admin');
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  staff = await fx.mkUser('staff');
  await prisma.user.update({ where: { id: staff.id }, data: { role: 'STAFF' } });
  customer = await fx.mkUser('cust');

  const rows = [
    // 23:59:59.999 VN ngày 10/01/2030
    {
      id: 'tm6aa001',
      action: 'tm6a-order.status',
      entity: 'Tm6aOrder',
      entityId: 'tm6aid1',
      actorId: staff.id,
      createdAt: '2030-01-10T16:59:59.999Z',
      diff: { status: ['PENDING', 'CONFIRMED'] },
    },
    // 00:00 VN ngày 11/01/2030
    {
      id: 'tm6aa002',
      action: 'tm6a-order.cancel',
      entity: 'Tm6aOrder',
      entityId: 'tm6aid2',
      actorId: admin.id,
      createdAt: '2030-01-10T17:00:00.000Z',
      diff: null,
    },
    {
      id: 'tm6aa003',
      action: 'tm6a-product.update',
      entity: 'Tm6aProduct',
      entityId: 'tm6aid1',
      actorId: null,
      createdAt: '2030-01-11T10:00:00.000Z',
      diff: { price: [1, 2], tags: [['a'], ['a', 'b']] },
    },
    {
      id: 'tm6aa004',
      action: 'tm6a_under',
      entity: 'Tm6aOther',
      entityId: null,
      actorId: null,
      createdAt: '2030-01-12T10:00:00.000Z',
      diff: null,
    },
    {
      id: 'tm6aa005',
      action: 'tm6aXunder',
      entity: 'Tm6aOther',
      entityId: null,
      actorId: null,
      createdAt: '2030-01-12T11:00:00.000Z',
      diff: null,
    },
    // Hai dòng cùng thời điểm: id DESC
    {
      id: 'tm6aa006',
      action: 'tm6a-tie',
      entity: 'Tm6aTie',
      entityId: null,
      actorId: null,
      createdAt: '2030-01-13T00:00:00.000Z',
      diff: null,
    },
    {
      id: 'tm6aa007',
      action: 'tm6a-tie',
      entity: 'Tm6aTie',
      entityId: null,
      actorId: null,
      createdAt: '2030-01-13T00:00:00.000Z',
      diff: null,
    },
  ];
  for (const r of rows) {
    await prisma.auditLog.create({
      data: {
        id: r.id,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        actorId: r.actorId,
        ip: '127.0.0.1',
        createdAt: new Date(r.createdAt),
        ...(r.diff ? { diff: r.diff } : {}),
      },
    });
  }
});
afterAll(async () => {
  await cleanAudit();
  await fx.clean();
  await prisma.$disconnect();
});

describe('GET /admin/audit-logs - quyền', () => {
  it('401 thiếu token, 403 customer và staff, 200 admin, no-store', async () => {
    expect((await request(app).get(`${API}/admin/audit-logs`)).status).toBe(401);
    expect((await list('', customer.who)).status).toBe(403);
    const s = await list('', staff.who);
    expect(s.status).toBe(403);
    expect(errOf(s).code).toBe('FORBIDDEN');
    const a = await list('?actionPrefix=tm6a');
    expect(a.status).toBe(200);
    expect(a.headers['cache-control']).toBe('no-store');
  });
});

describe('GET /admin/audit-logs - lọc và sắp xếp', () => {
  it('sắp createdAt DESC rồi id DESC, có meta', async () => {
    const res = await list('?actionPrefix=tm6a');
    expect(res.status).toBe(200);
    expect(idsOf(res)).toEqual([
      'tm6aa007',
      'tm6aa006',
      'tm6aa005',
      'tm6aa004',
      'tm6aa003',
      'tm6aa002',
      'tm6aa001',
    ]);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 7, totalPages: 1 });
  });

  it('phân trang', async () => {
    const res = await list('?actionPrefix=tm6a&pageSize=3&page=3');
    expect(idsOf(res)).toEqual(['tm6aa001']);
    expect(res.body.meta).toEqual({ page: 3, pageSize: 3, total: 7, totalPages: 3 });
    expect(idsOf(await list('?actionPrefix=tm6a&pageSize=3&page=9'))).toEqual([]);
  });

  it('action: một hoặc nhiều giá trị phân cách phẩy, khớp chính xác', async () => {
    expect(idsOf(await list('?action=tm6a-order.status'))).toEqual(['tm6aa001']);
    expect(idsOf(await list('?action=tm6a-order.status,tm6a-product.update'))).toEqual([
      'tm6aa003',
      'tm6aa001',
    ]);
    expect(idsOf(await list('?action=tm6a-order'))).toEqual([]);
  });

  it('actionPrefix: khớp đầu chuỗi, escape ký tự LIKE', async () => {
    expect(idsOf(await list('?actionPrefix=tm6a-order.'))).toEqual(['tm6aa002', 'tm6aa001']);
    // `_` là ký tự thường, không phải wildcard: không khớp 'tm6aXunder'
    expect(idsOf(await list('?actionPrefix=tm6a_'))).toEqual(['tm6aa004']);
    expect(idsOf(await list('?actionPrefix=%25'))).toEqual([]);
  });

  it('action cùng actionPrefix lấy hợp', async () => {
    expect(idsOf(await list('?action=tm6a-product.update&actionPrefix=tm6a-order.'))).toEqual([
      'tm6aa003',
      'tm6aa002',
      'tm6aa001',
    ]);
  });

  it('entity, entityId, actorId', async () => {
    expect(idsOf(await list('?entity=Tm6aOrder'))).toEqual(['tm6aa002', 'tm6aa001']);
    expect(idsOf(await list('?entityId=tm6aid1'))).toEqual(['tm6aa003', 'tm6aa001']);
    expect(idsOf(await list('?entity=Tm6aOrder&entityId=tm6aid1'))).toEqual(['tm6aa001']);
    expect(idsOf(await list(`?actorId=${staff.id}`))).toEqual(['tm6aa001']);
    expect(idsOf(await list(`?actorId=${admin.id}&actionPrefix=tm6a`))).toEqual(['tm6aa002']);
  });

  it('from/to theo giờ VN, gồm cả hai đầu', async () => {
    // 11/01 VN: từ 2030-01-10T17:00Z đến 2030-01-11T16:59:59.999Z
    expect(idsOf(await list('?actionPrefix=tm6a&from=2030-01-11&to=2030-01-11'))).toEqual([
      'tm6aa003',
      'tm6aa002',
    ]);
    expect(idsOf(await list('?actionPrefix=tm6a&to=2030-01-10'))).toEqual(['tm6aa001']);
    expect(idsOf(await list('?actionPrefix=tm6a&from=2030-01-12'))).toEqual([
      'tm6aa007',
      'tm6aa006',
      'tm6aa005',
      'tm6aa004',
    ]);
  });

  it('actor kèm email/role, null khi hệ thống ghi; diff trả nguyên JSON', async () => {
    const res = await list('?actionPrefix=tm6a');
    const data = dataOf(res) as Json[];
    const byId = new Map(data.map((r) => [r.id as string, r]));
    expect(byId.get('tm6aa001').actor).toEqual({
      id: staff.id,
      fullName: expect.any(String),
      email: `${PREFIX}staff@example.test`,
      role: 'STAFF',
    });
    expect(byId.get('tm6aa002').actor).toMatchObject({ id: admin.id, role: 'ADMIN' });
    expect(byId.get('tm6aa003').actor).toBeNull();
    expect(byId.get('tm6aa001').diff).toEqual({ status: ['PENDING', 'CONFIRMED'] });
    expect(byId.get('tm6aa003').diff).toEqual({ price: [1, 2], tags: [['a'], ['a', 'b']] });
    expect(byId.get('tm6aa002').diff).toBeNull();
    expect(byId.get('tm6aa001')).toMatchObject({
      entity: 'Tm6aOrder',
      entityId: 'tm6aid1',
      ip: '127.0.0.1',
      createdAt: '2030-01-10T16:59:59.999Z',
    });
  });

  it('400 khi tham số sai', async () => {
    for (const q of [
      '?from=2030-01-12&to=2030-01-11',
      '?from=2030-02-31',
      '?from=abc',
      '?page=0',
      '?pageSize=101',
    ]) {
      const res = await list(q);
      expect(res.status, q).toBe(400);
      expect(errOf(res).code).toBe('VALIDATION_ERROR');
    }
  });
});
