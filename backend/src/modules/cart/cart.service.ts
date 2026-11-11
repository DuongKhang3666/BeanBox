import type { Cart, Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { MAX_LINE_QUANTITY, priceCartLine, type PricedCartLine } from '../../lib/cartLine.js';
import { evaluateCoupon, normalizeCouponCode } from '../../lib/coupon.js';
import { computeTotals, type CouponInput, type QuoteLine, type Totals } from '../../lib/quote.js';
import { effectivePrice } from '../../lib/pricing.js';
import { generateOpaqueToken, sha256Hex } from '../../lib/tokens.js';
import type { StockStatus } from '../catalog/catalog.service.js';
import { getShopSettings, type ShopSettings } from '../settings/settings.service.js';
import type { AddItemInput, UpdateItemInput } from './cart.schema.js';

/** Giỏ hàng (api-contract §8). Giá/tồn/tổng luôn tính ở server từ priceCartLine + computeTotals. */

export const CART_TOKEN_LENGTH = 43; // 32 byte base64url
const CART_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const GUEST_CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

type Db = Prisma.TransactionClient;

export type CartIdentity =
  { kind: 'user'; userId: string } | { kind: 'guest'; token: string | null };

/** Chỉ nhận chuỗi đúng định dạng token server cấp; sai định dạng = không có token. */
export function parseCartToken(raw: unknown): string | null {
  return typeof raw === 'string' && CART_TOKEN_RE.test(raw) ? raw : null;
}

// ---------------------------------------------------------------------------
// DTO

export interface CartItemDto {
  id: string;
  variantId: string;
  quantity: number;
  product: { id: string; slug: string; name: string; imageUrl: string | null };
  variant: {
    id: string;
    sku: string;
    name: string;
    attributes: Record<string, unknown>;
    weightGram: number;
  };
  unitPrice: number;
  listPrice: number;
  lineTotal: number;
  unitPriceAtAdd: number;
  maxQuantity: number;
  stockStatus: StockStatus;
  warnings: PricedCartLine['warnings'];
}

export interface CartDto {
  cartToken: string | null;
  items: CartItemDto[];
  itemCount: number;
  subtotal: number;
  coupon: Totals['coupon'];
  discountTotal: number;
  totalWeightGram: number;
  shippingEstimate: Totals['shippingEstimate'];
}

/** Dòng giỏ đã nạp đầy đủ, dùng chung cho giỏ và đặt hàng. */
export interface CartLine {
  itemId: string;
  variantId: string;
  quantity: number;
  unitPriceAtAdd: number;
  priced: PricedCartLine;
  productId: string;
  productSlug: string;
  productName: string;
  categoryId: string;
  parentCategoryId: string | null;
  variantSku: string;
  variantName: string;
  variantAttributes: Prisma.JsonValue;
  imageUrl: string | null;
  /** Cân nặng 1 đơn vị (gram). */
  weightGramUnit: number;
  /** Tồn kho thực (>= 0). */
  stock: number;
}

export function toQuoteLine(l: CartLine): QuoteLine {
  return {
    quantity: l.quantity,
    lineTotal: l.priced.lineTotal,
    countable: l.priced.countable,
    weightGram: l.priced.weightGram,
    productId: l.productId,
    categoryId: l.categoryId,
    parentCategoryId: l.parentCategoryId,
  };
}

/** Hàm thuần: ghép dòng + tổng thành Cart DTO (§8). */
export function toCartDto(args: {
  cartToken: string | null;
  lines: readonly CartLine[];
  totals: Totals;
}): CartDto {
  const { lines, totals } = args;
  return {
    cartToken: args.cartToken,
    items: lines.map((l) => ({
      id: l.itemId,
      variantId: l.variantId,
      quantity: l.quantity,
      product: { id: l.productId, slug: l.productSlug, name: l.productName, imageUrl: l.imageUrl },
      variant: {
        id: l.variantId,
        sku: l.variantSku,
        name: l.variantName,
        attributes: (l.variantAttributes ?? {}) as Record<string, unknown>,
        weightGram: l.weightGramUnit,
      },
      unitPrice: l.priced.unitPrice,
      listPrice: l.priced.listPrice,
      lineTotal: l.priced.lineTotal,
      unitPriceAtAdd: l.unitPriceAtAdd,
      maxQuantity: l.priced.maxQuantity,
      stockStatus: l.priced.stockStatus,
      warnings: l.priced.warnings,
    })),
    itemCount: totals.itemCount,
    subtotal: totals.subtotal,
    coupon: totals.coupon,
    discountTotal: totals.discountTotal,
    totalWeightGram: totals.totalWeightGram,
    shippingEstimate: totals.shippingEstimate,
  };
}

export function computeCartTotals(args: {
  lines: readonly CartLine[];
  coupon: CouponInput | null;
  settings: ShopSettings;
  now: Date;
}): Totals {
  return computeTotals({
    lines: args.lines.map(toQuoteLine),
    coupon: args.lines.length === 0 ? null : args.coupon,
    zone: null,
    settings: args.settings,
    now: args.now,
  });
}

// ---------------------------------------------------------------------------
// Đọc dữ liệu (dùng được cả trong transaction của đặt hàng)

/**
 * Tìm giỏ của danh tính, KHÔNG tạo. Guest: token phải khớp tokenHash, giỏ không thuộc user
 * và chưa quá 30 ngày không hoạt động. Hết hạn/không có -> null.
 */
export async function findCartForIdentity(
  tx: Db,
  identity: CartIdentity,
  now: Date,
): Promise<Cart | null> {
  if (identity.kind === 'user') return tx.cart.findUnique({ where: { userId: identity.userId } });
  const cart = await findGuestCartRaw(tx, identity.token);
  return cart && !isExpired(cart, now) ? cart : null;
}

const isExpired = (cart: Cart, now: Date) =>
  cart.lastActivityAt.getTime() < now.getTime() - GUEST_CART_TTL_MS;

async function findGuestCartRaw(tx: Db, token: string | null): Promise<Cart | null> {
  const valid = parseCartToken(token);
  if (!valid) return null;
  const cart = await tx.cart.findUnique({ where: { tokenHash: sha256Hex(valid) } });
  return cart && cart.userId == null ? cart : null;
}

/** Khóa dòng giỏ (tuần tự hóa thao tác cùng giỏ). false = giỏ không còn tồn tại. */
export async function lockCart(tx: Db, cartId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT "id" FROM "Cart" WHERE "id" = ${cartId} FOR UPDATE`;
  return rows.length > 0;
}

/** Dòng giỏ đầy đủ, sắp `createdAt ASC, id ASC`. */
export async function loadCartLines(tx: Db, cartId: string, now: Date): Promise<CartLine[]> {
  const items = await tx.cartItem.findMany({
    where: { cartId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      variant: {
        include: {
          product: {
            include: {
              category: { select: { id: true, parentId: true } },
              images: { select: { url: true, isPrimary: true, sortOrder: true } },
            },
          },
        },
      },
    },
  });
  return items.map((it) => {
    const v = it.variant;
    const p = v.product;
    const image =
      p.images.find((i) => i.isPrimary) ??
      [...p.images].sort((a, b) => a.sortOrder - b.sortOrder)[0];
    return {
      itemId: it.id,
      variantId: v.id,
      quantity: it.quantity,
      unitPriceAtAdd: it.unitPriceAtAdd,
      priced: priceCartLine(
        { quantity: it.quantity, unitPriceAtAdd: it.unitPriceAtAdd, variant: v, product: p },
        now,
      ),
      productId: p.id,
      productSlug: p.slug,
      productName: p.name,
      categoryId: p.category.id,
      parentCategoryId: p.category.parentId,
      variantSku: v.sku,
      variantName: v.name,
      variantAttributes: v.attributes,
      imageUrl: image?.url ?? null,
      weightGramUnit: v.weightGram,
      stock: Math.max(0, v.stock),
    };
  });
}

/**
 * Nạp mã giảm giá cho computeTotals. User: đếm CouponRedemption chưa hoàn theo userId; guest có email:
 * đếm theo email (lowercase); không biết ai: redemptionCount = null (bỏ qua kiểm tra).
 */
export async function loadCouponForCart(
  tx: Db,
  code: string,
  who: { userId?: string | null; email?: string | null },
): Promise<CouponInput> {
  const normalized = normalizeCouponCode(code);
  const coupon = await tx.coupon.findUnique({ where: { code: normalized } });
  let redemptionCount: number | null = null;
  if (coupon && coupon.perUserLimit != null) {
    if (who.userId) {
      redemptionCount = await tx.couponRedemption.count({
        where: { couponId: coupon.id, userId: who.userId, releasedAt: null },
      });
    } else if (who.email) {
      redemptionCount = await tx.couponRedemption.count({
        where: { couponId: coupon.id, email: who.email.trim().toLowerCase(), releasedAt: null },
      });
    }
  }
  return { code: normalized, coupon, redemptionCount };
}

/** Dựng Cart DTO cho một giỏ đã có. */
async function buildCartDto(
  db: Db,
  cart: Pick<Cart, 'id' | 'userId' | 'couponCode'>,
  now: Date,
  cartToken: string | null,
): Promise<CartDto> {
  const [lines, settings] = await Promise.all([
    loadCartLines(db, cart.id, now),
    getShopSettings(db),
  ]);
  const coupon =
    cart.couponCode && lines.length > 0
      ? await loadCouponForCart(db, cart.couponCode, { userId: cart.userId })
      : null;
  return toCartDto({
    cartToken,
    lines,
    totals: computeCartTotals({ lines, coupon, settings, now }),
  });
}

async function emptyCartDto(db: Db, now: Date): Promise<CartDto> {
  const settings = await getShopSettings(db);
  return toCartDto({
    cartToken: null,
    lines: [],
    totals: computeCartTotals({ lines: [], coupon: null, settings, now }),
  });
}

// ---------------------------------------------------------------------------
// Ghi

function isQuantityCheckViolation(e: unknown): boolean {
  const text = `${(e as { code?: unknown })?.code ?? ''} ${(e as Error)?.message ?? ''}`;
  return text.includes('23514') || text.includes('CartItem_quantity_range');
}

async function guardDb<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (isQuantityCheckViolation(e)) throw quantityLimit();
    throw e;
  }
}

const quantityLimit = () =>
  new AppError(
    409,
    'QUANTITY_LIMIT_EXCEEDED',
    `Mỗi sản phẩm chỉ được mua tối đa ${MAX_LINE_QUANTITY} cái`,
  );
const itemNotFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm trong giỏ hàng');
const unavailable = () =>
  new AppError(409, 'ITEM_UNAVAILABLE', 'Sản phẩm này hiện không còn được bán');
const outOfStock = (variantId: string, requested: number, available: number) =>
  new AppError(409, 'OUT_OF_STOCK', 'Số lượng trong kho không đủ', {
    items: [{ variantId, requested, available }],
  });

interface OpenedCart {
  cart: Cart;
  /** Token mới vừa cấp (giỏ guest mới tạo). */
  issuedToken: string | null;
}

/**
 * Mở giỏ để ghi và khóa dòng giỏ. `create=false` và không có giỏ -> null.
 * Giỏ guest hết hạn bị xóa trước khi tạo giỏ mới.
 */
async function openCartForWrite(
  tx: Db,
  identity: CartIdentity,
  now: Date,
  create: boolean,
): Promise<OpenedCart | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let cart: Cart | null;
    let issuedToken: string | null = null;
    if (identity.kind === 'user') {
      if (create) {
        // ON CONFLICT DO NOTHING: an toàn khi nhiều request đầu tiên đến cùng lúc.
        await tx.cart.createMany({ data: [{ userId: identity.userId }], skipDuplicates: true });
      }
      cart = await tx.cart.findUnique({ where: { userId: identity.userId } });
    } else {
      const raw = await findGuestCartRaw(tx, identity.token);
      if (raw && !isExpired(raw, now)) {
        cart = raw;
      } else {
        if (raw) await tx.cart.deleteMany({ where: { id: raw.id } });
        if (!create) return null;
        issuedToken = generateOpaqueToken();
        cart = await tx.cart.create({ data: { tokenHash: sha256Hex(issuedToken) } });
      }
    }
    if (!cart) return null;
    if (await lockCart(tx, cart.id)) return { cart, issuedToken };
    // Giỏ vừa bị xóa bởi request khác (merge): thử lại từ đầu.
  }
  throw new AppError(409, 'CONFLICT', 'Giỏ hàng vừa thay đổi, vui lòng thử lại');
}

const touch = (tx: Db, cartId: string, now: Date, data: Prisma.CartUpdateInput = {}) =>
  tx.cart.update({ where: { id: cartId }, data: { ...data, lastActivityAt: now } });

async function loadVariantForCart(tx: Db, variantId: string) {
  return tx.productVariant.findUnique({
    where: { id: variantId },
    include: { product: { select: { status: true, deletedAt: true } } },
  });
}

function isVariantSellable(v: NonNullable<Awaited<ReturnType<typeof loadVariantForCart>>>) {
  return v.isActive && v.deletedAt == null && v.product.status === 'ACTIVE' && !v.product.deletedAt;
}

export async function getCart(identity: CartIdentity, now = new Date()): Promise<CartDto> {
  const cart = await findCartForIdentity(prisma, identity, now);
  if (!cart) return emptyCartDto(prisma, now);
  if (now.getTime() - cart.lastActivityAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.cart.updateMany({ where: { id: cart.id }, data: { lastActivityAt: now } });
  }
  return buildCartDto(prisma, cart, now, null);
}

export async function addItem(
  identity: CartIdentity,
  input: AddItemInput,
  now = new Date(),
): Promise<CartDto> {
  return guardDb(() =>
    prisma.$transaction(async (tx) => {
      const opened = (await openCartForWrite(tx, identity, now, true))!;
      const { cart } = opened;

      const variant = await loadVariantForCart(tx, input.variantId);
      if (!variant) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm');
      if (!isVariantSellable(variant)) throw unavailable();

      const existing = await tx.cartItem.findUnique({
        where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
      });
      const total = (existing?.quantity ?? 0) + input.quantity;
      if (total > MAX_LINE_QUANTITY) throw quantityLimit();
      const stock = Math.max(0, variant.stock);
      if (total > stock) throw outOfStock(variant.id, total, stock);

      const unitPriceAtAdd = effectivePrice(variant, now);
      if (existing) {
        await tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity: total, unitPriceAtAdd },
        });
      } else {
        await tx.cartItem.create({
          data: { cartId: cart.id, variantId: variant.id, quantity: total, unitPriceAtAdd },
        });
      }
      await touch(tx, cart.id, now);
      return buildCartDto(tx, cart, now, opened.issuedToken);
    }),
  );
}

export async function updateItem(
  identity: CartIdentity,
  itemId: string,
  input: UpdateItemInput,
  now = new Date(),
): Promise<CartDto> {
  return guardDb(() =>
    prisma.$transaction(async (tx) => {
      const opened = await openCartForWrite(tx, identity, now, false);
      if (!opened) throw itemNotFound();
      const { cart } = opened;
      const item = await tx.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
      if (!item) throw itemNotFound();

      const variant = await loadVariantForCart(tx, item.variantId);
      if (!variant || !isVariantSellable(variant)) throw unavailable();
      const stock = Math.max(0, variant.stock);
      if (input.quantity > stock) throw outOfStock(variant.id, input.quantity, stock);

      await tx.cartItem.update({ where: { id: item.id }, data: { quantity: input.quantity } });
      await touch(tx, cart.id, now);
      return buildCartDto(tx, cart, now, null);
    }),
  );
}

export async function removeItem(
  identity: CartIdentity,
  itemId: string,
  now = new Date(),
): Promise<CartDto> {
  return prisma.$transaction(async (tx) => {
    const opened = await openCartForWrite(tx, identity, now, false);
    if (!opened) throw itemNotFound();
    const { cart } = opened;
    const item = await tx.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) throw itemNotFound();
    await tx.cartItem.delete({ where: { id: item.id } });
    await touch(tx, cart.id, now);
    return buildCartDto(tx, cart, now, null);
  });
}

export async function clearCart(identity: CartIdentity, now = new Date()): Promise<CartDto> {
  return prisma.$transaction(async (tx) => {
    const opened = await openCartForWrite(tx, identity, now, false);
    if (!opened) return emptyCartDto(tx, now);
    const { cart } = opened;
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    const updated = await touch(tx, cart.id, now, { couponCode: null });
    return buildCartDto(tx, updated, now, null);
  });
}

export async function applyCoupon(
  identity: CartIdentity,
  rawCode: string,
  now = new Date(),
): Promise<CartDto> {
  return prisma.$transaction(async (tx) => {
    const emptyErr = () => new AppError(409, 'CART_EMPTY', 'Giỏ hàng đang trống');
    const opened = await openCartForWrite(tx, identity, now, false);
    if (!opened) throw emptyErr();
    const { cart } = opened;
    const counted = (await loadCartLines(tx, cart.id, now)).filter((l) => l.priced.countable);
    if (counted.length === 0) throw emptyErr();

    const input = await loadCouponForCart(tx, rawCode, { userId: cart.userId });
    const ev = evaluateCoupon(
      input.coupon,
      counted.map((l) => ({
        productId: l.productId,
        categoryId: l.categoryId,
        parentCategoryId: l.parentCategoryId,
        lineTotal: l.priced.lineTotal,
      })),
      { now, redemptionCount: input.redemptionCount },
    );
    if (!ev.valid) {
      throw new AppError(409, 'COUPON_INVALID', 'Mã giảm giá không hợp lệ', {
        reason: ev.reason,
        ...(ev.minOrder !== undefined ? { minOrder: ev.minOrder } : {}),
      });
    }
    const updated = await touch(tx, cart.id, now, { couponCode: input.code });
    return buildCartDto(tx, updated, now, null);
  });
}

export async function removeCoupon(identity: CartIdentity, now = new Date()): Promise<CartDto> {
  return prisma.$transaction(async (tx) => {
    const opened = await openCartForWrite(tx, identity, now, false);
    if (!opened) return emptyCartDto(tx, now);
    const updated = await touch(tx, opened.cart.id, now, { couponCode: null });
    return buildCartDto(tx, updated, now, null);
  });
}

// ---------------------------------------------------------------------------
// Merge

export interface MergeAdjustment {
  variantId: string;
  requested: number;
  final: number;
  reason: 'QUANTITY_LIMIT' | 'STOCK_LIMIT' | 'UNAVAILABLE';
}

export interface MergeResult {
  cart: CartDto;
  meta: { merged: boolean; adjustments: MergeAdjustment[] };
}

export async function mergeGuestCart(
  userId: string,
  guestToken: string | null,
  now = new Date(),
): Promise<MergeResult> {
  const notMerged = async (): Promise<MergeResult> => ({
    cart: await getCart({ kind: 'user', userId }, now),
    meta: { merged: false, adjustments: [] },
  });

  const token = parseCartToken(guestToken);
  if (!token) return notMerged();

  const result = await guardDb(() =>
    prisma.$transaction(async (tx): Promise<MergeResult | null> => {
      const guestPeek = await findGuestCartRaw(tx, token);
      if (!guestPeek || isExpired(guestPeek, now)) return null;

      await tx.cart.createMany({ data: [{ userId }], skipDuplicates: true });
      const userCart = await tx.cart.findUniqueOrThrow({ where: { userId } });

      // Khóa theo thứ tự id tăng dần để hai merge/ghi đồng thời không deadlock.
      const ids = [guestPeek.id, userCart.id].sort();
      for (const id of ids) {
        if (!(await lockCart(tx, id))) return null;
      }
      const guest = await tx.cart.findUnique({ where: { id: guestPeek.id } });
      if (!guest) return null;
      const guestItems = await tx.cartItem.findMany({
        where: { cartId: guest.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const userItems = await tx.cartItem.findMany({ where: { cartId: userCart.id } });
      const userQty = new Map(userItems.map((i) => [i.variantId, i]));
      const variants = await tx.productVariant.findMany({
        where: { id: { in: guestItems.map((i) => i.variantId) } },
        include: { product: { select: { status: true, deletedAt: true } } },
      });
      const variantById = new Map(variants.map((v) => [v.id, v]));

      const adjustments: MergeAdjustment[] = [];
      for (const gi of guestItems) {
        const v = variantById.get(gi.variantId);
        if (!v || !isVariantSellable(v)) {
          adjustments.push({
            variantId: gi.variantId,
            requested: gi.quantity,
            final: 0,
            reason: 'UNAVAILABLE',
          });
          continue;
        }
        const mine = userQty.get(gi.variantId);
        const requested = (mine?.quantity ?? 0) + gi.quantity;
        const stock = Math.max(0, v.stock);
        const final = Math.min(requested, MAX_LINE_QUANTITY, stock);
        if (final < requested) {
          adjustments.push({
            variantId: gi.variantId,
            requested,
            final,
            reason: stock >= MAX_LINE_QUANTITY ? 'QUANTITY_LIMIT' : 'STOCK_LIMIT',
          });
        }
        if (final <= 0) continue;
        if (mine) {
          await tx.cartItem.update({ where: { id: mine.id }, data: { quantity: final } });
        } else {
          await tx.cartItem.create({
            data: {
              cartId: userCart.id,
              variantId: gi.variantId,
              quantity: final,
              unitPriceAtAdd: gi.unitPriceAtAdd,
              createdAt: gi.createdAt,
            },
          });
        }
      }

      const updated = await touch(tx, userCart.id, now, {
        couponCode: userCart.couponCode ?? guest.couponCode,
      });
      await tx.cart.delete({ where: { id: guest.id } });
      return {
        cart: await buildCartDto(tx, updated, now, null),
        meta: { merged: true, adjustments },
      };
    }),
  );
  return result ?? notMerged();
}
