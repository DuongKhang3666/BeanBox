import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  BACKUP_CODE_ALPHABET,
  generateBackupCode,
  generateBackupCodes,
  hashBackupCode,
  normalizeBackupCode,
} from '../src/lib/backupCodes.js';
import { decryptSecret, encryptSecret } from '../src/lib/secretBox.js';
import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  generateTotpSecret,
  hotp,
  stepAt,
  totpAt,
  verifyTotp,
} from '../src/lib/totp.js';

/** D-063: TOTP (RFC 6238), HOTP (RFC 4226), base32 (RFC 4648), AES-256-GCM, mã dự phòng. Không dùng giờ thật. */

// RFC 6238 Phụ lục B: secret ASCII "12345678901234567890" (SHA-1).
const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');

describe('HOTP (RFC 4226 Phụ lục D)', () => {
  const expected = [
    '755224',
    '287082',
    '359152',
    '969429',
    '338314',
    '254676',
    '287922',
    '162583',
    '399871',
    '520489',
  ];
  it.each(expected.map((v, i) => [i, v] as const))('counter %i -> %s', (counter, value) => {
    expect(hotp(RFC_SECRET, counter)).toBe(value);
  });
});

describe('TOTP (RFC 6238 Phụ lục B, SHA-1)', () => {
  // RFC liệt kê mã 8 chữ số; mã 6 chữ số của ta = 6 chữ số CUỐI của mã 8 chữ số
  // (cùng giá trị truncation, chỉ khác `mod 10^digits`).
  const vectors: Array<[number, string, string]> = [
    [59, '94287082', '287082'],
    [1111111109, '07081804', '081804'],
    [1111111111, '14050471', '050471'],
    [1234567890, '89005924', '005924'],
    [2000000000, '69279037', '279037'],
    [20000000000, '65353130', '353130'],
  ];
  it.each(vectors)('t=%i: 8 số %s, 6 số %s', (seconds, eight, six) => {
    expect(totpAt(RFC_SECRET, seconds * 1000, 8)).toBe(eight);
    expect(totpAt(RFC_SECRET, seconds * 1000)).toBe(six);
    expect(eight.slice(-6)).toBe(six);
  });

  it('stepAt: bước 30 giây, biên chính xác', () => {
    expect(stepAt(0)).toBe(0);
    expect(stepAt(29_999)).toBe(0);
    expect(stepAt(30_000)).toBe(1);
    expect(stepAt(59_000)).toBe(1);
  });
});

describe('verifyTotp', () => {
  const NOW = 1_234_567_890_000; // thời điểm cố định (ms)
  const step = stepAt(NOW);
  const at = (s: number) => hotp(RFC_SECRET, s);

  it('khớp bước hiện tại và +-1; ngoài cửa sổ thì không', () => {
    expect(verifyTotp(RFC_SECRET, at(step), NOW)).toBe(step);
    expect(verifyTotp(RFC_SECRET, at(step - 1), NOW)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, at(step + 1), NOW)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, at(step - 2), NOW)).toBeNull();
    expect(verifyTotp(RFC_SECRET, at(step + 2), NOW)).toBeNull();
  });

  it('chống dùng lại: chỉ nhận bước > lastStep', () => {
    expect(verifyTotp(RFC_SECRET, at(step), NOW, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, at(step - 1), NOW, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, at(step + 1), NOW, step)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, at(step), NOW, step - 1)).toBe(step);
    expect(verifyTotp(RFC_SECRET, at(step), NOW, null)).toBe(step);
  });

  it('từ chối định dạng sai (độ dài, chữ cái, rỗng) và mã sai', () => {
    const good = at(step);
    expect(verifyTotp(RFC_SECRET, '', NOW)).toBeNull();
    expect(verifyTotp(RFC_SECRET, good.slice(0, 5), NOW)).toBeNull();
    expect(verifyTotp(RFC_SECRET, `${good}0`, NOW)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', NOW)).toBeNull();
    expect(verifyTotp(RFC_SECRET, ' 12345', NOW)).toBeNull();
    const wrong = [at(step - 1), at(step), at(step + 1)].includes('000000') ? '111111' : '000000';
    expect(verifyTotp(RFC_SECRET, wrong, NOW)).toBeNull();
  });

  it('secret khác cho mã khác (không khớp chéo)', () => {
    const other = Buffer.from('ABCDEFGHIJKLMNOPQRST', 'ascii');
    const c = hotp(other, step);
    if (c !== at(step)) expect(verifyTotp(RFC_SECRET, c, NOW)).toBeNull();
  });

  it('không nhận bước âm gần epoch', () => {
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, 0), 0)).toBe(0);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, 1), 0)).toBe(1);
  });
});

describe('base32 (RFC 4648 §10, bỏ padding)', () => {
  const vectors: Array<[string, string]> = [
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ];
  it.each(vectors)('"%s" <-> %s', (plain, encoded) => {
    expect(base32Encode(Buffer.from(plain, 'ascii'))).toBe(encoded);
    expect(base32Decode(encoded).toString('ascii')).toBe(plain);
  });

  it('decode: bỏ padding, khoảng trắng, gạch ngang; không phân biệt hoa thường; ký tự lạ -> lỗi', () => {
    expect(base32Decode('MZXW6YQ=').toString()).toBe('foob');
    expect(base32Decode('mzxw 6ytb-oi').toString()).toBe('foobar');
    expect(() => base32Decode('MZXW1')).toThrow();
    expect(() => base32Decode('MZXW!')).toThrow();
  });

  it('roundtrip ngẫu nhiên và secret 20 byte -> 32 ký tự', () => {
    for (let i = 0; i < 50; i++) {
      const b = randomBytes(1 + (i % 33));
      expect(base32Decode(base32Encode(b)).equals(b)).toBe(true);
    }
    const s = generateTotpSecret();
    expect(s).toHaveLength(20);
    expect(base32Encode(s)).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('secret của RFC 6238 ở dạng base32 là GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', () => {
    expect(base32Encode(RFC_SECRET)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });
});

describe('otpauth URI', () => {
  it('có issuer, label mã hóa, tham số cố định', () => {
    expect(
      buildOtpauthUri({ secretBase32: 'ABCDEF234567', issuer: 'BeanBox', account: 'an+x@ex.test' }),
    ).toBe(
      'otpauth://totp/BeanBox:an%2Bx%40ex.test?secret=ABCDEF234567&issuer=BeanBox&algorithm=SHA1&digits=6&period=30',
    );
  });
});

describe('AES-256-GCM (secretBox)', () => {
  const key = Buffer.alloc(32, 9);
  const plain = Buffer.from('12345678901234567890');

  it('mã hóa/giải mã khứ hồi; định dạng v1:<iv>:<tag>:<ct> base64url; IV ngẫu nhiên', () => {
    const a = encryptSecret(plain, key, 'user-1');
    const b = encryptSecret(plain, key, 'user-1');
    expect(a).not.toBe(b);
    const parts = a.split(':');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v1');
    for (const p of parts.slice(1)) expect(p).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(parts[1]!, 'base64url')).toHaveLength(12);
    expect(Buffer.from(parts[2]!, 'base64url')).toHaveLength(16);
    expect(a).not.toContain(plain.toString('base64url'));
    expect(decryptSecret(a, key, 'user-1').equals(plain)).toBe(true);
  });

  it('sai khóa, sai AAD, ciphertext/tag/IV bị sửa, sai version/định dạng -> lỗi', () => {
    const enc = encryptSecret(plain, key, 'user-1');
    expect(() => decryptSecret(enc, Buffer.alloc(32, 8), 'user-1')).toThrow();
    expect(() => decryptSecret(enc, key, 'user-2')).toThrow();
    expect(() => decryptSecret(enc, key)).toThrow();

    const [v, iv, tag, ct] = enc.split(':') as [string, string, string, string];
    const flip = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    expect(() => decryptSecret([v, iv, tag, flip(ct)].join(':'), key, 'user-1')).toThrow();
    expect(() => decryptSecret([v, iv, flip(tag), ct].join(':'), key, 'user-1')).toThrow();
    expect(() => decryptSecret([v, flip(iv), tag, ct].join(':'), key, 'user-1')).toThrow();
    expect(() => decryptSecret(['v2', iv, tag, ct].join(':'), key, 'user-1')).toThrow();
    expect(() => decryptSecret('v1:abc', key)).toThrow();
    expect(() => decryptSecret('', key)).toThrow();
    expect(() => decryptSecret([v, 'AAAA', tag, ct].join(':'), key, 'user-1')).toThrow();
  });

  it('khóa không đủ 32 byte -> lỗi', () => {
    expect(() => encryptSecret(plain, Buffer.alloc(16))).toThrow();
    expect(() => decryptSecret('v1:a:b:c', Buffer.alloc(16))).toThrow();
  });
});

describe('mã dự phòng', () => {
  it('định dạng XXXXX-XXXXX, bảng chữ cái không nhầm (không I, L, O, 0, 1)', () => {
    expect(BACKUP_CODE_ALPHABET).not.toMatch(/[ILO01]/);
    expect(BACKUP_CODE_ALPHABET).toHaveLength(31);
    for (let i = 0; i < 200; i++) {
      expect(generateBackupCode()).toMatch(/^[A-HJ-KM-NP-Z2-9]{5}-[A-HJ-KM-NP-Z2-9]{5}$/);
    }
  });

  it('sinh 10 mã khác nhau mặc định', () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
  });

  it('chuẩn hóa: bỏ gạch/khoảng trắng, viết hoa; sai độ dài/ký tự -> null', () => {
    expect(normalizeBackupCode('abcde-fghjk')).toBe('ABCDEFGHJK');
    expect(normalizeBackupCode(' ABCDE FGHJK ')).toBe('ABCDEFGHJK');
    expect(normalizeBackupCode('ABCDE-FGHJ')).toBeNull();
    expect(normalizeBackupCode('ABCDE-FGHJKM')).toBeNull();
    expect(normalizeBackupCode('ABCDE-FGHJ0')).toBeNull();
    expect(normalizeBackupCode('ABCDE-FGHJI')).toBeNull();
    expect(normalizeBackupCode('')).toBeNull();
  });

  it('băm SHA-256 hex cố định trên mã đã chuẩn hóa', () => {
    expect(hashBackupCode('ABCDEFGHJK')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashBackupCode('ABCDEFGHJK')).toBe(hashBackupCode(normalizeBackupCode('abcde-fghjk')!));
    expect(hashBackupCode('ABCDEFGHJK')).not.toBe(hashBackupCode('ABCDEFGHJM'));
  });
});
