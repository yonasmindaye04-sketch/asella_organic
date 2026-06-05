/**
 * frontend/vitest.config.ts
 * Asella Organic — Frontend Test Configuration
 */

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals:     true,
    environment: "jsdom",
    setupFiles:  ["./tests/setup.ts"],
    coverage: {
      provider:  "v8",
      reporter:  ["text", "lcov", "html"],
      include:   ["src/**/*.{ts,tsx}"],
      exclude:   ["src/**/*.d.ts", "src/main.tsx", "src/vite-env.d.ts"],
      thresholds: {
        branches:   65,
        functions:  70,
        lines:      70,
        statements: 70,
      },
    },
    testTimeout: 10_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});