import { Prisma, type OrderStatus } from '@prisma/client';
import { getPaymentConfig, isProviderEnabled, type PaymentConfig } from '../../config/payments.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { sendMailInBackground } from '../../lib/mailer.js';
import { generateOrderCode, normalizeOrderCode, ORDER_CODE_REGEX } from '../../lib/orderCode.js';
import { normalizePhone } from '../../lib/phone.js';
import { sha256Hex } from '../../lib/tokens.js';
import { refreshProductDenorm } from '../catalog/catalog.denorm.js';
import {
  findCartForIdentity,
  loadCartLines,
  lockCart,
  parseCartToken,
  type CartIdentity,
} from '../cart/cart.service.js';
import {
  buildCheckoutContext,
  cartEmpty,
  toQuoteDto,
  validationError,
} from '../checkout/checkout.service.js';
import { resolveLocation } from '../locations/locations.data.js';
import { getShopSettings } from '../settings/settings.service.js';
import { cancelOrderTx } from './orders.cancel.js';
import {
  orderInclude,
  toOrderDto,
  toTrackedOrderDto,
  type DtoOptions,
  type OrderDto,
  type ShippingAddressSnapshot,
  type TrackedOrderDto,
} from './orders.dto.js';
import { buildOrderConfirmationEmail } from './orders.emails.js';
import { notifyOrderStatusChange } from './orders.statusEmails.js';
import type { CancelOrderInput, CreateOrderInput, MyOrdersQuery } from './orders.schema.js';

type Db = Prisma.TransactionClient;

const MAX_CODE_ATTEMPTS = 5;
const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

// ---------------------------------------------------------------------------
// Idempotency

/** JSON ổn định: khóa object được sắp xếp; trường undefined bị bỏ. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => stableStringify(x ?? null)).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const parts = Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`);
    return `{${parts.join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** Định danh người gọi: `u:<userId>` | `g:<sha256 token>` | `g:-` (api-contract §9.2, D-010). */
export function callerId(identity: CartIdentity): string {
  if (identity.kind === 'user') return `u:${identity.userId}`;
  const token = parseCartToken(identity.token);
  return token ? `g:${sha256Hex(token)}` : 'g:-';
}

export function requestFingerprint(input: CreateOrderInput, identity: CartIdentity): string {
  return sha256Hex(stableStringify({ body: input, caller: callerId(identity) }));
}

/**
 * Tìm đơn theo idempotencyKey. Khớp fingerprint -> đơn hiện tại; khác -> 409. Không có -> null.
 * Không bao giờ trả đơn khi fingerprint khác.
 */
async function findReplay(
  db: Db,
  key: string,
  fingerprint: string,
  dto: DtoOptions,
): Promise<OrderDto | null> {
  const existing = await db.order.findUnique({
    where: { idempotencyKey: key },
    include: orderInclude,
  });
  if (!existing) return null;
  if (existing.requestFingerprint !== fingerprint) {
    throw new AppError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'Idempotency-Key này đã được dùng cho một yêu cầu khác',
    );
  }
  return toOrderDto(existing, dto);
}

// ---------------------------------------------------------------------------
// Đặt hàng

export interface PlaceOrderArgs {
  identity: CartIdentity;
  /** Đã kiểm UUID v4; hàm tự lowercase. */
  idempotencyKey: string;
  input: CreateOrderInput;
  /** Cấu hình thanh toán (mặc định đọc từ env). */
  paymentConfig?: PaymentConfig;
  now?: Date;
}

export interface PlaceOrderResult {
  order: OrderDto;
  /** true = đơn mới (201); false = replay (200). */
  created: boolean;
}

type TxOutcome = { kind: 'created'; order: OrderDto } | { kind: 'replay'; order: OrderDto };

function uniqueTarget(e: unknown): string | null {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return null;
  const t = e.meta?.target;
  return Array.isArray(t) ? t.join(',') : String(t ?? '');
}

export async function placeOrder(args: PlaceOrderArgs): Promise<PlaceOrderResult> {
  const { identity, input } = args;
  const paymentConfig = args.paymentConfig ?? getPaymentConfig();
  const now = args.now ?? new Date();
  const key = args.idempotencyKey.toLowerCase();
  const userId = identity.kind === 'user' ? identity.userId : null;

  if (!userId) {
    const missing: Array<{ field: string; message: string }> = [];
    if (!input.contact?.email) {
      missing.push({ field: 'contact.email', message: 'Vui lòng nhập email liên hệ' });
    }
    if (!input.contact?.phone) {
      missing.push({ field: 'contact.phone', message: 'Vui lòng nhập số điện thoại liên hệ' });
    }
    if (missing.length > 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', missing);
    }
  }

  const fingerprint = requestFingerprint(input, identity);

  // Replay TRƯỚC mọi kiểm tra nghiệp vụ (kể cả giỏ trống).
  const replay = await findReplay(prisma, key, fingerprint, { paymentConfig });
  if (replay) return { order: replay, created: false };

  if (!isProviderEnabled(paymentConfig, input.paymentMethod)) {
    throw new AppError(
      409,
      'PAYMENT_METHOD_UNAVAILABLE',
      'Phương thức thanh toán này hiện chưa khả dụng',
    );
  }
  if (!userId && input.addressId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập để dùng địa chỉ đã lưu');
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    try {
      const out = await prisma.$transaction(
        (tx) =>
          createOrderInTx(tx, { identity, userId, key, fingerprint, input, now, paymentConfig }),
        TX_OPTIONS,
      );
      if (out.kind === 'replay') return { order: out.order, created: false };
      // Chỉ gửi mail khi tạo mới; lỗi mail không ảnh hưởng đơn.
      sendMailInBackground(buildOrderConfirmationEmail(out.order, { loggedIn: userId !== null }));
      return { order: out.order, created: true };
    } catch (e) {
      const target = uniqueTarget(e);
      if (target?.includes('idempotencyKey')) {
        // Request cùng key chạy song song đã commit trước.
        const again = await findReplay(prisma, key, fingerprint, { paymentConfig });
        if (again) return { order: again, created: false };
      } else if (target?.includes('code')) {
        lastError = e;
        continue; // trùng mã đơn: sinh mã mới, chạy lại toàn bộ
      }
      throw e;
    }
  }
  throw lastError;
}

interface TxArgs {
  identity: CartIdentity;
  userId: string | null;
  key: string;
  fingerprint: string;
  input: CreateOrderInput;
  now: Date;
  paymentConfig: PaymentConfig;
}

const couponInvalid = (reason: string, minOrder?: number) =>
  new AppError(409, 'COUPON_INVALID', 'Mã giảm giá không hợp lệ', {
    reason,
    ...(minOrder !== undefined ? { minOrder } : {}),
  });

async function createOrderInTx(tx: Db, a: TxArgs): Promise<TxOutcome> {
  const { identity, userId, input, now } = a;

  // a. Giỏ + khóa, rồi kiểm lại idempotency (request cùng key song song đã commit).
  const cart = await findCartForIdentity(tx, identity, now);
  const locked = cart ? await lockCart(tx, cart.id) : false;
  const again = await findReplay(tx, a.key, a.fingerprint, { paymentConfig: a.paymentConfig, now });
  if (again) return { kind: 'replay', order: again };
  if (!cart || !locked) throw cartEmpty();

  // b. Khóa variant theo id tăng dần rồi đọc dữ liệu mới nhất.
  const variantIds = (
    await tx.cartItem.findMany({ where: { cartId: cart.id }, select: { variantId: true } })
  )
    .map((i) => i.variantId)
    .sort();
  if (variantIds.length === 0) throw cartEmpty();
  await tx.$queryRaw`SELECT "id" FROM "ProductVariant" WHERE "id" IN (${Prisma.join(variantIds)}) ORDER BY "id" FOR UPDATE`;

  const lines = await loadCartLines(tx, cart.id, now);
  if (lines.length === 0) throw cartEmpty();
  const unavailable = lines.filter((l) => l.priced.warnings.includes('UNAVAILABLE'));
  if (unavailable.length > 0) {
    throw new AppError(409, 'ITEM_UNAVAILABLE', 'Có sản phẩm không còn được bán', {
      items: unavailable.map((l) => ({ variantId: l.variantId })),
    });
  }
  const short = lines.filter((l) => l.quantity > l.stock);
  if (short.length > 0) {
    throw new AppError(409, 'OUT_OF_STOCK', 'Số lượng trong kho không đủ', {
      items: short.map((l) => ({
        variantId: l.variantId,
        requested: l.quantity,
        available: l.stock,
      })),
    });
  }

  // c. Địa chỉ giao: snapshot do server dựng.
  let snapshot: ShippingAddressSnapshot;
  if (input.addressId) {
    const address = await tx.address.findFirst({ where: { id: input.addressId, userId: userId! } });
    if (!address) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy địa chỉ');
    snapshot = {
      fullName: address.fullName,
      phone: address.phone,
      provinceCode: address.provinceCode,
      provinceName: address.provinceName,
      wardCode: address.wardCode,
      wardName: address.wardName,
      line1: address.line1,
    };
  } else {
    const sa = input.shippingAddress!;
    const loc = resolveLocation(sa.provinceCode, sa.wardCode);
    snapshot = {
      fullName: sa.fullName,
      phone: sa.phone,
      provinceCode: loc.provinceCode,
      provinceName: loc.provinceName,
      wardCode: loc.wardCode,
      wardName: loc.wardName,
      line1: sa.line1,
    };
  }

  // d. Liên hệ.
  let contactEmail: string;
  let contactPhone: string;
  if (userId) {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn');
    contactEmail = (input.contact?.email ?? user.email).toLowerCase();
    contactPhone = input.contact?.phone ?? snapshot.phone;
  } else {
    contactEmail = input.contact!.email!;
    contactPhone = input.contact!.phone!;
  }

  // e + f. Giá, mã, phí ship: cùng hàm với quote.
  const settings = await getShopSettings(tx);
  const ctx = await buildCheckoutContext({
    db: tx,
    cart,
    lines,
    provinceCode: snapshot.provinceCode,
    wardCode: snapshot.wardCode,
    couponCode: input.couponCode ?? null,
    who: userId ? { userId } : { email: contactEmail },
    settings,
    now,
  });
  const couponSummary = ctx.totals.coupon;
  if (couponSummary && !couponSummary.valid) {
    throw couponInvalid(couponSummary.invalidReason ?? 'NOT_FOUND', couponSummary.minOrder);
  }
  const option = ctx.totals.shippingOptions?.find((o) => o.method === input.shippingMethod);
  if (!option) throw validationError('shippingMethod', 'Phương thức vận chuyển không hợp lệ');
  if (input.expectedTotal !== undefined && input.expectedTotal !== option.grandTotal) {
    throw new AppError(409, 'PRICE_CHANGED', 'Giá đơn hàng đã thay đổi, vui lòng kiểm tra lại', {
      expectedTotal: input.expectedTotal,
      grandTotal: option.grandTotal,
      quote: toQuoteDto(ctx, a.paymentConfig),
    });
  }
  // Dòng Coupon thật (từ Prisma, có id); CouponLike trong CouponInput không khai báo id.
  const coupon = ctx.couponInput?.coupon as { id: string; perUserLimit: number | null } | null;

  // g. Tạo đơn TRƯỚC khi trừ kho.
  const { totals } = ctx;
  // Online: chờ thanh toán tới expiresAt (§13.1); COD: PENDING.
  const online = input.paymentMethod !== 'COD';
  const status = online ? 'PENDING_PAYMENT' : 'PENDING';
  const expiresAt = online
    ? new Date(now.getTime() + settings.paymentExpiryMinutes * 60_000)
    : null;
  const created = await tx.order.create({
    data: {
      code: generateOrderCode(now),
      userId,
      contactEmail,
      contactPhone,
      status,
      expiresAt,
      paymentStatus: 'UNPAID',
      paymentMethod: input.paymentMethod,
      shippingMethod: input.shippingMethod,
      shippingAddress: snapshot as unknown as Prisma.InputJsonValue,
      totalWeightGram: totals.totalWeightGram,
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      shippingFee: option.fee,
      shippingDiscount: option.shippingDiscount,
      grandTotal: option.grandTotal,
      couponId: coupon?.id ?? null,
      couponCode: ctx.couponInput?.code ?? null,
      note: input.note ?? null,
      idempotencyKey: a.key,
      requestFingerprint: a.fingerprint,
      items: {
        create: lines.map((l) => ({
          productId: l.productId,
          variantId: l.variantId,
          productName: l.productName,
          variantName: l.variantName,
          sku: l.variantSku,
          imageUrl: l.imageUrl,
          weightGram: l.weightGramUnit,
          unitPrice: l.priced.unitPrice,
          quantity: l.quantity,
          lineTotal: l.priced.lineTotal,
        })),
      },
      history: { create: { fromStatus: null, toStatus: status, actorId: userId } },
    },
    select: { id: true },
  });

  // h. Trừ kho có điều kiện, theo variantId tăng dần.
  const sorted = [...lines].sort((x, y) => (x.variantId < y.variantId ? -1 : 1));
  const movements: Prisma.InventoryMovementCreateManyInput[] = [];
  for (const l of sorted) {
    const rows = await tx.$queryRaw<Array<{ stock: number }>>`
      UPDATE "ProductVariant" SET "stock" = "stock" - ${l.quantity}::int, "updatedAt" = now()
      WHERE "id" = ${l.variantId} AND "stock" >= ${l.quantity}::int
      RETURNING "stock"`;
    if (rows.length === 0) {
      throw new AppError(409, 'OUT_OF_STOCK', 'Số lượng trong kho không đủ', {
        items: [{ variantId: l.variantId, requested: l.quantity, available: 0 }],
      });
    }
    movements.push({
      variantId: l.variantId,
      change: -l.quantity,
      stockAfter: Number(rows[0]!.stock),
      reason: 'ORDER_RESERVE',
      orderId: created.id,
    });
  }
  await tx.inventoryMovement.createMany({ data: movements });

  // Khóa dòng Product (FOR NO KEY UPDATE: không xung đột KEY SHARE của FK) rồi tính lại denorm.
  const productIds = [...new Set(lines.map((l) => l.productId))].sort();
  await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" IN (${Prisma.join(productIds)}) ORDER BY "id" FOR NO KEY UPDATE`;
  for (const productId of productIds) await refreshProductDenorm(tx, productId, now);

  // i. Giữ lượt mã (D-004), sau trừ kho.
  if (coupon) {
    const updated = await tx.$executeRaw`
      UPDATE "Coupon" SET "usedCount" = "usedCount" + 1, "updatedAt" = now()
      WHERE "id" = ${coupon.id} AND "isActive"
        AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
    if (updated === 0) throw couponInvalid('USAGE_LIMIT');
    if (coupon.perUserLimit != null) {
      const used = await tx.couponRedemption.count({
        where: {
          couponId: coupon.id,
          releasedAt: null,
          ...(userId ? { userId } : { email: contactEmail }),
        },
      });
      if (used >= coupon.perUserLimit) throw couponInvalid('PER_USER_LIMIT');
    }
    await tx.couponRedemption.create({
      data: { couponId: coupon.id, orderId: created.id, userId, email: contactEmail },
    });
  }

  // j. Dọn giỏ.
  await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
  await tx.cart.update({ where: { id: cart.id }, data: { couponCode: null, lastActivityAt: now } });

  const full = await tx.order.findUniqueOrThrow({
    where: { id: created.id },
    include: orderInclude,
  });
  return { kind: 'created', order: toOrderDto(full, { paymentConfig: a.paymentConfig, now }) };
}

// ---------------------------------------------------------------------------
// Đọc

const orderNotFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy đơn hàng');

/** GET /orders/:code: chỉ chủ đơn; không tồn tại/của người khác/đơn guest -> 404 cùng thông báo. */
export async function getOrderForUser(
  rawCode: string,
  userId: string,
  dto: DtoOptions = {},
): Promise<OrderDto> {
  const order = await prisma.order.findUnique({
    where: { code: normalizeOrderCode(rawCode) },
    include: orderInclude,
  });
  if (!order || order.userId !== userId) throw orderNotFound();
  return toOrderDto(order, dto);
}

/** GET /orders/track: code + SĐT khớp `contactPhone`; mọi trường hợp khác -> 404 cùng thông báo. */
export async function trackOrder(
  rawCode: string,
  phone: string,
  dto: DtoOptions = {},
): Promise<TrackedOrderDto> {
  const code = normalizeOrderCode(rawCode);
  if (!ORDER_CODE_REGEX.test(code)) throw orderNotFound();
  const order = await prisma.order.findUnique({ where: { code }, include: orderInclude });
  if (!order || order.contactPhone !== phone) throw orderNotFound();
  return toTrackedOrderDto(order, dto);
}

// ---------------------------------------------------------------------------
// Khách hủy đơn

export interface CustomerCancelArgs {
  rawCode: string;
  /** Có = đã đăng nhập (kể cả STAFF/ADMIN: vẫn chỉ hủy đơn của chính mình). */
  userId: string | null;
  input: CancelOrderInput;
  paymentConfig?: PaymentConfig;
  now?: Date;
}

export async function cancelOrderForCustomer(
  args: CustomerCancelArgs,
): Promise<OrderDto | TrackedOrderDto> {
  const { userId, input } = args;
  const now = args.now ?? new Date();

  let guestPhone: string | null = null;
  if (!userId) {
    const normalized = input.phone ? normalizePhone(input.phone) : null;
    if (!normalized) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [
        {
          field: 'phone',
          message: input.phone
            ? 'Số điện thoại không hợp lệ'
            : 'Vui lòng nhập số điện thoại đặt hàng',
        },
      ]);
    }
    guestPhone = normalized;
  }

  const code = normalizeOrderCode(args.rawCode);
  if (!ORDER_CODE_REGEX.test(code)) throw orderNotFound();

  const { dto, row } = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { code },
      select: { id: true, status: true, userId: true, contactPhone: true },
    });
    const owned = order
      ? userId
        ? order.userId === userId
        : order.userId === null && order.contactPhone === guestPhone
      : false;
    if (!order || !owned) throw orderNotFound();

    await cancelOrderTx(tx, {
      orderId: order.id,
      from: order.status,
      actor: 'CUSTOMER',
      actorId: userId,
      reason: input.reason ?? null,
      now,
    });
    const full = await tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: orderInclude,
    });
    // Khách không đăng nhập chỉ nhận dữ liệu rút gọn (như /orders/track), không lộ PII.
    const dto = { paymentConfig: args.paymentConfig ?? getPaymentConfig(), now };
    return {
      dto: userId ? toOrderDto(full, dto) : toTrackedOrderDto(full, dto),
      row: full,
    };
  }, TX_OPTIONS);

  // Sau commit (api-contract §13.9): gửi nền, lỗi chỉ log.
  notifyOrderStatusChange(row);
  return dto;
}

// ---------------------------------------------------------------------------
// Danh sách đơn của tôi

export interface MyOrderListItem {
  code: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  grandTotal: number;
  itemCount: number;
  createdAt: string;
  items: Array<{
    productName: string;
    variantName: string;
    imageUrl: string | null;
    quantity: number;
  }>;
}

export async function listMyOrders(
  userId: string,
  q: MyOrdersQuery,
): Promise<{
  data: MyOrderListItem[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const where: Prisma.OrderWhereInput = {
    userId,
    ...(q.status ? { status: { in: q.status as OrderStatus[] } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        code: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        grandTotal: true,
        createdAt: true,
        items: {
          orderBy: { id: 'asc' },
          take: 3,
          select: { productName: true, variantName: true, imageUrl: true, quantity: true },
        },
      },
    }),
  ]);

  // Tổng quantity theo đơn: 1 truy vấn cho cả trang (tránh N+1).
  const sums =
    rows.length > 0
      ? await prisma.orderItem.groupBy({
          by: ['orderId'],
          where: { orderId: { in: rows.map((r) => r.id) } },
          _sum: { quantity: true },
        })
      : [];
  const countByOrder = new Map(sums.map((s) => [s.orderId, s._sum.quantity ?? 0]));

  return {
    data: rows.map((r) => ({
      code: r.code,
      status: r.status,
      paymentStatus: r.paymentStatus,
      paymentMethod: r.paymentMethod,
      grandTotal: r.grandTotal,
      itemCount: countByOrder.get(r.id) ?? 0,
      createdAt: r.createdAt.toISOString(),
      items: r.items,
    })),
    meta: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    },
  };
}
