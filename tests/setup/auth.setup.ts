/**
 * tests/setup/auth.setup.ts
 *
 * Runs ONCE before all dashboard tests.
 * Logs in as admin and saves the session cookie to .auth.json.
 * All dashboard tests reuse this saved state — no re-login needed.
 *
 * Set credentials in .env.test:
 *   ADMIN_EMAIL=asella_admin
 *   ADMIN_PASSWORD=your_password
 */

import { test as setup, expect } from "@playwright/test";
import { AUTH_FILE } from "../../playwright.config";

const EMAIL    = process.env.ADMIN_EMAIL    ?? "asella_admin";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin1234!";

setup("login and save session", async ({ page }) => {
  await page.goto("/login");

  // Fill credentials
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /login|sign in/i }).click();

  // Should reach dashboard
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  await expect(page.getByText(/new sales order/i)).toBeVisible();

  // Save auth state (cookies) for reuse
  await page.context().storageState({ path: AUTH_FILE });
  console.log("✅ Auth saved to", AUTH_FILE);
});
