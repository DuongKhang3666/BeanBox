import { describe, expect, it } from 'vitest';
import { SLUG_REGEX, slugify } from '../src/lib/slug.js';

describe('slugify', () => {
  it('bỏ dấu tiếng Việt và đ -> d', () => {
    expect(slugify('Dụng cụ pha chế')).toBe('dung-cu-pha-che');
    expect(slugify('Đường Đen Đắk Lắk')).toBe('duong-den-dak-lak');
  });
  it('gộp và cắt dấu gạch ngang, bỏ ký tự đặc biệt', () => {
    expect(slugify('  --Phễu  V60!! (2 lỗ)  ')).toBe('pheu-v60-2-lo');
    expect(slugify('A___B')).toBe('a-b');
  });
  it('chuỗi không còn ký tự hợp lệ -> rỗng', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('😀')).toBe('');
  });
  it('tối đa 120 ký tự, không kết thúc bằng gạch ngang', () => {
    const s = slugify('ab '.repeat(100));
    expect(s.length).toBeLessThanOrEqual(120);
    expect(s.endsWith('-')).toBe(false);
    expect(SLUG_REGEX.test(s)).toBe(true);
  });
  it('SLUG_REGEX', () => {
    expect(SLUG_REGEX.test('ab-c1')).toBe(true);
    expect(SLUG_REGEX.test('-ab')).toBe(false);
    expect(SLUG_REGEX.test('a--b')).toBe(false);
    expect(SLUG_REGEX.test('Ab')).toBe(false);
  });
});
