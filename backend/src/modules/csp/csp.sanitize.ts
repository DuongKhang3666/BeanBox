/** Làm sạch báo cáo CSP (§14.12): chỉ giữ các trường không chứa dữ liệu cá nhân. */

export interface CleanCspReport {
  effectiveDirective?: string;
  blockedUri?: string;
  documentPath?: string;
  disposition?: 'enforce' | 'report';
}

const KEEP_BLOCKED = new Set([
  'inline',
  'eval',
  'data',
  'blob',
  'self',
  'wasm-eval',
  'trusted-types-policy',
  'trusted-types-sink',
]);
const WEB_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function sanitizeDirective(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  // Có thể là cả chuỗi chính sách ("script-src-elem 'self'"): chỉ lấy token đầu.
  const first = v.trim().split(/\s+/)[0] ?? '';
  return first.length > 0 && first.length <= 100 && /^[a-z-]+$/.test(first) ? first : undefined;
}

export function sanitizeBlockedUri(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (s === '') return undefined;
  if (KEEP_BLOCKED.has(s)) return s;
  try {
    const u = new URL(s);
    if (WEB_PROTOCOLS.has(u.protocol)) return u.origin;
    return u.protocol; // đã gồm dấu ':'
  } catch {
    const m = /^([a-zA-Z][a-zA-Z0-9+.-]{0,30}):/.exec(s);
    return m ? `${(m[1] as string).toLowerCase()}:` : '(other)';
  }
}

export function sanitizeDocumentPath(v: unknown): string | undefined {
  if (typeof v !== 'string' || v === '') return undefined;
  try {
    return new URL(v).pathname.slice(0, 200);
  } catch {
    return undefined;
  }
}

function sanitizeDisposition(v: unknown): 'enforce' | 'report' | undefined {
  return v === 'enforce' || v === 'report' ? v : undefined;
}

function build(fields: {
  directive: unknown;
  blocked: unknown;
  doc: unknown;
  disposition: unknown;
}): CleanCspReport {
  const out: CleanCspReport = {};
  const d = sanitizeDirective(fields.directive);
  if (d) out.effectiveDirective = d;
  const b = sanitizeBlockedUri(fields.blocked);
  if (b) out.blockedUri = b;
  const p = sanitizeDocumentPath(fields.doc);
  if (p) out.documentPath = p;
  const disp = sanitizeDisposition(fields.disposition);
  if (disp) out.disposition = disp;
  return out;
}

/** Định dạng `application/csp-report`: { "csp-report": {...} }. */
export function cleanLegacyReport(payload: unknown): CleanCspReport[] {
  if (!isRecord(payload)) return [];
  const r = payload['csp-report'];
  if (!isRecord(r)) return [];
  return [
    build({
      directive: r['effective-directive'] ?? r['violated-directive'],
      blocked: r['blocked-uri'],
      doc: r['document-uri'],
      disposition: r['disposition'],
    }),
  ];
}

/** Định dạng Reporting API: [{ type: "csp-violation", body: {...} }], tối đa 10 phần tử. */
export function cleanReportingApi(payload: unknown): CleanCspReport[] {
  if (!Array.isArray(payload)) return [];
  const out: CleanCspReport[] = [];
  for (const item of payload) {
    if (out.length >= 10) break;
    if (!isRecord(item) || item['type'] !== 'csp-violation' || !isRecord(item['body'])) continue;
    const b = item['body'];
    out.push(
      build({
        directive: b['effectiveDirective'] ?? b['violatedDirective'],
        blocked: b['blockedURL'],
        doc: b['documentURL'],
        disposition: b['disposition'],
      }),
    );
  }
  return out;
}

/** Nhận payload JSON bất kỳ, trả danh sách báo cáo đã làm sạch (rỗng nếu shape lạ). */
export function cleanCspPayload(payload: unknown): CleanCspReport[] {
  const list = Array.isArray(payload) ? cleanReportingApi(payload) : cleanLegacyReport(payload);
  return list.filter((r) => Object.keys(r).length > 0);
}
