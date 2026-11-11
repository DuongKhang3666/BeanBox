import { describe, expect, it } from 'vitest';
import { deepEqual, diffFields } from '../src/lib/audit.js';

describe('diffFields', () => {
  it('không đổi -> null', () => {
    expect(diffFields({ a: 1, b: 'x' }, { a: 1, b: 'x' }, ['a', 'b'])).toBeNull();
  });

  it('chỉ trả trường đổi và nằm trong keys', () => {
    expect(diffFields({ a: 1, b: 2, c: 3 }, { a: 1, b: 5, c: 9 }, ['a', 'b'])).toEqual({
      b: [2, 5],
    });
  });

  it('Date: cùng thời điểm là không đổi; khác -> ISO string', () => {
    const d1 = new Date('2026-11-10T08:30:00.000Z');
    expect(diffFields({ at: d1 }, { at: new Date(d1.getTime()) }, ['at'])).toBeNull();
    expect(diffFields({ at: d1 }, { at: new Date('2026-11-11T00:00:00.000Z') }, ['at'])).toEqual({
      at: ['2026-11-10T08:30:00.000Z', '2026-11-11T00:00:00.000Z'],
    });
  });

  it('mảng: so theo thứ tự', () => {
    expect(diffFields({ t: ['a', 'b'] }, { t: ['a', 'b'] }, ['t'])).toBeNull();
    expect(diffFields({ t: ['a', 'b'] }, { t: ['b', 'a'] }, ['t'])).toEqual({
      t: [
        ['a', 'b'],
        ['b', 'a'],
      ],
    });
    expect(diffFields({ t: ['a'] }, { t: ['a', 'b'] }, ['t'])).not.toBeNull();
  });

  it('object: bỏ qua thứ tự khóa; khác giá trị -> có diff', () => {
    expect(diffFields({ o: { x: 1, y: 2 } }, { o: { y: 2, x: 1 } }, ['o'])).toBeNull();
    expect(diffFields({ o: { x: 1 } }, { o: { x: 2 } }, ['o'])).toEqual({
      o: [{ x: 1 }, { x: 2 }],
    });
  });

  it('undefined được coi là null khi lưu; undefined -> giá trị là có diff', () => {
    expect(diffFields({}, { a: 'v' }, ['a'])).toEqual({ a: [null, 'v'] });
    expect(diffFields({ a: 'v' }, {}, ['a'])).toEqual({ a: ['v', null] });
    expect(diffFields({ a: undefined }, { a: undefined }, ['a'])).toBeNull();
    expect(JSON.stringify(diffFields({ a: undefined }, { a: 1 }, ['a']))).toBe('{"a":[null,1]}');
  });

  it('Date lồng trong object/mảng cũng thành ISO', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(diffFields({ v: null }, { v: { when: [d] } }, ['v'])).toEqual({
      v: [null, { when: ['2026-01-01T00:00:00.000Z'] }],
    });
  });
});

describe('deepEqual', () => {
  it('phân biệt null, undefined-trong-object, kiểu', () => {
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual({ a: undefined }, {})).toBe(true);
    expect(deepEqual(1, '1')).toBe(false);
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual(new Date(0), 0)).toBe(false);
  });
});
