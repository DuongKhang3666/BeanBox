import { describe, expect, it } from 'vitest';
import { escapeLike, normalizeSearch, tokenize } from '../src/lib/text.js';

describe('normalizeSearch', () => {
  it('bỏ dấu, lowercase, đ -> d', () => {
    expect(normalizeSearch('Cà phê Đà Lạt')).toBe('ca phe da lat');
    expect(normalizeSearch('ĐẬM ĐÀ')).toBe('dam da');
  });

  it('gộp khoảng trắng và trim', () => {
    expect(normalizeSearch('  Robusta \t  Buôn\n Ma   Thuột  ')).toBe('robusta buon ma thuot');
  });

  it('chuỗi rỗng và chỉ khoảng trắng', () => {
    expect(normalizeSearch('')).toBe('');
    expect(normalizeSearch('   ')).toBe('');
  });

  it('xử lý cả chuỗi dựng sẵn (NFC) lẫn tổ hợp (NFD)', () => {
    const nfd = 'Cà phê'.normalize('NFD');
    expect(normalizeSearch(nfd)).toBe('ca phe');
    expect(normalizeSearch('Cà phê'.normalize('NFC'))).toBe('ca phe');
  });

  it('giữ nguyên chữ số và ký tự thường gặp', () => {
    expect(normalizeSearch('V60 02 (100 tờ)')).toBe('v60 02 (100 to)');
  });
});

describe('tokenize', () => {
  it('tách token đã chuẩn hóa, bỏ token rỗng', () => {
    expect(tokenize('  Cà   phê  Đà Lạt ')).toEqual(['ca', 'phe', 'da', 'lat']);
  });

  it('rỗng -> mảng rỗng', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('escapeLike', () => {
  const bs = String.fromCharCode(92); // dấu gạch chéo ngược

  it('escape %, _ và dấu gạch chéo ngược', () => {
    expect(escapeLike('100%_a')).toBe(`100${bs}%${bs}_a`);
    expect(escapeLike(`a${bs}b`)).toBe(`a${bs}${bs}b`);
  });

  it('chuỗi thường giữ nguyên', () => {
    expect(escapeLike('ca phe')).toBe('ca phe');
  });
});
