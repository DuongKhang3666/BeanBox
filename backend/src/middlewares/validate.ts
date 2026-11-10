import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

type Source = 'body' | 'query' | 'params';

/** Validate rồi thay giá trị bằng bản đã parse (bỏ trường lạ). ZodError do errorHandler xử lý. */
export function validate(schema: ZodType, source: Source = 'body'): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.parse(req[source]);
    Object.defineProperty(req, source, { value: parsed, writable: true, configurable: true });
    next();
  };
}
