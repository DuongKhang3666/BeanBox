/**
 * Kiểm tra biến môi trường TRƯỚC khi áp migration (docker-entrypoint.sh).
 * Import module env: env sai thì module tự in danh sách lỗi (không in giá trị) và thoát mã 1.
 */
import { env } from './config/env.js';

console.log(`Biến môi trường hợp lệ (NODE_ENV=${env.NODE_ENV}).`);
