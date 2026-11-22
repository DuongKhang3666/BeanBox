import { describe, expect, it } from 'vitest';
import type { MomoMockConfig } from '../src/config/payments.js';
import {
  MOMO_REQUEST_KEYS,
  MOMO_RESULT_KEYS,
  buildMomoIpn,
  buildMomoMockUrl,
  buildMomoReturnUrl,
  fakeTransactionNo,
  momoRawString,
  pickMomoParams,
  signMomo,
  verifyMomo,
} from '../src/modules/payments/momo.js';
import { buildVnpayCallback } from '../src/modules/payments/mockGateway.js';
import {
  isVnpaySuccess,
  signVnpay,
  verifyVnpay,
  vnpayQueryString,
} from '../src/modules/payments/vnpay.js';

// Giá trị test tự đặt, KHÔNG phải secret thật.
const SECRET = 'test-mock-secret-0123456789';
const CFG: MomoMockConfig = {
  partnerCode: 'TESTPARTNER',
  secret: SECRET,
  paymentUrl: 'http://localhost:3000/cong-thanh-toan-gia-lap/momo',
  returnUrl: 'http://localhost:3000/thanh-toan/ket-qua?provider=momo',
};
const NOW = new Date('2026-11-22T03:04:05.000Z');

describe('MoMo giả: chữ ký', () => {
  it('chuỗi raw sắp khóa tăng dần, không mã hóa URL, bỏ signature', () => {
    expect(momoRawString({ b: '2', a: 'x y&z', signature: 'zzz' })).toBe('a=x y&z&b=2');
  });

  it('HMAC-SHA256 hex 64 ký tự, xác định, đổi khi đổi giá trị hoặc khóa', () => {
    const p = { orderId: 'p1', amount: '1000' };
    const s = signMomo(p, SECRET);
    expect(s).toMatch(/^[0-9a-f]{64}$/);
    expect(signMomo(p, SECRET)).toBe(s);
    expect(signMomo({ ...p, amount: '1001' }, SECRET)).not.toBe(s);
    expect(signMomo(p, `${SECRET}x`)).not.toBe(s);
  });

  it('verifyMomo: đúng, sai chữ ký, thiếu chữ ký, khác độ dài, hoa/thường', () => {
    const p = { orderId: 'p1', amount: '1000' };
    const signature = signMomo(p, SECRET);
    expect(verifyMomo({ ...p, signature }, SECRET)).toBe(true);
    expect(verifyMomo({ ...p, signature: signature.toUpperCase() }, SECRET)).toBe(true);
    expect(verifyMomo({ ...p, signature: 'a'.repeat(64) }, SECRET)).toBe(false);
    expect(verifyMomo({ ...p, signature: 'abc' }, SECRET)).toBe(false);
    expect(verifyMomo(p, SECRET)).toBe(false);
    expect(verifyMomo({ ...p, amount: '1', signature }, SECRET)).toBe(false);
  });

  it('pickMomoParams: chỉ giữ khóa cho phép; giá trị không phải chuỗi -> null', () => {
    expect(pickMomoParams({ orderId: 'a', evil: 'x' }, MOMO_RESULT_KEYS)).toEqual({ orderId: 'a' });
    expect(pickMomoParams({ orderId: ['a', 'b'] }, MOMO_RESULT_KEYS)).toBeNull();
  });
});

describe('MoMo giả: dựng URL và IPN', () => {
  const url = new URL(
    buildMomoMockUrl(
      { paymentId: 'pay1', amountVnd: 220000, orderCode: 'BB-261110-K7QP', now: NOW },
      CFG,
    ),
  );
  const request = Object.fromEntries(url.searchParams);

  it('URL trỏ tới trang cổng giả, có đủ tham số và chữ ký hợp lệ', () => {
    expect(`${url.origin}${url.pathname}`).toBe(CFG.paymentUrl);
    expect(Object.keys(request).sort()).toEqual([...MOMO_REQUEST_KEYS].sort());
    expect(request).toMatchObject({
      partnerCode: 'TESTPARTNER',
      orderId: 'pay1',
      amount: '220000',
      orderInfo: 'Thanh toan don hang BB-261110-K7QP',
      redirectUrl: CFG.returnUrl,
    });
    expect(verifyMomo(request, SECRET)).toBe(true);
  });

  it('sửa số tiền trên URL làm chữ ký sai', () => {
    expect(verifyMomo({ ...request, amount: '1' }, SECRET)).toBe(false);
  });

  it('IPN: resultCode theo lựa chọn, chữ ký hợp lệ, transId ổn định, đủ khóa', () => {
    const ok = buildMomoIpn(request, 'success', CFG, NOW);
    expect(Object.keys(ok).sort()).toEqual([...MOMO_RESULT_KEYS].sort());
    expect(ok).toMatchObject({ resultCode: '0', orderId: 'pay1', amount: '220000' });
    expect(verifyMomo(ok, SECRET)).toBe(true);
    expect(ok.transId).toBe(fakeTransactionNo('momo:pay1'));
    expect(buildMomoIpn(request, 'failed', CFG, NOW).resultCode).toBe('1001');
    const cancel = buildMomoIpn(request, 'cancel', CFG, NOW);
    expect(cancel).toMatchObject({ resultCode: '1006', transId: '0' });
    expect(verifyMomo(cancel, SECRET)).toBe(true);
  });

  it('URL kết quả mang đủ tham số đã ký và giữ query sẵn có của returnUrl', () => {
    const ipn = buildMomoIpn(request, 'success', CFG, NOW);
    const back = new URL(buildMomoReturnUrl(ipn, CFG.returnUrl));
    expect(back.pathname).toBe('/thanh-toan/ket-qua');
    expect(back.searchParams.get('provider')).toBe('momo');
    const params = pickMomoParams(Object.fromEntries(back.searchParams), MOMO_RESULT_KEYS)!;
    expect(verifyMomo(params, SECRET)).toBe(true);
  });
});

describe('fakeTransactionNo', () => {
  it('ổn định theo hạt giống, đúng số chữ số', () => {
    expect(fakeTransactionNo('a')).toBe(fakeTransactionNo('a'));
    expect(fakeTransactionNo('a')).not.toBe(fakeTransactionNo('b'));
    expect(fakeTransactionNo('a')).toMatch(/^\d{10}$/);
    expect(fakeTransactionNo('a', 8)).toMatch(/^\d{8}$/);
  });
});

describe('VNPay giả: callback tái dùng quy tắc ký của vnpay.ts', () => {
  const request = {
    vnp_Amount: '22000000',
    vnp_OrderInfo: 'Thanh toan don hang BB-261110-K7QP',
    vnp_TmnCode: 'BEANBOXDEMO',
    vnp_TxnRef: 'pay1',
  };
  const RETURN = 'http://localhost:3000/thanh-toan/ket-qua?provider=vnpay';

  it('thành công: 00/00, chữ ký verifyVnpay hợp lệ, URL kết quả mang chữ ký', () => {
    const { callback, returnUrl } = buildVnpayCallback(request, 'success', SECRET, RETURN, NOW);
    expect(callback).toMatchObject({
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TxnRef: 'pay1',
      vnp_Amount: '22000000',
      vnp_PayDate: '20261122100405', // 03:04:05Z = 10:04:05 giờ VN
    });
    expect(isVnpaySuccess(callback)).toBe(true);
    expect(verifyVnpay(callback, SECRET)).toBe(true);
    expect(verifyVnpay(callback, `${SECRET}x`)).toBe(false);
    const u = new URL(returnUrl);
    expect(u.searchParams.get('provider')).toBe('vnpay');
    const q = Object.fromEntries(u.searchParams);
    expect(verifyVnpay(q, SECRET)).toBe(true);
    expect(q.vnp_SecureHash).toBe(signVnpay(callback, SECRET));
  });

  it('thất bại và hủy: mã lỗi khác 00, vẫn ký đúng', () => {
    const failed = buildVnpayCallback(request, 'failed', SECRET, RETURN, NOW).callback;
    const cancel = buildVnpayCallback(request, 'cancel', SECRET, RETURN, NOW).callback;
    expect(failed.vnp_ResponseCode).toBe('51');
    expect(cancel.vnp_ResponseCode).toBe('24');
    for (const cb of [failed, cancel]) {
      expect(isVnpaySuccess(cb)).toBe(false);
      expect(verifyVnpay(cb, SECRET)).toBe(true);
    }
  });

  it('chuỗi ký dùng đúng vnpayQueryString (khoảng trắng mã hóa thành +)', () => {
    const { callback } = buildVnpayCallback(request, 'success', SECRET, RETURN, NOW);
    expect(vnpayQueryString(callback)).toContain(
      'vnp_OrderInfo=Thanh+toan+don+hang+BB-261110-K7QP',
    );
  });
});
