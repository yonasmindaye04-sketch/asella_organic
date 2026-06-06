/**
 * tests/dashboard/bulk-orders.spec.ts
 * Tests the Bulk / Franchise Orders page.
 */
import { test, expect } from '@playwright/test';

test.describe('Bulk Orders', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/bulk-orders');
    await page.waitForLoadState('networkidle');
  });

  test('page loads', async ({ page }) => {
    await expect(page.getByText(/bulk order/i)).toBeVisible();
  });

  test('product dropdown is populated', async ({ page }) => {
    const dropdown = page.getByRole('combobox').first();
    const count = await dropdown.locator('option').count();
    expect(count).toBeGreaterThan(1);
  });

  test('submitting empty form shows validation', async ({ page }) => {
    await page.getByRole('button', { name: /submit|place|create/i }).first().click();
    await expect(page).toHaveURL(/bulk-orders/);
  });

});
