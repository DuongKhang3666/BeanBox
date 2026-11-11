import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { expect } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { sha256Hex } from '../src/lib/tokens.js';
import { API, bearer, ORIGIN, registerUser } from './authHelpers.js';

export interface Who {
  token?: string | null;
  auth?: Record<string, string>;
}

export interface Loc {
  provinceCode: string;
  wardCode: string;
}
export const HCM: Loc = { provinceCode: '79', wardCode: '25747' };
export const DANANG: Loc = { provinceCode: '48', wardCode: '20194' };

export interface ErrBody {
  error: { code: string; message: string; details?: unknown };
}
export const errOf = (res: request.Response) => (res.body as ErrBody).error;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const dataOf = (res: request.Response) => (res.body as { data: any }).data;

/** Bộ fixture riêng theo prefix (dọn sạch sau test). */
export function createFixtures(app: () => Express, prefix: string) {
  const upper = prefix.toUpperCase();
  const issuedTokens = new Set<string>();
  const originalSettings = new Map<string, { value: Prisma.JsonValue } | null>();
  let seq = 0;
  let categoryId = '';

  async function call(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    who: Who = {},
    body?: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) {
    let r = request(app())[method](`${API}${path}`).set('Origin', ORIGIN).set(headers);
    if (who.token) r = r.set('X-Cart-Token', who.token);
    if (who.auth) r = r.set(who.auth);
    if (body) r = r.send(body);
    const res = await r;
    const t = (res.body as { data?: { cartToken?: string | null } }).data?.cartToken;
    if (t) issuedTokens.add(t);
    return res;
  }

  async function mkUser(key: string) {
    const u = await registerUser(app(), `${prefix}${key}@example.test`);
    expect(u.res.status).toBe(201);
    return {
      id: u.userId,
      email: `${prefix}${key}@example.test`,
      who: { auth: bearer(u.accessToken) } as Who,
    };
  }

  async function mkVariant(
    key: string,
    over: {
      price?: number;
      stock?: number;
      isActive?: boolean;
      weightGram?: number;
      productId?: string;
      status?: 'ACTIVE' | 'DRAFT';
    } = {},
  ) {
    const productId =
      over.productId ??
      (
        await prisma.product.create({
          data: {
            categoryId,
            name: `Sản phẩm ${key} <b>`,
            slug: `${prefix}${key}-${++seq}`,
            status: over.status ?? 'ACTIVE',
            images: { create: [{ url: `/uploads/${key}.jpg`, sortOrder: 0, isPrimary: true }] },
          },
        })
      ).id;
    return prisma.productVariant.create({
      data: {
        productId,
        sku: `${upper}${key}-${++seq}`.toUpperCase(),
        name: `Biến thể ${key}`,
        attributes: { weight: '500g' },
        price: over.price ?? 100000,
        stock: over.stock ?? 50,
        weightGram: over.weightGram ?? 500,
        isActive: over.isActive ?? true,
      },
    });
  }

  async function mkCoupon(
    key: string,
    over: Partial<{
      type: 'PERCENT' | 'FIXED' | 'FREESHIP';
      value: number;
      maxDiscount: number | null;
      minOrder: number;
      usageLimit: number | null;
      perUserLimit: number | null;
    }> = {},
  ) {
    return prisma.coupon.create({
      data: {
        code: `${upper}${key}-${++seq}`.toUpperCase(),
        type: over.type ?? 'PERCENT',
        value: over.value ?? 10,
        maxDiscount: over.maxDiscount ?? null,
        minOrder: over.minOrder ?? 0,
        usageLimit: over.usageLimit ?? null,
        perUserLimit: over.perUserLimit ?? null,
      },
    });
  }

  async function mkAddress(userId: string, loc: Loc = HCM, over: { phone?: string } = {}) {
    return prisma.address.create({
      data: {
        userId,
        fullName: 'Trần Thị Bình',
        phone: over.phone ?? '0912345678',
        provinceCode: loc.provinceCode,
        provinceName: 'Tên tỉnh trong địa chỉ',
        wardCode: loc.wardCode,
        wardName: 'Tên phường trong địa chỉ',
        line1: '45 Nguyễn Huệ',
      },
    });
  }

  const add = (who: Who, variantId: string, quantity: number) =>
    call('post', '/cart/items', who, { variantId, quantity });

  /** Tạo giỏ guest và trả token. */
  async function guestWith(lines: Array<[string, number]>): Promise<Who> {
    let who: Who = {};
    for (const [variantId, quantity] of lines) {
      const res = await add(who, variantId, quantity);
      expect(res.status).toBe(201);
      if (!who.token) who = { token: dataOf(res).cartToken as string };
    }
    expect(who.token).toBeTruthy();
    return who;
  }

  /** Ghi đè setting; bản gốc được nhớ để restoreSettings() khôi phục. */
  async function setSetting(key: string, value: Prisma.InputJsonValue) {
    if (!originalSettings.has(key)) {
      const row = await prisma.setting.findUnique({ where: { key } });
      originalSettings.set(key, row ? { value: row.value } : null);
    }
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  async function restoreSettings() {
    for (const [key, orig] of originalSettings) {
      if (orig === null) await prisma.setting.deleteMany({ where: { key } });
      else {
        await prisma.setting.update({
          where: { key },
          data: { value: orig.value as Prisma.InputJsonValue },
        });
      }
    }
    originalSettings.clear();
  }

  async function clean() {
    const items = await prisma.cartItem.findMany({
      where: { variant: { sku: { startsWith: upper } } },
      select: { cartId: true },
    });
    await prisma.cart.deleteMany({
      where: {
        OR: [
          { id: { in: items.map((i) => i.cartId) } },
          { tokenHash: { in: [...issuedTokens].map(sha256Hex) } },
          { user: { email: { startsWith: prefix } } },
        ],
      },
    });
    await prisma.couponRedemption.deleteMany({
      where: { coupon: { code: { startsWith: upper } } },
    });
    await prisma.order.deleteMany({ where: { contactEmail: { startsWith: prefix } } });
    await prisma.inventoryMovement.deleteMany({
      where: { variant: { sku: { startsWith: upper } } },
    });
    await prisma.coupon.deleteMany({ where: { code: { startsWith: upper } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: prefix } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: prefix } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  }

  async function setup() {
    await clean();
    const cat = await prisma.category.create({
      data: { name: `Danh mục ${prefix}`, slug: `${prefix}cat` },
    });
    categoryId = cat.id;
  }

  const nextEmail = () => `${prefix}g${++seq}@example.test`;

  const guestOrderBody = (over: Record<string, unknown> = {}) => ({
    contact: { email: nextEmail(), phone: '+84 90 123 4567' },
    shippingAddress: {
      fullName: 'Nguyễn Văn An',
      phone: '0901234567',
      ...HCM,
      line1: '12 Lê Lợi',
    },
    shippingMethod: 'STANDARD',
    paymentMethod: 'COD',
    acceptTerms: true,
    ...over,
  });

  const postOrder = (who: Who, body: Record<string, unknown>, key: string = randomUUID()) =>
    call('post', '/orders', who, body, { 'Idempotency-Key': key });

  return {
    call,
    mkUser,
    mkVariant,
    mkCoupon,
    mkAddress,
    add,
    guestWith,
    setSetting,
    restoreSettings,
    clean,
    setup,
    nextEmail,
    guestOrderBody,
    postOrder,
  };
}
