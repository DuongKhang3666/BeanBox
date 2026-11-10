import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { API, bearer, registerUser } from './authHelpers.js';

const PREFIX = 'tm2b-';
const emailOf = (k: string) => `${PREFIX}${k}@example.test`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let app: Express;

async function mkUser(key: string) {
  const u = await registerUser(app, emailOf(key));
  expect(u.res.status).toBe(201);
  return { token: u.accessToken, id: u.userId, auth: bearer(u.accessToken) };
}

const addr = (over: Record<string, unknown> = {}) => ({
  fullName: 'Nguyễn Văn An',
  phone: '0901234567',
  provinceCode: '79',
  provinceName: 'Thành phố Hồ Chí Minh',
  wardCode: '26734',
  wardName: 'Phường Bến Nghé',
  line1: '12 Lê Lợi',
  ...over,
});

type U = Awaited<ReturnType<typeof mkUser>>;
const post = (u: U, body: Record<string, unknown> = addr()) =>
  request(app).post(`${API}/me/addresses`).set(u.auth).send(body);
const list = async (u: U) =>
  (await request(app).get(`${API}/me/addresses`).set(u.auth)).body.data as Array<{
    id: string;
    isDefault: boolean;
    line1: string;
  }>;

async function clean() {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  app = createApp({ generalRateLimit: 100_000, authRateLimit: 100_000 });
  await clean();
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe('GET/PATCH /me', () => {
  it('401 khi không có token', async () => {
    expect((await request(app).get(`${API}/me`)).status).toBe(401);
    expect((await request(app).patch(`${API}/me`).send({ fullName: 'Abc' })).status).toBe(401);
  });

  it('GET trả user, không lộ passwordHash', async () => {
    const u = await mkUser('get');
    const r = await request(app).get(`${API}/me`).set(u.auth);
    expect(r.status).toBe(200);
    expect(r.body.data.email).toBe(emailOf('get'));
    expect(JSON.stringify(r.body)).not.toContain('passwordHash');
  });

  it('cập nhật fullName/phone/birthDate/avatarUrl, chuẩn hóa phone, null xóa phone', async () => {
    const u = await mkUser('patch');
    const r = await request(app).patch(`${API}/me`).set(u.auth).send({
      fullName: '  Trần Thị Bình ',
      phone: '+84 901 234 567',
      birthDate: '1990-12-31',
      avatarUrl: 'https://example.com/a.png',
    });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      fullName: 'Trần Thị Bình',
      phone: '0901234567',
      birthDate: '1990-12-31',
      avatarUrl: 'https://example.com/a.png',
    });
    expect(JSON.stringify(r.body)).not.toContain('passwordHash');

    const g = await request(app).get(`${API}/me`).set(u.auth);
    expect(g.body.data.birthDate).toBe('1990-12-31');

    const n = await request(app)
      .patch(`${API}/me`)
      .set(u.auth)
      .send({ phone: null, birthDate: null, avatarUrl: null });
    expect(n.status).toBe(200);
    expect(n.body.data).toMatchObject({ phone: null, birthDate: null, avatarUrl: null });
  });

  it('body rỗng hoặc chỉ email/role -> 400, email/role không đổi', async () => {
    const u = await mkUser('strip');
    for (const body of [{}, { email: 'x@y.test', role: 'ADMIN' }]) {
      const r = await request(app).patch(`${API}/me`).set(u.auth).send(body);
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
    }
    const mixed = await request(app)
      .patch(`${API}/me`)
      .set(u.auth)
      .send({ fullName: 'Tên Mới', email: 'hack@y.test', role: 'ADMIN' });
    expect(mixed.status).toBe(200);
    expect(mixed.body.data.email).toBe(emailOf('strip'));
    expect(mixed.body.data.role).toBe('CUSTOMER');
  });

  it('birthDate không hợp lệ -> 400', async () => {
    const u = await mkUser('bd');
    const tomorrow = new Date(Date.now() + 7 * 3600_000 + 86400_000).toISOString().slice(0, 10);
    for (const birthDate of [tomorrow, '1899-12-31', '2026-02-30', '2000-1-1', 'abc']) {
      const r = await request(app).patch(`${API}/me`).set(u.auth).send({ birthDate });
      expect(r.status, birthDate).toBe(400);
    }
  });

  it('avatarUrl không phải http(s) -> 400', async () => {
    const u = await mkUser('av');
    for (const avatarUrl of ['javascript:alert(1)', 'ftp://example.com/a.png', 'abc']) {
      const r = await request(app).patch(`${API}/me`).set(u.auth).send({ avatarUrl });
      expect(r.status, avatarUrl).toBe(400);
    }
  });

  it('phone sai -> 400', async () => {
    const u = await mkUser('ph');
    const r = await request(app).patch(`${API}/me`).set(u.auth).send({ phone: '123' });
    expect(r.status).toBe(400);
  });
});

describe('Sổ địa chỉ', () => {
  it('401 khi không có token', async () => {
    expect((await request(app).get(`${API}/me/addresses`)).status).toBe(401);
  });

  it('địa chỉ đầu tiên tự mặc định; DTO đúng shape; isDefault:true bỏ mặc định cũ', async () => {
    const u = await mkUser('def');
    const a = await post(u);
    expect(a.status).toBe(201);
    expect(a.body.data.isDefault).toBe(true);
    expect(Object.keys(a.body.data).sort()).toEqual(
      [
        'createdAt',
        'fullName',
        'id',
        'isDefault',
        'line1',
        'phone',
        'provinceCode',
        'provinceName',
        'wardCode',
        'wardName',
      ].sort(),
    );
    await sleep(10);
    const b = await post(u, addr({ line1: '34 Hai Bà Trưng', isDefault: true }));
    expect(b.status).toBe(201);
    expect(b.body.data.isDefault).toBe(true);
    await sleep(10);
    const c = await post(u, addr({ line1: '56 Nguyễn Huệ' }));
    expect(c.body.data.isDefault).toBe(false);

    const rows = await list(u);
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1);
    // mặc định (b) trước, rồi mới nhất trước: c, a
    expect(rows.map((r) => r.id)).toEqual([b.body.data.id, c.body.data.id, a.body.data.id]);
  });

  it('lỗi định dạng khi tạo -> 400', async () => {
    const u = await mkUser('fmt');
    for (const provinceCode of ['1', '001', 'ab']) {
      expect((await post(u, addr({ provinceCode }))).status, provinceCode).toBe(400);
    }
    for (const wardCode of ['abcde', '1234', '123456']) {
      expect((await post(u, addr({ wardCode }))).status, wardCode).toBe(400);
    }
    expect((await post(u, addr({ line1: 'abc' }))).status).toBe(400);
    expect((await post(u, addr({ phone: '12' }))).status).toBe(400);
    expect((await post(u, addr({ provinceName: undefined }))).status).toBe(400);
    expect(await list(u)).toHaveLength(0);
  });

  it('giới hạn 10 địa chỉ -> lần 11 là 409', async () => {
    const u = await mkUser('lim');
    for (let i = 0; i < 10; i++) {
      expect((await post(u, addr({ line1: `Số ${i + 1} đường A` }))).status).toBe(201);
    }
    const r = await post(u);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('ADDRESS_LIMIT_REACHED');
    expect(r.body.error.message).toBe('Bạn chỉ lưu được tối đa 10 địa chỉ');
    expect(await list(u)).toHaveLength(10);
  });

  it('2 request tạo song song khi đang có 9 -> 1 thành công, 1 bị 409', async () => {
    const u = await mkUser('race9');
    for (let i = 0; i < 9; i++) await post(u, addr({ line1: `Số ${i + 1} đường B` }));
    const [r1, r2] = await Promise.all([
      post(u, addr({ line1: '100 đường song song 1', isDefault: true })),
      post(u, addr({ line1: '200 đường song song 2', isDefault: true })),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const rows = await list(u);
    expect(rows).toHaveLength(10);
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1);
  });

  it('đặt mặc định song song 2 địa chỉ khác nhau -> không 500, đúng 1 mặc định', async () => {
    const u = await mkUser('racedef');
    await post(u, addr({ line1: '1 đường gốc A' }));
    const b = await post(u, addr({ line1: '2 đường gốc B' }));
    const c = await post(u, addr({ line1: '3 đường gốc C' }));
    const [r1, r2, r3] = await Promise.all([
      request(app).post(`${API}/me/addresses/${b.body.data.id}/default`).set(u.auth),
      request(app).post(`${API}/me/addresses/${c.body.data.id}/default`).set(u.auth),
      request(app)
        .patch(`${API}/me/addresses/${b.body.data.id}`)
        .set(u.auth)
        .send({ isDefault: true }),
    ]);
    expect([r1.status, r2.status, r3.status]).toEqual([200, 200, 200]);
    const rows = await list(u);
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1);
  });

  it('POST /:id/default trả Address mặc định', async () => {
    const u = await mkUser('setdef');
    await post(u);
    const b = await post(u, addr({ line1: '2 đường thứ hai' }));
    const r = await request(app).post(`${API}/me/addresses/${b.body.data.id}/default`).set(u.auth);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ id: b.body.data.id, isDefault: true });
    const rows = await list(u);
    expect(rows[0]!.id).toBe(b.body.data.id);
    expect(rows.filter((x) => x.isDefault)).toHaveLength(1);
  });

  it('xóa mặc định -> địa chỉ mới nhất còn lại thành mặc định; xóa hết -> rỗng', async () => {
    const u = await mkUser('del');
    const a = await post(u, addr({ line1: '1 đường xóa A' }));
    await sleep(10);
    const b = await post(u, addr({ line1: '2 đường xóa B' }));
    await sleep(10);
    const c = await post(u, addr({ line1: '3 đường xóa C' }));
    expect(a.body.data.isDefault).toBe(true);

    const d = await request(app).delete(`${API}/me/addresses/${a.body.data.id}`).set(u.auth);
    expect(d.status).toBe(204);
    const rows = await list(u);
    expect(rows.map((r) => [r.id, r.isDefault])).toEqual([
      [c.body.data.id, true],
      [b.body.data.id, false],
    ]);

    // xóa địa chỉ không mặc định: mặc định giữ nguyên
    await request(app).delete(`${API}/me/addresses/${b.body.data.id}`).set(u.auth);
    expect((await list(u)).map((r) => r.id)).toEqual([c.body.data.id]);

    await request(app).delete(`${API}/me/addresses/${c.body.data.id}`).set(u.auth);
    expect(await list(u)).toEqual([]);
  });

  it('PATCH: sửa thường, ràng buộc cặp mã/tên, isDefault:false bị bỏ qua', async () => {
    const u = await mkUser('pat');
    const a = await post(u);
    const url = `${API}/me/addresses/${a.body.data.id}`;
    const patch = (body: Record<string, unknown>) => request(app).patch(url).set(u.auth).send(body);

    const ok = await patch({ line1: '99 Pasteur', phone: '+84 912 345 678' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ line1: '99 Pasteur', phone: '0912345678' });

    const full = await patch({
      provinceCode: '01',
      provinceName: 'Thành phố Hà Nội',
      wardCode: '00001',
      wardName: 'Phường Ba Đình',
    });
    expect(full.status).toBe(200);
    expect(full.body.data).toMatchObject({ provinceCode: '01', wardCode: '00001' });

    const wardOnly = await patch({ wardCode: '00004', wardName: 'Phường Phúc Xá' });
    expect(wardOnly.status).toBe(200);

    const fieldsOf = (r: request.Response) =>
      (r.body.error.details as Array<{ field: string }>).map((d) => d.field);

    const bad: Array<[Record<string, unknown>, string]> = [
      [{}, ''],
      [{ provinceCode: '79' }, 'provinceName'],
      [{ provinceCode: '79', provinceName: 'TP HCM' }, 'wardCode'],
      [{ provinceName: 'TP HCM' }, 'provinceCode'],
      [{ wardCode: '26734' }, 'wardName'],
      [{ wardName: 'Phường Bến Nghé' }, 'wardCode'],
      [{ wardCode: '1234', wardName: 'Phường X' }, 'wardCode'],
      [{ provinceCode: '1', provinceName: 'TP', wardCode: '26734', wardName: 'Phường X' }, ''],
    ];
    for (const [body, field] of bad) {
      const r = await patch(body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      if (field) expect(fieldsOf(r)).toContain(field);
    }

    const f = await patch({ isDefault: false });
    expect(f.status).toBe(200);
    expect(f.body.data.isDefault).toBe(true);
    expect((await list(u))[0]!.isDefault).toBe(true);
  });
});

describe('IDOR địa chỉ', () => {
  it('user B không đụng được địa chỉ của A (404, dữ liệu A không đổi)', async () => {
    const a = await mkUser('idor-a');
    const b = await mkUser('idor-b');
    const created = await post(a);
    const second = await post(a, addr({ line1: '2 đường của A' }));
    const id = created.body.data.id as string;
    const url = `${API}/me/addresses/${id}`;

    const checks = [
      request(app).patch(url).set(b.auth).send({ line1: 'Bị chiếm quyền', isDefault: true }),
      request(app).delete(url).set(b.auth),
      request(app).post(`${url}/default`).set(b.auth),
    ];
    for (const req of checks) {
      const r = await req;
      expect(r.status).toBe(404);
      expect(r.body.error.code).toBe('NOT_FOUND');
      expect(r.body.error.message).toBe('Không tìm thấy địa chỉ');
    }
    expect(
      (await request(app).post(`${API}/me/addresses/rac-khong-co/default`).set(b.auth)).status,
    ).toBe(404);
    expect((await request(app).delete(`${API}/me/addresses/rac`).set(a.auth)).status).toBe(404);

    expect(await list(b)).toEqual([]);
    const rowsA = await list(a);
    expect(rowsA).toHaveLength(2);
    expect(rowsA.map((r) => r.line1).sort()).toEqual(['12 Lê Lợi', '2 đường của A']);
    expect(rowsA.find((r) => r.id === id)?.isDefault).toBe(true);
    expect(rowsA.find((r) => r.id === second.body.data.id)?.isDefault).toBe(false);
  });
});
