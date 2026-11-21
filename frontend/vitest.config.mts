import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Instrument v8 làm test form nặng chậm hơn; nới timeout CHỈ khi chạy --coverage để khỏi flaky.
const coverageRun = process.argv.includes("--coverage");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "vitest.empty.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "e2e/**", ".next/**"],
    testTimeout: coverageRun ? 60000 : 15000,
    hookTimeout: coverageRun ? 60000 : 15000,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts", "src/types/**"],
      thresholds: { lines: 84, statements: 81, functions: 81, branches: 75 },
    },
  },
});
