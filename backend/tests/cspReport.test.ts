import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { logger } from '../src/lib/logger.js';
import {
  cleanCspPayload,
  sanitizeBlockedUri,
  sanitizeDirective,
  sanitizeDocumentPath,
} from '../src/modules/csp/csp.sanitize.js';

const URL_PATH = '/api/v1/csp-report';

describe('CSP sanitize (unit)', () => {
  it('URL có path/query chỉ giữ origin', () => {
    expect(sanitizeBlockedUri('https://evil.example.com:8443/a/b.js?token=1#x')).toBe(
      'https://evil.example.com:8443',
    );
    expect(sanitizeBlockedUri('wss://x.example/socket?id=1')).toBe('wss://x.example');
  });

  it('giữ nguyên từ khóa đặc biệt', () => {
    for (const k of ['inline', 'eval', 'data', 'blob', 'self', 'wasm-eval']) {
      expect(sanitizeBlockedUri(k)).toBe(k);
    }
  });

  it('scheme khác chỉ giữ scheme, còn lại (other)', () => {
    expect(sanitizeBlockedUri('javascript:alert(1)')).toBe('javascript:');
    expect(sanitizeBlockedUri('data:text/html;base64,AAAA')).toBe('data:');
    expect(sanitizeBlockedUri('???')).toBe('(other)');
  });

  it('document-uri chỉ giữ pathname', () => {
    const p = sanitizeDocumentPath(
      'http://localhost:3000/tra-cuu-don-hang?code=BB-1&phone=0901234567#x',
    );
    expect(p).toBe('/tra-cuu-don-hang');
    expect(p).not.toContain('0901234567');
    expect(sanitizeDocumentPath(`http://a.b/${'x'.repeat(500)}`)?.length).toBe(200);
  });

  it('directive lạ bị bỏ', () => {
    expect(sanitizeDirective('script-src-elem')).toBe('script-src-elem');
    expect(sanitizeDirective('Script_Src<>')).toBeUndefined();
    expect(sanitizeDirective('a'.repeat(101))).toBeUndefined();
    expect(sanitizeDirective(42)).toBeUndefined();
  });

  it('không để lọt script-sample/referrer/source-file', () => {
    const out = cleanCspPayload({
      'csp-report': {
        'document-uri': 'http://localhost:3000/x?phone=0901234567',
        'blocked-uri': 'inline',
        'effective-directive': 'script-src-elem',
        'script-sample': 'SECRETSAMPLE',
        referrer: 'http://r.example/?q=1',
        'source-file': 'http://localhost/app.js?k=1',
        disposition: 'report',
      },
    });
    expect(out).toEqual([
      {
        effectiveDirective: 'script-src-elem',
        blockedUri: 'inline',
        documentPath: '/x',
        disposition: 'report',
      },
    ]);
    expect(JSON.stringify(out)).not.toMatch(/SECRETSAMPLE|0901234567|source-file/);
  });

  it('Reporting API: chỉ csp-violation, tối đa 10', () => {
    const items = Array.from({ length: 15 }, () => ({
      type: 'csp-violation',
      body: { effectiveDirective: 'img-src', blockedURL: 'https://a.b/c?d=1' },
    }));
    const out = cleanCspPayload([{ type: 'deprecation', body: {} }, ...items]);
    expect(out).toHaveLength(10);
    expect(out[0]).toEqual({ effectiveDirective: 'img-src', blockedUri: 'https://a.b' });
  });
});

describe('POST /csp-report (HTTP)', () => {
  afterEach(() => vi.restoreAllMocks());
  const app = createApp({ generalRateLimit: 10_000 });

  it('application/csp-report hợp lệ -> 204, log đã làm sạch', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const res = await request(app)
      .post(URL_PATH)
      .set('Content-Type', 'application/csp-report')
      .send(
        JSON.stringify({
          'csp-report': {
            'document-uri': 'http://localhost:3000/tra-cuu-don-hang?code=BB-1&phone=0901234567',
            'blocked-uri': 'https://cdn.example.com/x.js?k=secret',
            'violated-directive': 'script-src-elem',
            'script-sample': 'SECRETSAMPLE',
            disposition: 'report',
          },
        }),
      );
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(warn).toHaveBeenCalledTimes(1);
    const [obj, msg] = warn.mock.calls[0] as unknown as [unknown, string];
    expect(msg).toBe('CSP violation (report-only)');
    expect(obj).toEqual({
      csp: {
        effectiveDirective: 'script-src-elem',
        blockedUri: 'https://cdn.example.com',
        documentPath: '/tra-cuu-don-hang',
        disposition: 'report',
      },
    });
    expect(JSON.stringify(obj)).not.toMatch(/0901234567|SECRETSAMPLE|secret|code=/);
  });

  it('application/reports+json (kèm charset, hoa thường) -> 204, mỗi báo cáo một dòng', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const res = await request(app)
      .post(URL_PATH)
      .set('Content-Type', 'Application/Reports+JSON; charset=utf-8')
      .send(
        JSON.stringify([
          { type: 'csp-violation', body: { effectiveDirective: 'img-src', blockedURL: 'inline' } },
          { type: 'csp-violation', body: { effectiveDirective: 'font-src', blockedURL: 'eval' } },
        ]),
      );
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('JSON sai -> 204, không log', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const res = await request(app)
      .post(URL_PATH)
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });

  it('text/plain -> 204, không log', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const res = await request(app)
      .post(URL_PATH)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify({ 'csp-report': { 'blocked-uri': 'inline' } }));
    expect(res.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });

  it('body 11 KB -> 204 (không 413/500), không log', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const big = JSON.stringify({
      'csp-report': { 'blocked-uri': 'inline', 'script-sample': 'x'.repeat(11 * 1024) },
    });
    const res = await request(app)
      .post(URL_PATH)
      .set('Content-Type', 'application/csp-report')
      .send(big);
    expect(res.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });

  it('rate limit riêng: request thứ 3 là 429 RATE_LIMITED', async () => {
    const limited = createApp({ generalRateLimit: 10_000, cspReportRateLimit: 2 });
    const send = () =>
      request(limited).post(URL_PATH).set('Content-Type', 'application/csp-report').send('{}');
    expect((await send()).status).toBe(204);
    expect((await send()).status).toBe(204);
    const third = await send();
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
  });

  it('GET -> 404 như route không tồn tại', async () => {
    const res = await request(app).get(URL_PATH);
    expect(res.status).toBe(404);
  });
});
