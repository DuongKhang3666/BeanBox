import QRCode from 'qrcode';

/**
 * VietQR (NAPAS) theo EMVCo MPM, hàm thuần (D-061). Không gọi mạng, không đọc env.
 * Cấu trúc TLV: 2 ký tự id + 2 chữ số độ dài + giá trị. Thứ tự trường:
 *   00 version "01" | 01 kiểu "12" (động, có số tiền) | 38 thông tin tài khoản NAPAS |
 *   53 mã tiền "704" (VND) | 54 số tiền | 58 quốc gia "VN" | 62 dữ liệu bổ sung (08 = nội dung) | 63 CRC.
 * Trường 38: 00 = GUID "A000000727"; 01 = {00 BIN ngân hàng, 01 số tài khoản}; 02 = dịch vụ "QRIBFTTA"
 * (chuyển nhanh 24/7 tới tài khoản).
 */

export const NAPAS_GUID = 'A000000727';
export const VIETQR_SERVICE_ACCOUNT = 'QRIBFTTA';
/** BIN không tồn tại: app ngân hàng không thể chuyển tiền thật tới mã này (D-061). */
export const DEMO_BANK_BIN = '999999';
export const CONTENT_MAX = 25;

export interface VietQrInput {
  /** Mã BIN 6 chữ số của ngân hàng thụ hưởng. */
  bankBin: string;
  accountNo: string;
  /** VND, số nguyên dương. */
  amount: number;
  /** Nội dung chuyển khoản (mã đơn). */
  content: string;
}

function tlv(id: string, value: string): string {
  if (value.length > 99) throw new Error(`Trường ${id} quá dài`);
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

/** CRC-16/CCITT-FALSE: đa thức 0x1021, khởi tạo 0xFFFF, không đảo bit. Trả 4 ký tự hex HOA. */
export function crc16Ccitt(data: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(data, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Bỏ dấu tiếng Việt, chỉ giữ chữ-số-khoảng trắng-gạch; tối đa CONTENT_MAX ký tự. */
export function sanitizeContent(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 -]/g, '')
    .trim()
    .slice(0, CONTENT_MAX);
}

export function buildVietQrPayload(input: VietQrInput): string {
  if (!/^\d{6}$/.test(input.bankBin)) throw new Error('BIN ngân hàng phải gồm 6 chữ số');
  if (!/^\d{6,19}$/.test(input.accountNo)) throw new Error('Số tài khoản không hợp lệ');
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('Số tiền không hợp lệ');
  const content = sanitizeContent(input.content);
  const consumer = tlv('00', input.bankBin) + tlv('01', input.accountNo);
  const merchant = tlv('00', NAPAS_GUID) + tlv('01', consumer) + tlv('02', VIETQR_SERVICE_ACCOUNT);
  const body =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('38', merchant) +
    tlv('53', '704') +
    tlv('54', String(input.amount)) +
    tlv('58', 'VN') +
    (content ? tlv('62', tlv('08', content)) : '') +
    '6304';
  return body + crc16Ccitt(body);
}

export interface TlvEntry {
  id: string;
  value: string;
}

/** Tách TLV mức đầu; ném lỗi nếu cấu trúc hỏng. Dùng để tự kiểm payload (test). */
export function parseTlv(payload: string): TlvEntry[] {
  const out: TlvEntry[] = [];
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (id.length !== 2 || !Number.isInteger(len) || payload.length < i + 4 + len) {
      throw new Error('TLV không hợp lệ');
    }
    out.push({ id, value: payload.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return out;
}

/** Kiểm CRC ở cuối payload (id 63, dài 4). */
export function verifyVietQrCrc(payload: string): boolean {
  if (payload.length < 8 || payload.slice(-8, -4) !== '6304') return false;
  return crc16Ccitt(payload.slice(0, -4)) === payload.slice(-4);
}

/** PNG data URL của mã QR (lỗi sửa mức M, lề 2 module). Thư viện `qrcode` chỉ dùng để vẽ ma trận. */
export function qrPngDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 320 });
}
