import type { Prisma } from '@prisma/client';

/** Audit log (api-contract §12.0): ghi trong CÙNG transaction với thay đổi. */

export type AuditDiff = Record<string, [unknown, unknown]>;

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  diff?: AuditDiff | null;
  ip?: string | null;
}

/** So sánh sâu: Date theo thời điểm, mảng theo thứ tự, object theo khóa (bỏ qua thứ tự khóa). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => deepEqual(v, b[i]))
    );
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object).filter(
      (k) => (a as Record<string, unknown>)[k] !== undefined,
    );
    const kb = Object.keys(b as object).filter(
      (k) => (b as Record<string, unknown>)[k] !== undefined,
    );
    return (
      ka.length === kb.length &&
      ka.every(
        (k) =>
          Object.hasOwn(b as object, k) &&
          deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
      )
    );
  }
  return false;
}

/** Date -> ISO, undefined -> null để lưu được vào cột Json. */
function toJsonValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(toJsonValue);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJsonValue(x)]));
  }
  return v;
}

/** `{ field: [old, new] }` chỉ cho trường đổi trong `keys`; null nếu không có thay đổi. */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: readonly string[],
): AuditDiff | null {
  const diff: AuditDiff = {};
  for (const key of keys) {
    const b = before[key];
    const a = after[key];
    if (!deepEqual(b, a)) diff[key] = [toJsonValue(b), toJsonValue(a)];
  }
  return Object.keys(diff).length > 0 ? diff : null;
}

export async function writeAudit(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      ...(entry.diff ? { diff: entry.diff as unknown as Prisma.InputJsonValue } : {}),
      ip: entry.ip ?? null,
    },
  });
}
