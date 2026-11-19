import { describe, expect, it, vi } from 'vitest';
import { createTurnstileVerifier, TURNSTILE_VERIFY_URL } from '../src/lib/turnstile.js';

const SECRET = 'fake-secret-for-test';
const TOKEN = 'fake-token-for-test';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function verifierWith(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  return {
    fetchMock,
    verify: createTurnstileVerifier(SECRET, fetchMock as unknown as typeof fetch),
  };
}

describe('createTurnstileVerifier', () => {
  it('success true -> valid; gửi form secret+response, không có remoteip, có timeout', async () => {
    const { fetchMock, verify } = verifierWith(async () => json({ success: true }));
    expect(await verify(TOKEN)).toBe('valid');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    expect(init.method).toBe('POST');
    const params = new URLSearchParams(String(init.body));
    expect(params.get('secret')).toBe(SECRET);
    expect(params.get('response')).toBe(TOKEN);
    expect(params.has('remoteip')).toBe(false);
    expect([...params.keys()].sort()).toEqual(['response', 'secret']);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('success false -> invalid', async () => {
    const { verify } = verifierWith(async () =>
      json({ success: false, 'error-codes': ['invalid-input-response'] }),
    );
    expect(await verify(TOKEN)).toBe('invalid');
  });

  it('success không phải boolean true (chuỗi "true") -> invalid', async () => {
    const { verify } = verifierWith(async () => json({ success: 'true' }));
    expect(await verify(TOKEN)).toBe('invalid');
  });

  it('HTTP 500 -> unavailable', async () => {
    const { verify } = verifierWith(async () => json({ success: true }, 500));
    expect(await verify(TOKEN)).toBe('unavailable');
  });

  it('JSON sai -> unavailable', async () => {
    const { verify } = verifierWith(async () => new Response('<html>not json', { status: 200 }));
    expect(await verify(TOKEN)).toBe('unavailable');
  });

  it('JSON không phải object -> unavailable', async () => {
    const { verify } = verifierWith(async () => json(['x']));
    expect(await verify(TOKEN)).toBe('unavailable');
  });

  it('lỗi mạng -> unavailable', async () => {
    const { verify } = verifierWith(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await verify(TOKEN)).toBe('unavailable');
  });

  it('timeout (TimeoutError) -> unavailable', async () => {
    const { verify } = verifierWith(async () => {
      throw new DOMException('The operation timed out', 'TimeoutError');
    });
    expect(await verify(TOKEN)).toBe('unavailable');
  });
});
