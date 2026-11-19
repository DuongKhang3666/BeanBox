import { env } from '../config/env.js';
import { logger } from './logger.js';

/** Cloudflare Turnstile (D-028, api-contract §14.11). */

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 5000;

export interface CaptchaConfig {
  /** Công khai: trả qua GET /settings/public. */
  siteKey: string;
  /** Bí mật: chỉ dùng phía server, không bao giờ trả ra ngoài. */
  secretKey: string;
}

/** valid: Cloudflare xác nhận; invalid: `success !== true`; unavailable: lỗi mạng/timeout/HTTP không 2xx/JSON sai. */
export type TurnstileResult = 'valid' | 'invalid' | 'unavailable';
export type TurnstileVerifier = (token: string) => Promise<TurnstileResult>;

/** Có đủ cả hai khóa mới bật (env đã chặn trường hợp chỉ có một). */
export function getCaptchaConfig(): CaptchaConfig | null {
  if (env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY) {
    return { siteKey: env.TURNSTILE_SITE_KEY, secretKey: env.TURNSTILE_SECRET_KEY };
  }
  return null;
}

/** Không gửi `remoteip`; chỉ log `error-codes` của Cloudflare (không log token/secret). */
export function createTurnstileVerifier(
  secret: string,
  fetchImpl: typeof fetch = fetch,
): TurnstileVerifier {
  return async (token) => {
    try {
      const res = await fetchImpl(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token }).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        logger.warn({ status: res.status }, 'Turnstile siteverify trả HTTP không thành công');
        return 'unavailable';
      }
      const json: unknown = await res.json();
      if (typeof json !== 'object' || json === null || Array.isArray(json)) {
        logger.warn('Turnstile siteverify trả JSON không hợp lệ');
        return 'unavailable';
      }
      const body = json as { success?: unknown; 'error-codes'?: unknown };
      if (body.success === true) return 'valid';
      const codes = Array.isArray(body['error-codes'])
        ? body['error-codes'].filter((c): c is string => typeof c === 'string')
        : [];
      logger.info({ errorCodes: codes }, 'Turnstile từ chối token');
      return 'invalid';
    } catch {
      logger.warn('Không gọi được Turnstile siteverify (lỗi mạng, timeout hoặc JSON sai)');
      return 'unavailable';
    }
  };
}
