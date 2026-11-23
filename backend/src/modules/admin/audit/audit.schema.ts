import { z } from 'zod';
import { NO_NUL } from '../../../lib/validation.js';
import { dateOnly, paginationShape, refineDateRange } from '../admin.schema.js';

const text = (label: string, max = 100) =>
  z
    .string({ error: `${label} không hợp lệ` })
    .trim()
    .max(max, `${label} tối đa ${max} ký tự`)
    .regex(NO_NUL, `${label} chứa ký tự không hợp lệ`)
    .transform((v) => (v === '' ? undefined : v))
    .optional();

/** `action`: một hoặc nhiều giá trị phân cách phẩy (cũng nhận tham số lặp), khớp chính xác. */
const actionList = z
  .preprocess(
    (v) => (Array.isArray(v) ? v.join(',') : v),
    z
      .string({ error: 'action không hợp lệ' })
      .max(1000, 'action quá dài')
      .regex(NO_NUL, 'action chứa ký tự không hợp lệ')
      .transform((s) =>
        [
          ...new Set(
            s
              .split(',')
              .map((x) => x.trim())
              .filter((x) => x.length > 0),
          ),
        ].slice(0, 50),
      )
      .transform((arr) => (arr.length > 0 ? arr : undefined)),
  )
  .optional();

export const auditLogsQuerySchema = z
  .object({
    action: actionList,
    actionPrefix: text('actionPrefix'),
    entity: text('entity'),
    entityId: text('entityId'),
    actorId: text('actorId'),
    from: dateOnly('from').optional(),
    to: dateOnly('to').optional(),
    ...paginationShape,
  })
  .superRefine(refineDateRange);
export type AuditLogsQuery = z.infer<typeof auditLogsQuerySchema>;
