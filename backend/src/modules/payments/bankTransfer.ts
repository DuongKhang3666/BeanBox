import type { PaymentConfig } from '../../config/payments.js';
import { AppError } from '../../lib/errors.js';
import { normalizeOrderCode, ORDER_CODE_REGEX } from '../../lib/orderCode.js';
import { normalizePhone } from '../../lib/phone.js';
import { prisma } from '../../lib/prisma.js';
import { getAllSettings, type BankTransferSettings } from '../settings/settings.service.js';
import { DEMO_BANK_BIN, buildVietQrPayload, qrPngDataUrl } from './vietqr.js';

/** Chuyển khoản / VietQR (D-061): hướng dẫn thanh toán + khách báo đã chuyển. Không đổi trạng thái đơn. */

export interface BankTransferInstructions {
  orderCode: string;
  amount: number;
  /** Nội dung chuyển khoản = mã đơn. */
  content: string;
  bankName: string;
  bankBin: string;
  accountNo: string;
  accountName: string;
  /** Chuỗi EMVCo/VietQR (để app ngân hàng quét); ảnh dựng từ chính chuỗi này. */
  qrPayload: string;
  /** PNG data URL (CSP storefront cho phép img-src data:). */
  qrDataUrl: string;
  expiresAt: string;
  claimedAt: string | null;
  /** true khi dùng BIN demo hoặc đang bật cổng giả: UI phải cảnh báo "KHÔNG chuyển tiền thật". */
  isDemo: boolean;
}

const notFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy đơn hàng');
const notAllowed = (reason: 'STATUS' | 'METHOD_MISMATCH' | 'EXPIRED' | 'UNAVAILABLE') =>
  new AppError(409, 'PAYMENT_NOT_ALLOWED', 'Không thể thanh toán đơn hàng này', { reason });

export interface OwnerInput {
  code: string;
  phone?: string | undefined;
  userId?: string | null | undefined;
}

/** Chủ đơn, hoặc đơn khách vãng lai + SĐT khớp (như hủy đơn §9.4); còn lại -> 404. */
async function findOwnedOrder(input: OwnerInput) {
  const userId = input.userId ?? null;
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
  const code = normalizeOrderCode(input.code);
  if (!ORDER_CODE_REGEX.test(code)) throw notFound();
  const order = await prisma.order.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      userId: true,
      contactPhone: true,
      status: true,
      paymentMethod: true,
      grandTotal: true,
      expiresAt: true,
      transferClaimedAt: true,
    },
  });
  const owned = order
    ? userId
      ? order.userId === userId
      : order.userId === null && order.contactPhone === guestPhone
    : false;
  if (!order || !owned) throw notFound();
  return order;
}

function assertAwaiting(
  order: { status: string; paymentMethod: string; expiresAt: Date | null },
  config: PaymentConfig,
  now: Date,
): void {
  if (order.paymentMethod !== 'BANK_TRANSFER') throw notAllowed('METHOD_MISMATCH');
  if (order.status !== 'PENDING_PAYMENT') throw notAllowed('STATUS');
  if (!config.bankTransfer) throw notAllowed('UNAVAILABLE');
  if (!order.expiresAt || order.expiresAt.getTime() <= now.getTime()) throw notAllowed('EXPIRED');
}

export async function getBankTransferInstructions(
  input: OwnerInput,
  config: PaymentConfig,
  now: Date = new Date(),
): Promise<BankTransferInstructions> {
  const order = await findOwnedOrder(input);
  assertAwaiting(order, config, now);
  const { values } = await getAllSettings();
  const bank = values['payment.bankTransfer'] as BankTransferSettings;
  const qrPayload = buildVietQrPayload({
    bankBin: bank.bankBin,
    accountNo: bank.accountNo,
    amount: order.grandTotal,
    content: order.code,
  });
  return {
    orderCode: order.code,
    amount: order.grandTotal,
    content: order.code,
    bankName: bank.bankName,
    bankBin: bank.bankBin,
    accountNo: bank.accountNo,
    accountName: bank.accountName,
    qrPayload,
    qrDataUrl: await qrPngDataUrl(qrPayload),
    expiresAt: order.expiresAt!.toISOString(),
    claimedAt: order.transferClaimedAt ? order.transferClaimedAt.toISOString() : null,
    isDemo: bank.bankBin === DEMO_BANK_BIN || config.mocksEnabled === true,
  };
}

/** "Tôi đã chuyển khoản": chỉ ghi thời điểm (lần đầu); gọi lại giữ nguyên mốc cũ. KHÔNG đổi sang PAID. */
export async function claimBankTransfer(
  input: OwnerInput,
  config: PaymentConfig,
  now: Date = new Date(),
): Promise<{ claimedAt: string }> {
  const order = await findOwnedOrder(input);
  assertAwaiting(order, config, now);
  if (order.transferClaimedAt) return { claimedAt: order.transferClaimedAt.toISOString() };
  // Điều kiện null trong WHERE: hai request song song cùng ghi một mốc duy nhất.
  await prisma.order.updateMany({
    where: { id: order.id, transferClaimedAt: null, status: 'PENDING_PAYMENT' },
    data: { transferClaimedAt: now },
  });
  const fresh = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { transferClaimedAt: true },
  });
  return { claimedAt: (fresh.transferClaimedAt ?? now).toISOString() };
}
