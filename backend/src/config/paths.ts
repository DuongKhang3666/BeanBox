import path from 'node:path';

/** backend/uploads: src/config và dist/config đều nằm hai cấp dưới thư mục backend. */
export const UPLOADS_DIR = path.resolve(import.meta.dirname, '..', '..', 'uploads');
