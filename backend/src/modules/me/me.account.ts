import { randomBytes } from 'node:crypto';
import type { OrderStatus } from '../../generated/prisma/client.js';
import { writeAudit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { recordFailedLogin } from '../auth/auth.service.js';
import { toUserDto } from '../../lib/userDto.js';
import { toAddressDto } from './me.service.js';

/**
 * Quyền của khách với dữ liệu cá nhân (D-065): tự xóa tài khoản (ẩn danh hóa) và xuất dữ liệu.
 */

export const DELETED_NAME = 'Người dùng đã xóa';
export const DELETED_LINE1 = '[đã xóa]';
/** Đơn đang xử lý: còn phải giao/thanh toán/đổi trả nên chặn xóa tài khoản. */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'PENDING_PAYMENT',
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPING',
  'FAILED_DELIVERY',
  'RETURN_REQUESTED',
];
export const MAX_ACTIVE_ORDER_CODES = 10;
export const MAX_EXPORT_ORDERS = 1000;
const MAX_EXPORT_CONTACT_MESSAGES = 200;

export const anonymizedEmail = (userId: string) => `deleted-${userId}@deleted.invalid`;

// ───────────── Xóa tài khoản ─────────────

export async function deleteAccount(
  userId: string,
  password: string,
  ip: string | undefined,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt)
    throw new AppError(401, 'UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn');
  if (user.role !== 'CUSTOMER') {
    throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này');
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new AppError(
      403,
      'ACCOUNT_LOCKED',
      'Tài khoản tạm thời bị khóa do nhập sai mật khẩu nhiều lần',
      { lockedUntil: user.lockedUntil.toISOString() },
    );
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    await recordFailedLogin(userId); // cùng cơ chế khóa tạm như đăng nhập
    throw new AppError(400, 'INVALID_PASSWORD', 'Mật khẩu không đúng');
  }

  const anonEmail = anonymizedEmail(userId);
  // Mật khẩu ngẫu nhiên không ai biết: tài khoản không thể đăng nhập lại.
  const passwordHash = await hashPassword(randomBytes(32).toString('hex'));
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Khóa dòng user: tuần tự hóa với các thao tác ghi khác của chính user này.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const current = await tx.user.findUnique({
      where: { id: userId },
      select: { email: true, deletedAt: true },
    });
    if (!current || current.deletedAt) {
      throw new AppError(401, 'UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn');
    }

    const activeWhere = { userId, status: { in: ACTIVE_ORDER_STATUSES } };
    const active = await tx.order.findMany({
      where: activeWhere,
      select: { code: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_ACTIVE_ORDER_CODES,
    });
    if (active.length > 0) {
      const total = await tx.order.count({ where: activeWhere });
      throw new AppError(
        409,
        'ACTIVE_ORDERS_EXIST',
        'Bạn còn đơn hàng đang xử lý. Vui lòng chờ đơn hoàn tất hoặc hủy đơn trước khi xóa tài khoản.',
        { orderCodes: active.map((o) => o.code), total },
      );
    }

    // Email cũ (trước khi bị ghi đè) dùng để tìm tin nhắn liên hệ cùng người gửi.
    const oldEmail = current.email;

    await tx.user.update({
      where: { id: userId },
      data: {
        email: anonEmail,
        fullName: DELETED_NAME,
        phone: null,
        birthDate: null,
        avatarUrl: null,
        passwordHash,
        status: 'DISABLED',
        deletedAt: now,
        emailVerifiedAt: null,
        failedLoginCount: 0,
        lastFailedLoginAt: null,
        lockedUntil: null,
        twoFactorEnabledAt: null,
        twoFactorSecretEnc: null,
        twoFactorPendingSecretEnc: null,
        twoFactorPendingAt: null,
        twoFactorLastStep: null,
      },
    });

    await tx.address.deleteMany({ where: { userId } });
    await tx.wishlist.deleteMany({ where: { userId } });
    await tx.cart.deleteMany({ where: { userId } }); // CartItem xóa theo cascade
    await tx.refreshToken.deleteMany({ where: { userId } }); // mọi phiên mất hiệu lực ngay
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.emailVerificationToken.deleteMany({ where: { userId } });
    await tx.twoFactorBackupCode.deleteMany({ where: { userId } });
    await tx.twoFactorChallenge.deleteMany({ where: { userId } });

    // Đơn: giữ userId, số tiền, items, trạng thái, lịch sử, tỉnh/phường; xóa PII.
    await tx.$executeRaw`
      UPDATE "Order" SET
        "contactEmail" = ${anonEmail},
        "contactPhone" = '',
        "note" = NULL,
        "shippingAddress" = "shippingAddress" || jsonb_build_object(
          'fullName', ${DELETED_NAME}::text, 'phone', ''::text, 'line1', ${DELETED_LINE1}::text)
      WHERE "userId" = ${userId}`;
    await tx.couponRedemption.updateMany({ where: { userId }, data: { email: anonEmail } });

    // Tin nhắn liên hệ: ẩn danh thông tin liên hệ, giữ nội dung và trạng thái xử lý.
    await tx.contactMessage.updateMany({
      where: { OR: [{ userId }, { email: { equals: oldEmail, mode: 'insensitive' } }] },
      data: { name: DELETED_NAME, email: anonEmail, phone: null },
    });

    await writeAudit(tx, {
      actorId: userId,
      action: 'user.self_delete',
      entity: 'User',
      entityId: userId,
      ip: ip ?? null,
    });
  });
}

// ───────────── Xuất dữ liệu ─────────────

export const EXPORT_FORMAT_VERSION = 1;

/** Ngày hiện tại theo giờ Việt Nam (YYYY-MM-DD), dùng dựng tên file. */
export function exportDateVn(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const exportFilename = (now: Date = new Date()) =>
  `beanbox-du-lieu-ca-nhan-${exportDateVn(now)}.json`;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const ymd = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export async function exportPersonalData(userId: string, ip: string | undefined, now = new Date()) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt)
    throw new AppError(401, 'UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn');

  const [addresses, orders, reviews, wishlist, contactMessages] = await Promise.all([
    prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.order.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_EXPORT_ORDERS + 1,
      select: {
        code: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        shippingMethod: true,
        contactEmail: true,
        contactPhone: true,
        shippingAddress: true,
        subtotal: true,
        discountTotal: true,
        shippingFee: true,
        shippingDiscount: true,
        grandTotal: true,
        couponCode: true,
        note: true,
        trackingNumber: true,
        carrier: true,
        cancelReason: true,
        etaFrom: true,
        etaTo: true,
        createdAt: true,
        paidAt: true,
        confirmedAt: true,
        deliveredAt: true,
        cancelledAt: true,
        items: {
          orderBy: { id: 'asc' },
          select: {
            productName: true,
            variantName: true,
            sku: true,
            unitPrice: true,
            quantity: true,
            lineTotal: true,
          },
        },
        history: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { fromStatus: true, toStatus: true, createdAt: true },
        },
        // Chỉ tóm tắt: không rawPayload, không mã giao dịch của cổng.
        payments: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { provider: true, status: true, amount: true, createdAt: true, refundedAt: true },
        },
      },
    }),
    prisma.review.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        rating: true,
        content: true,
        images: true,
        status: true,
        reply: true,
        createdAt: true,
        product: { select: { name: true, slug: true } },
      },
    }),
    prisma.wishlist.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }],
      select: { createdAt: true, product: { select: { name: true, slug: true } } },
    }),
    prisma.contactMessage.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_EXPORT_CONTACT_MESSAGES,
      select: {
        name: true,
        email: true,
        phone: true,
        subject: true,
        message: true,
        createdAt: true,
      },
    }),
  ]);

  const truncated = orders.length > MAX_EXPORT_ORDERS;
  const kept = truncated ? orders.slice(0, MAX_EXPORT_ORDERS) : orders;

  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      actorId: userId,
      action: 'user.export',
      entity: 'User',
      entityId: userId,
      ip: ip ?? null,
    });
  });

  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    truncated,
    profile: { ...toUserDto(user), emailVerifiedAt: iso(user.emailVerifiedAt) },
    addresses: addresses.map(toAddressDto),
    orders: kept.map((o) => ({
      code: o.code,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      shippingMethod: o.shippingMethod,
      contactEmail: o.contactEmail,
      contactPhone: o.contactPhone,
      shippingAddress: o.shippingAddress,
      items: o.items,
      subtotal: o.subtotal,
      discountTotal: o.discountTotal,
      shippingFee: o.shippingFee,
      shippingDiscount: o.shippingDiscount,
      grandTotal: o.grandTotal,
      couponCode: o.couponCode,
      note: o.note,
      trackingNumber: o.trackingNumber,
      carrier: o.carrier,
      cancelReason: o.cancelReason,
      estimatedDelivery: { from: ymd(o.etaFrom), to: ymd(o.etaTo) },
      createdAt: o.createdAt.toISOString(),
      paidAt: iso(o.paidAt),
      confirmedAt: iso(o.confirmedAt),
      deliveredAt: iso(o.deliveredAt),
      cancelledAt: iso(o.cancelledAt),
      statusHistory: o.history.map((h) => ({
        from: h.fromStatus,
        to: h.toStatus,
        at: h.createdAt.toISOString(),
      })),
      payments: o.payments.map((p) => ({
        provider: p.provider,
        status: p.status,
        amount: p.amount,
        createdAt: p.createdAt.toISOString(),
        refundedAt: iso(p.refundedAt),
      })),
    })),
    reviews: reviews.map((r) => ({
      product: { name: r.product.name, slug: r.product.slug },
      rating: r.rating,
      content: r.content,
      images: r.images,
      status: r.status,
      reply: r.reply,
      createdAt: r.createdAt.toISOString(),
    })),
    wishlist: wishlist.map((w) => ({
      product: { name: w.product.name, slug: w.product.slug },
      addedAt: w.createdAt.toISOString(),
    })),
    contactMessages: contactMessages.map((m) => ({
      name: m.name,
      email: m.email,
      phone: m.phone,
      subject: m.subject,
      message: m.message,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
