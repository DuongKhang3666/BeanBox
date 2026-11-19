import { Router, type Request, type RequestHandler, type Response } from 'express';
import { logger } from '../../lib/logger.js';
import { cleanCspPayload, type CleanCspReport } from './csp.sanitize.js';

export const CSP_MAX_BYTES = 10 * 1024;
const ACCEPTED = new Set([
  'application/csp-report',
  'application/reports+json',
  'application/json',
]);

function acceptedType(header: string | undefined): boolean {
  if (!header) return false;
  const base = header.split(';')[0]?.trim().toLowerCase() ?? '';
  return ACCEPTED.has(base);
}

/**
 * Đọc body thô có giới hạn, tự xử lý mọi lỗi: luôn kết thúc bằng 204 (không để 413/400 của
 * body-parser lọt ra errorHandler). Phải mount TRƯỚC express.json() toàn cục.
 */
function cspReportHandler(req: Request, res: Response): void {
  let done = false;
  const finish = (reports: CleanCspReport[] = []) => {
    if (done) return;
    done = true;
    try {
      for (const csp of reports) logger.warn({ csp }, 'CSP violation (report-only)');
    } catch {
      // không để lỗi log làm hỏng phản hồi
    }
    res.status(204).end();
  };

  const declared = Number(req.headers['content-length']);
  if (
    !acceptedType(req.headers['content-type']) ||
    (Number.isFinite(declared) && declared > CSP_MAX_BYTES)
  ) {
    req.resume();
    finish();
    return;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  let overflow = false;
  req.on('data', (chunk: Buffer) => {
    if (overflow) return;
    size += chunk.length;
    if (size > CSP_MAX_BYTES) {
      overflow = true;
      chunks.length = 0;
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (overflow) return finish();
    try {
      finish(cleanCspPayload(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
    } catch {
      finish();
    }
  });
  req.on('error', () => finish());
}

export interface CspRouterOptions {
  /** 20 request/phút/IP, store riêng, đứng trước mọi xử lý body (§14.12). */
  limiter: RequestHandler;
}

export function createCspRouter({ limiter }: CspRouterOptions): Router {
  const router = Router();
  router.post('/csp-report', limiter, cspReportHandler);
  return router;
}
