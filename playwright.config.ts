/**
 * playwright.config.ts
 * Asella Organic — Playwright E2E Configuration
 *
 * Runs the spec files under ./tests. The auth.setup.ts helper logs in
 * once and saves the session cookie to .auth.json; all dashboard tests
 * reuse that state via storageState.
 *
 * Pre-requisites:
 *   - Frontend dev server running at http://localhost:5173
 *   - Backend  dev server running at http://localhost:3001
 *   - ADMIN_EMAIL / ADMIN_PASSWORD set in .env.test (see README_TESTING.md)
 */

import { defineConfig, devices } from "@playwright/test";
import path from "path";

export const AUTH_FILE = path.join(__dirname, "tests/setup/.auth.json");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,   // sequential — tests share backend state (DB)
  retries: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  use: {
    baseURL:    "http://localhost:5173",
    headless:   true,            // set to false to watch tests run
    screenshot: "only-on-failure",
    video:      "retain-on-failure",
    trace:      "on-first-retry",
  },

  projects: [
    // 1. Run login first and save auth state
    {
      name:    "setup",
      testMatch: "**/setup/auth.setup.ts",
    },

    // 2. All dashboard tests reuse saved auth state
    {
      name:        "dashboard",
      testMatch:   "**/dashboard/*.spec.ts",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH_FILE,
      },
    },

    // 3. Public pages — no auth needed
    {
      name:      "public",
      testMatch: ["**/auth.spec.ts", "**/storefront.spec.ts"],
      use:       { ...devices["Desktop Chrome"] },
    },
  ],
});
