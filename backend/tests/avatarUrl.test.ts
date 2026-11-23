import { describe, expect, it } from 'vitest';
import { isAllowedAvatarUrl } from '../src/lib/avatarUrl.js';

const HOSTS = ['cdn.example.test', 'img.example.test'];
const ok = (v: string, hosts: readonly string[] = HOSTS) => isAllowedAvatarUrl(v, hosts);

describe('isAllowedAvatarUrl (D-081)', () => {
  it('nhận đường dẫn /uploads hợp lệ (kể cả khi allowlist rỗng)', () => {
    for (const v of [
      '/uploads/a.png',
      '/uploads/0123456789abcdef0123456789abcdef.webp',
      '/uploads/seed/avatar-1.svg',
      '/uploads/avatars/my_pic-2.jpg',
    ]) {
      expect(ok(v, []), v).toBe(true);
    }
  });

  it('từ chối đường dẫn tương đối sai', () => {
    for (const v of [
      '/uploads',
      '/uploads/',
      '/uploads//a.png',
      '//uploads/a.png',
      '//evil.test/a.png',
      '/uploads/../secret.png',
      '/uploads/a/../b.png',
      '/uploads/./a.png',
      '/uploads/a..b.png',
      '/uploads/a.png?x=1',
      '/uploads/a.png#h',
      '/uploads/a b.png',
      '/uploads/a\\b.png',
      '/uploads/%2e%2e/a.png',
      '/other/a.png',
      'uploads/a.png',
      '/uploads/a.png\n',
      '/uploads/.hidden',
      '',
    ]) {
      expect(ok(v), JSON.stringify(v)).toBe(false);
    }
  });

  it('nhận https có host trong allowlist (không phân biệt hoa thường)', () => {
    expect(ok('https://cdn.example.test/a.png')).toBe(true);
    expect(ok('https://IMG.Example.test/x/y.webp?v=2')).toBe(true);
  });

  it('từ chối https sai host, host con/giống tên, allowlist rỗng', () => {
    expect(ok('https://other.example.test/a.png')).toBe(false);
    expect(ok('https://cdn.example.test.evil.test/a.png')).toBe(false);
    expect(ok('https://evil.test/cdn.example.test')).toBe(false);
    expect(ok('https://x.cdn.example.test/a.png')).toBe(false);
    expect(ok('https://cdn.example.test/a.png', [])).toBe(false);
  });

  it('từ chối scheme và dạng URL nguy hiểm', () => {
    for (const v of [
      'http://cdn.example.test/a.png',
      'HTTP://cdn.example.test/a.png',
      'data:image/png;base64,AAAA',
      'javascript:alert(1)',
      'ftp://cdn.example.test/a.png',
      'file:///etc/passwd',
      'https://user:pw@cdn.example.test/a.png',
      'https://cdn.example.test:8443/a.png',
      'https://cdn.example.test/a.png#frag',
      'https://cdn.example.test/a b.png',
      'https://cdn.example.test\\@evil.test/a.png',
      'https:cdn.example.test/a.png',
      'https://',
      'abc',
    ]) {
      expect(ok(v), v).toBe(false);
    }
  });

  it('từ chối chuỗi quá dài', () => {
    expect(ok(`/uploads/${'a'.repeat(500)}`)).toBe(false);
    expect(ok(`https://cdn.example.test/${'a'.repeat(500)}`)).toBe(false);
  });
});
