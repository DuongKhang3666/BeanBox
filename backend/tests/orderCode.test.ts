import { describe, expect, it } from 'vitest';
import {
  generateOrderCode,
  normalizeOrderCode,
  ORDER_CODE_ALPHABET,
  ORDER_CODE_REGEX,
} from '../src/lib/orderCode.js';

describe('orderCode', () => {
  it('đúng định dạng và alphabet (không có 0 O 1 I L)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOrderCode();
      expect(code).toMatch(ORDER_CODE_REGEX);
      expect(code.slice(-4)).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    }
    expect(ORDER_CODE_ALPHABET).toHaveLength(31);
    expect(ORDER_CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it('ngày theo giờ VN: 2026-11-10T17:30Z -> 11/11', () => {
    expect(generateOrderCode(new Date('2026-11-10T17:30:00.000Z'))).toMatch(/^BB-261111-/);
    expect(generateOrderCode(new Date('2026-11-10T16:59:59.000Z'))).toMatch(/^BB-261110-/);
  });

  it('dùng randInt được truyền vào', () => {
    const seq = [0, 1, 2, 30];
    let i = 0;
    const code = generateOrderCode(new Date('2026-01-05T00:00:00.000Z'), () => seq[i++]!);
    expect(code).toBe('BB-260105-234Z');
  });

  it('regex từ chối sai định dạng', () => {
    expect(ORDER_CODE_REGEX.test('BB-261111-ABCO')).toBe(false);
    expect(ORDER_CODE_REGEX.test('BB-26111-ABCD')).toBe(false);
    expect(ORDER_CODE_REGEX.test('bb-261111-ABCD')).toBe(false);
  });

  it('normalizeOrderCode: trim + uppercase', () => {
    expect(normalizeOrderCode('  bb-261111-k7qp ')).toBe('BB-261111-K7QP');
  });
});
