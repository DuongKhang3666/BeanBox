import { execSync } from 'node:child_process';
import { TEST_DATABASE_URL } from './testEnv.js';

/** Áp migration lên DB test (beanbox_test) trước khi chạy test. */
export default function setup(): void {
  if (!/_test(\?|$)/.test(TEST_DATABASE_URL)) {
    throw new Error('DB test phải có tên kết thúc bằng _test để tránh chạm nhầm DB dev');
  }
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
