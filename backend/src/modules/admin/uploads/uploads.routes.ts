import express, { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import { asyncHandler } from '../../../lib/asyncHandler.js';
import { AppError } from '../../../lib/errors.js';
import {
  invalidFile,
  isUploadType,
  matchesMagic,
  MAX_UPLOAD_BYTES,
  saveUpload,
  UPLOAD_TYPES,
} from './uploads.service.js';

export interface UploadsRouterOptions {
  /** 30/phút/IP (store riêng); đã đứng SAU requireAuth/requireStaff của admin router. */
  uploadLimiter: RequestHandler;
  /** Thư mục gốc lưu file (backend/uploads, hoặc thư mục tạm trong test). */
  uploadsDir: string;
}

/** Body quá giới hạn của route này -> 413 PAYLOAD_TOO_LARGE (không đụng errorHandler toàn cục). */
const tooLarge: ErrorRequestHandler = (err, _req, _res, next) => {
  if ((err as { type?: string }).type === 'entity.too.large') {
    next(new AppError(413, 'PAYLOAD_TOO_LARGE', 'Ảnh vượt quá dung lượng tối đa 5 MB'));
    return;
  }
  next(err);
};

/** `POST /admin/uploads` (api-contract §12.4). Mount tại `/uploads`. */
export function createUploadsRouter({ uploadLimiter, uploadsDir }: UploadsRouterOptions): Router {
  const router = Router();
  router.use(uploadLimiter);

  router.post(
    '/',
    express.raw({ type: [...UPLOAD_TYPES], limit: MAX_UPLOAD_BYTES }),
    tooLarge,
    asyncHandler(async (req, res) => {
      const contentType = req.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
      const body: unknown = req.body;
      // Content-Type lạ -> express.raw bỏ qua, body không phải Buffer.
      if (!isUploadType(contentType) || !Buffer.isBuffer(body) || body.length === 0) {
        throw invalidFile();
      }
      if (!matchesMagic(body, contentType)) throw invalidFile();

      const data = await saveUpload({
        buffer: body,
        contentType,
        uploadsDir,
        actorId: req.auth!.userId,
        ip: req.ip ?? null,
      });
      res.status(201).json({ data });
    }),
  );
  return router;
}
