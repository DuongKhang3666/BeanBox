import { describe, expect, it } from 'vitest';
import {
  CSV_BOM,
  csvCell,
  kebab,
  neutralizeFormula,
  quoteField,
  safeCsvFilename,
  toCsv,
} from '../src/lib/csv.js';

describe('csv - chống CSV injection (ô chuỗi)', () => {
  it.each(['=', '+', '-', '@', '\t', '\r'])('ký tự đầu %j được thêm tiền tố nháy đơn', (c) => {
    expect(neutralizeFormula(`${c}1+1`)).toBe(`'${c}1+1`);
  });

  it('các payload điển hình bị vô hiệu', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-1+1')).toBe("'-1+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\t=1')).toBe("'\t=1");
    // CR ở đầu: có tiền tố rồi mới bọc ngoặc vì chứa CR.
    expect(csvCell('\r=1')).toBe(`"'\r=1"`);
  });

  it('chỉ xét ký tự đầu, không trim: khoảng trắng đầu giữ nguyên, ký tự nguy hiểm ở giữa không đổi', () => {
    expect(csvCell(' =1')).toBe(' =1');
    expect(csvCell('a=1')).toBe('a=1');
    expect(csvCell('Cà phê - rang xay')).toBe('Cà phê - rang xay');
  });

  it('chuỗi thường và tiếng Việt giữ nguyên', () => {
    expect(csvCell('Phin nhôm số 1')).toBe('Phin nhôm số 1');
    expect(csvCell('Cà phê Đắk Lắk')).toBe('Cà phê Đắk Lắk');
  });

  it('chuỗi rỗng là ô trống', () => {
    expect(csvCell('')).toBe('');
  });
});

describe('csv - ô số', () => {
  it('số ghi thẳng, số âm vẫn là số (không tiền tố)', () => {
    expect(csvCell(1480000)).toBe('1480000');
    expect(csvCell(-12.5)).toBe('-12.5');
    expect(csvCell(16.7)).toBe('16.7');
    expect(csvCell(0)).toBe('0');
  });
  it('không hữu hạn -> ô trống', () => {
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(Number.POSITIVE_INFINITY)).toBe('');
  });
  it('null/undefined -> ô trống', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('csv - RFC 4180', () => {
  it('bọc ngoặc khi có dấu phẩy, ngoặc kép, CR, LF; nhân đôi ngoặc kép', () => {
    expect(quoteField('a,b')).toBe('"a,b"');
    expect(quoteField('a"b')).toBe('"a""b"');
    expect(quoteField('a\nb')).toBe('"a\nb"');
    expect(quoteField('a\rb')).toBe('"a\rb"');
    expect(quoteField('abc')).toBe('abc');
  });

  it('toCsv: BOM đầu, dấu phẩy, CRLF, CRLF cuối', () => {
    const out = toCsv([
      ['Tên', 'Số'],
      ['A, "B"', 5],
      ['Đơn\nhai', null],
    ]);
    expect(out.startsWith(CSV_BOM)).toBe(true);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out).toBe('﻿Tên,Số\r\n"A, ""B""",5\r\n"Đơn\nhai",\r\n');
    // Không có LF trần ngoài nội dung trong ngoặc: mọi kết thúc dòng là CRLF.
    expect(out.replace(/"[^"]*"/g, '').match(/(?<!\r)\n/g)).toBeNull();
  });

  it('toCsv rỗng chỉ có BOM', () => {
    expect(toCsv([])).toBe('﻿');
  });

  it('số âm trong hàng giữ nguyên, chuỗi "-12.5" bị vô hiệu', () => {
    expect(toCsv([[-12.5, '-12.5']])).toBe("﻿-12.5,'-12.5\r\n");
  });
});

describe('csv - tên file an toàn', () => {
  it('dựng từ enum và ngày', () => {
    expect(safeCsvFilename({ report: 'top-products', dates: '2034-03-10_2034-03-15' })).toBe(
      'beanbox-top-products-2034-03-10_2034-03-15.csv',
    );
    expect(
      safeCsvFilename({
        report: 'breakdown',
        qualifier: 'paymentMethod',
        dates: '2034-03-10_2034-03-15',
      }),
    ).toBe('beanbox-breakdown-payment-method-2034-03-10_2034-03-15.csv');
    expect(
      safeCsvFilename({ report: 'inventory', qualifier: 'outOfStock', dates: '2034-03-15' }),
    ).toBe('beanbox-inventory-out-of-stock-2034-03-15.csv');
  });

  it('kebab', () => {
    expect(kebab('slowMovers')).toBe('slow-movers');
  });

  it('giá trị không an toàn bị từ chối (không bao giờ chạm tới header)', () => {
    expect(() => safeCsvFilename({ report: 'x"; y=1', dates: '2034-03-10' })).toThrow();
    expect(() => safeCsvFilename({ report: 'a', dates: '../../etc' })).toThrow();
    expect(() => safeCsvFilename({ report: 'a b', dates: '2034-03-10' })).toThrow();
    expect(() => safeCsvFilename({ report: 'a\r\nSet-Cookie: x', dates: '2034-03-10' })).toThrow();
  });
});
