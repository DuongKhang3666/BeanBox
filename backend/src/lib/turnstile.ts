import { env } from '../config/env.js';
import { AppError } from './errors.js';
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

/**
 * Xác minh token Turnstile cho form/endpoint dùng captcha tùy chọn (contact D-028, đặt đơn D-057).
 * Thiếu/sai -> 400 `CAPTCHA_FAILED`; Cloudflare không gọi được -> 503 `SERVICE_UNAVAILABLE`.
 */
export async function assertCaptcha(
  verify: TurnstileVerifier,
  rawToken: string | undefined,
): Promise<void> {
  const token = (rawToken ?? '').trim();
  const failed = () =>
    new AppError(400, 'CAPTCHA_FAILED', 'Xác minh captcha không thành công, vui lòng thử lại');
  if (token === '') throw failed();
  const result = await verify(token);
  if (result === 'invalid') throw failed();
  if (result === 'unavailable') {
    throw new AppError(
      503,
      'SERVICE_UNAVAILABLE',
      'Không thể xác minh captcha lúc này, vui lòng thử lại sau',
    );
  }
}
