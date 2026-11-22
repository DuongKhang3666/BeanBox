import { describe, expect, it } from 'vitest';
import {
  buildVietQrPayload,
  crc16Ccitt,
  NAPAS_GUID,
  parseTlv,
  qrPngDataUrl,
  sanitizeContent,
  verifyVietQrCrc,
} from '../src/modules/payments/vietqr.js';

// BIN 999999 không tồn tại: payload test không thể chuyển tiền thật. Vector tính độc lập
// (script riêng, CRC-16/CCITT-FALSE), không dùng chính hàm đang kiểm.
const VECTOR_A =
  '00020101021238540010A00000072701240006999999011001234567890208QRIBFTTA53037045405500005802VN62180814BB-261110-K7QP63040C77';
const VECTOR_B_BODY =
  '00020101021238540010A00000072701240006999999011098765432100208QRIBFTTA5303704540115802VN6304';

describe('crc16Ccitt', () => {
  it('vector chuẩn CRC-16/CCITT-FALSE: "123456789" -> 29B1', () => {
    expect(crc16Ccitt('123456789')).toBe('29B1');
  });
  it('chuỗi rỗng -> FFFF, luôn 4 ký tự hex hoa', () => {
    expect(crc16Ccitt('')).toBe('FFFF');
    expect(crc16Ccitt('A')).toMatch(/^[0-9A-F]{4}$/);
  });
});

describe('buildVietQrPayload', () => {
  it('khớp vector cố định (có nội dung chuyển khoản)', () => {
    expect(
      buildVietQrPayload({
        bankBin: '999999',
        accountNo: '0123456789',
        amount: 50000,
        content: 'BB-261110-K7QP',
      }),
    ).toBe(VECTOR_A);
  });

  it('khớp vector cố định (không nội dung: không có trường 62)', () => {
    const p = buildVietQrPayload({
      bankBin: '999999',
      accountNo: '9876543210',
      amount: 1,
      content: '',
    });
    expect(p.slice(0, -4)).toBe(VECTOR_B_BODY);
    expect(verifyVietQrCrc(p)).toBe(true);
  });

  it('cấu trúc TLV: thứ tự trường, GUID NAPAS, BIN, số tài khoản, dịch vụ, tiền tệ, quốc gia, nội dung', () => {
    const p = buildVietQrPayload({
      bankBin: '999999',
      accountNo: '0123456789',
      amount: 220000,
      content: 'BB-261110-K7QP',
    });
    const top = parseTlv(p);
    expect(top.map((t) => t.id)).toEqual(['00', '01', '38', '53', '54', '58', '62', '63']);
    const get = (id: string) => top.find((t) => t.id === id)!.value;
    expect(get('00')).toBe('01');
    expect(get('01')).toBe('12');
    expect(get('53')).toBe('704');
    expect(get('54')).toBe('220000');
    expect(get('58')).toBe('VN');
    const merchant = parseTlv(get('38'));
    expect(merchant.map((t) => t.id)).toEqual(['00', '01', '02']);
    expect(merchant[0]!.value).toBe(NAPAS_GUID);
    expect(merchant[2]!.value).toBe('QRIBFTTA');
    expect(parseTlv(merchant[1]!.value)).toEqual([
      { id: '00', value: '999999' },
      { id: '01', value: '0123456789' },
    ]);
    expect(parseTlv(get('62'))).toEqual([{ id: '08', value: 'BB-261110-K7QP' }]);
    expect(get('63')).toHaveLength(4);
  });

  it('CRC tự kiểm; sửa 1 ký tự thì CRC sai', () => {
    const p = buildVietQrPayload({
      bankBin: '999999',
      accountNo: '0123456789',
      amount: 12345,
      content: 'BB-1',
    });
    expect(verifyVietQrCrc(p)).toBe(true);
    expect(verifyVietQrCrc(p.replace('12345', '12346'))).toBe(false);
    expect(verifyVietQrCrc('abc')).toBe(false);
  });

  it('từ chối đầu vào sai', () => {
    const ok = { bankBin: '999999', accountNo: '0123456789', amount: 1000, content: 'x' };
    expect(() => buildVietQrPayload({ ...ok, bankBin: '12345' })).toThrow();
    expect(() => buildVietQrPayload({ ...ok, accountNo: '12ab' })).toThrow();
    expect(() => buildVietQrPayload({ ...ok, amount: 0 })).toThrow();
    expect(() => buildVietQrPayload({ ...ok, amount: 10.5 })).toThrow();
  });

  it('parseTlv ném lỗi khi cấu trúc hỏng', () => {
    expect(() => parseTlv('0002')).toThrow();
    expect(() => parseTlv('00990')).toThrow();
  });
});

describe('sanitizeContent', () => {
  it('bỏ dấu tiếng Việt, ký tự lạ và cắt tối đa 25 ký tự', () => {
    expect(sanitizeContent('Thanh toán đơn BB-1')).toBe('Thanh toan don BB-1');
    expect(sanitizeContent('A*B&C<>')).toBe('ABC');
    expect(sanitizeContent('x'.repeat(40))).toHaveLength(25);
  });
});

describe('qrPngDataUrl', () => {
  it('trả PNG data URL hợp lệ (chữ ký PNG)', async () => {
    const url = await qrPngDataUrl(VECTOR_A);
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    const bytes = Buffer.from(url.split(',')[1]!, 'base64');
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
