import { createRequire } from 'node:module';
import pino from 'pino';
import { env } from '../config/env.js';

/** pino-pretty là devDependency: image runtime (chỉ dependency production) không có, nên kiểm trước khi bật (D-066). */
function hasPinoPretty(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

export const logger = pino({
  level: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[REDACTED]',
  },
  ...(env.NODE_ENV === 'development' && hasPinoPretty()
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});
