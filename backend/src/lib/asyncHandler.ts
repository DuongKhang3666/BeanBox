import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Express 4 không bắt lỗi từ handler async; bọc lại để chuyển lỗi vào errorHandler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
