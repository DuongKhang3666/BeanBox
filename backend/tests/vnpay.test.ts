import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { formatVnDateTime, formatVnpayDate } from '../src/lib/vnTime.js';
import {
  buildVnpayUrl,
  isVnpaySuccess,
  normalizeVnpayIp,
  signVnpay,
  stripVnpaySignature,
  verifyVnpay,
  vnpayQueryString,
} from '../src/modules/payments/vnpay.js';

// Giá trị test tự đặt, KHÔNG phải secret thật.
const SECRET = 'test-hash-secret';
const CONFIG = {
  tmnCode: 'TESTTMN01',
  hashSecret: SECRET,
  paymentUrl: 'https://sandbox.example.test/vpcpay.html',
  returnUrl: 'http://localhost:3000/thanh-toan/ket-qua?provider=vnpay',
};

const hmac = (data: string) => createHmac('sha512', SECRET).update(data, 'utf8').digest('hex');

describe('vnpay: ký và kiểm chữ ký', () => {
  it('khớp vector tính tay (sắp khóa, encode, %20 -> +)', () => {
    const params = {
      vnp_TxnRef: 'abc',
      vnp_Amount: '31700000',
      vnp_OrderInfo: 'Thanh toan don hang BB-1',
    };
    // Khóa sắp tăng dần: vnp_Amount, vnp_OrderInfo, vnp_TxnRef
    const expectedData =
      'vnp_Amount=31700000&vnp_OrderInfo=Thanh+toan+don+hang+BB-1&vnp_TxnRef=abc';
    expect(vnpayQueryString(params)).toBe(expectedData);
    expect(signVnpay(params, SECRET)).toBe(hmac(expectedData));
    expect(signVnpay(params, SECRET)).toMatch(/^[0-9a-f]{128}$/);
  });

  it('thứ tự khóa khác nhau vẫn cùng chữ ký', () => {
    const a = { vnp_A: '1', vnp_B: '2', vnp_C: '3' };
    const b = { vnp_C: '3', vnp_A: '1', vnp_B: '2' };
    expect(signVnpay(a, SECRET)).toBe(signVnpay(b, SECRET));
  });

  it('bỏ vnp_SecureHash, vnp_SecureHashType và khóa không phải vnp_*', () => {
    const base = { vnp_A: '1' };
    const withNoise = {
      ...base,
      vnp_SecureHash: 'x',
      vnp_SecureHashType: 'HmacSHA512',
      other: 'zzz',
    };
    expect(signVnpay(withNoise, SECRET)).toBe(signVnpay(base, SECRET));
  });

  it('ký rồi verify; đổi 1 tham số hoặc secret -> sai', () => {
    const params = { vnp_Amount: '100', vnp_TxnRef: 'p1', vnp_ResponseCode: '00' };
    const q = { ...params, vnp_SecureHash: signVnpay(params, SECRET) };
    expect(verifyVnpay(q, SECRET)).toBe(true);
    expect(verifyVnpay({ ...q, vnp_Amount: '101' }, SECRET)).toBe(false);
    expect(verifyVnpay({ ...q, vnp_Extra: 'x' }, SECRET)).toBe(false);
    expect(verifyVnpay(q, 'other-secret')).toBe(false);
  });

  it('hex không phân biệt hoa thường; độ dài khác/thiếu/không phải chuỗi -> sai', () => {
    const params = { vnp_Amount: '100' };
    const hash = signVnpay(params, SECRET);
    expect(verifyVnpay({ ...params, vnp_SecureHash: hash.toUpperCase() }, SECRET)).toBe(true);
    expect(verifyVnpay({ ...params, vnp_SecureHash: hash.slice(0, -2) }, SECRET)).toBe(false);
    expect(verifyVnpay({ ...params, vnp_SecureHash: '' }, SECRET)).toBe(false);
    expect(verifyVnpay(params, SECRET)).toBe(false);
    expect(verifyVnpay({ ...params, vnp_SecureHash: [hash] }, SECRET)).toBe(false);
    // Tham số lặp (mảng) không bao giờ hợp lệ
    expect(verifyVnpay({ vnp_Amount: ['100', '200'], vnp_SecureHash: hash }, SECRET)).toBe(false);
  });

  it('giá trị có dấu cách và tiếng Việt: encode UTF-8, qua round-trip URL vẫn verify', () => {
    const params = {
      vnp_OrderInfo: 'Thanh toán đơn hàng số 1 & thử',
      vnp_TxnRef: 'x y',
    };
    expect(vnpayQueryString(params)).toBe(
      'vnp_OrderInfo=Thanh+to%C3%A1n+%C4%91%C6%A1n+h%C3%A0ng+s%E1%BB%91+1+%26+th%E1%BB%AD&vnp_TxnRef=x+y',
    );
    const hash = signVnpay(params, SECRET);
    // Mô phỏng VNPay trả về: query string rồi parse lại như Express (qs: '+' -> dấu cách)
    const url = new URL(`https://x.test/?${vnpayQueryString(params)}&vnp_SecureHash=${hash}`);
    expect(verifyVnpay(Object.fromEntries(url.searchParams), SECRET)).toBe(true);
  });
});

describe('vnpay: buildVnpayUrl', () => {
  const createDate = new Date('2026-11-11T01:02:03.000Z'); // 08:02:03 giờ VN
  const expireDate = new Date('2026-11-11T01:17:03.000Z');
  const url = buildVnpayUrl(
    {
      txnRef: 'ckpay1',
      amountVnd: 317000,
      orderCode: 'BB-261110-K7QP',
      ipAddr: '::ffff:203.0.113.9',
      createDate,
      expireDate,
    },
    CONFIG,
  );
  const u = new URL(url);

  it('có đủ tham số theo §13.2 và chữ ký verify được', () => {
    expect(`${u.origin}${u.pathname}`).toBe(CONFIG.paymentUrl);
    const q = Object.fromEntries(u.searchParams);
    expect(q).toMatchObject({
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: 'TESTTMN01',
      vnp_Amount: '31700000',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: 'ckpay1',
      vnp_OrderInfo: 'Thanh toan don hang BB-261110-K7QP',
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: CONFIG.returnUrl,
      vnp_IpAddr: '203.0.113.9',
      vnp_CreateDate: '20261111080203',
      vnp_ExpireDate: '20261111081703',
    });
    expect(verifyVnpay(q, SECRET)).toBe(true);
  });

  it('vnp_SecureHash đứng cuối và không lộ secret', () => {
    expect(url.endsWith(`&vnp_SecureHash=${u.searchParams.get('vnp_SecureHash')}`)).toBe(true);
    expect(url).not.toContain(SECRET);
  });
});

describe('vnpay: tiện ích', () => {
  it('formatVnpayDate dùng giờ Việt Nam (qua nửa đêm UTC)', () => {
    expect(formatVnpayDate(new Date('2026-12-31T17:30:00.000Z'))).toBe('20270101003000');
    expect(formatVnpayDate(new Date('2026-01-02T03:04:05.000Z'))).toBe('20260102100405');
  });

  it('formatVnDateTime = HH:mm dd/MM/yyyy giờ VN', () => {
    expect(formatVnDateTime(new Date('2026-11-11T01:17:03.000Z'))).toBe('08:17 11/11/2026');
  });

  it('normalizeVnpayIp', () => {
    expect(normalizeVnpayIp('::ffff:1.2.3.4')).toBe('1.2.3.4');
    expect(normalizeVnpayIp('::1')).toBe('127.0.0.1');
    expect(normalizeVnpayIp(undefined)).toBe('127.0.0.1');
    expect(normalizeVnpayIp('10.0.0.1')).toBe('10.0.0.1');
  });

  it('stripVnpaySignature và isVnpaySuccess', () => {
    expect(
      stripVnpaySignature({
        vnp_A: '1',
        vnp_SecureHash: 'h',
        vnp_SecureHashType: 'HmacSHA512',
        foo: 'bar',
        vnp_B: ['x'],
      }),
    ).toEqual({ vnp_A: '1' });
    expect(isVnpaySuccess({ vnp_ResponseCode: '00', vnp_TransactionStatus: '00' })).toBe(true);
    expect(isVnpaySuccess({ vnp_ResponseCode: '00', vnp_TransactionStatus: '02' })).toBe(false);
    expect(isVnpaySuccess({ vnp_ResponseCode: '24', vnp_TransactionStatus: '02' })).toBe(false);
    expect(isVnpaySuccess({ vnp_ResponseCode: '00' })).toBe(false);
  });
});
