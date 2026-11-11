import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeAudit } from '../../../lib/audit.js';
import { AppError } from '../../../lib/errors.js';
import { prisma } from '../../../lib/prisma.js';

export const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];
export const MAX_UPLOAD_BYTES = '5mb';

const EXT: Record<UploadType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const INVALID_FILE_MSG = 'Chỉ chấp nhận ảnh JPG, PNG hoặc WebP';
export const invalidFile = () =>
  new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [
    { field: 'file', message: INVALID_FILE_MSG },
  ]);

export function isUploadType(t: string | undefined): t is UploadType {
  return t !== undefined && (UPLOAD_TYPES as readonly string[]).includes(t);
}

const startsWith = (buf: Buffer, bytes: readonly number[], offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

/** Magic bytes phải khớp Content-Type khai báo. */
export function matchesMagic(buf: Buffer, type: UploadType): boolean {
  switch (type) {
    case 'image/jpeg':
      return startsWith(buf, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/webp':
      return (
        startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && // "RIFF"
        startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8) // "WEBP"
      );
  }
}

export interface SaveUploadArgs {
  buffer: Buffer;
  contentType: UploadType;
  uploadsDir: string;
  actorId: string;
  ip: string | null;
}

export interface UploadResult {
  url: string;
  contentType: UploadType;
  size: number;
}

export async function saveUpload(args: SaveUploadArgs): Promise<UploadResult> {
  const { buffer, contentType, actorId, ip } = args;
  const root = path.resolve(args.uploadsDir);
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const rel = `products/${yyyy}/${mm}/${randomBytes(16).toString('hex')}.${EXT[contentType]}`;
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep))
    throw new Error('Đường dẫn upload nằm ngoài thư mục uploads');

  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buffer, { flag: 'wx' });

  const url = `/uploads/${rel}`;
  try {
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actorId,
        action: 'upload.create',
        entity: 'Upload',
        entityId: null,
        diff: { url: [null, url] },
        ip,
      });
    });
  } catch (e) {
    await unlink(abs).catch(() => undefined); // không để lại file mồ côi nếu audit lỗi
    throw e;
  }
  return { url, contentType, size: buffer.length };
}
