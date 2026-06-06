/**
 * tests/auth.spec.ts
 * Tests login page, wrong credentials, and logout.
 * Runs WITHOUT saved auth state (public project).
 */
import { test, expect } from '@playwright/test';

const EMAIL    = process.env.ADMIN_EMAIL    ?? 'asella_admin';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin1234!';

test.describe('Authentication', () => {

  test('login page loads', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /login|sign in/i })).toBeVisible();
  });

  test('wrong password shows error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill('WrongPassword999!');
    await page.getByRole('button', { name: /login|sign in/i }).click();

    // Should stay on login and show error
    await expect(page).toHaveURL(/login/);
    await expect(page.getByText(/invalid|incorrect|wrong|failed/i)).toBeVisible();
  });

  test('empty form shows validation', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /login|sign in/i }).click();
    // HTML5 required fields or custom validation message
    await expect(page).toHaveURL(/login/);
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /login|sign in/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test('logout works', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /login|sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

    // Logout
    await page.getByRole('button', { name: /logout/i }).click();
    await expect(page).toHaveURL(/login|\/$/);
  });

  test('protected route redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/dashboard/products');
    await expect(page).toHaveURL(/login/);
  });

});
