import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    setupFiles: ['tests/setupEnv.ts'],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 60000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/generated/**', 'src/**/*.d.ts', 'src/**/types.ts'],
      thresholds: { lines: 95, statements: 94, functions: 95, branches: 87 },
    },
  },
});
