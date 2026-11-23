import { describe, expect, it } from 'vitest';
import {
  HEADERS_TIMEOUT_MS,
  KEEP_ALIVE_TIMEOUT_MS,
  tuneServerTimeouts,
} from '../src/lib/serverTimeouts.js';

describe('tuneServerTimeouts', () => {
  it('đặt keep-alive dài hơn mặc định 5 giây của Node và headersTimeout lớn hơn keep-alive', () => {
    const server = { keepAliveTimeout: 5000, headersTimeout: 60_000 };
    tuneServerTimeouts(server);
    expect(server.keepAliveTimeout).toBe(KEEP_ALIVE_TIMEOUT_MS);
    expect(server.headersTimeout).toBe(HEADERS_TIMEOUT_MS);
    expect(server.keepAliveTimeout).toBeGreaterThan(5000);
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
  });
});
