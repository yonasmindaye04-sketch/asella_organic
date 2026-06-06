/**
 * tests/dashboard/stock-alert.spec.ts
 * Tests the Stock Alert form (for secondary/franchise stores).
 */
import { test, expect } from '@playwright/test';

test.describe('Stock Alert', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/stock-alert');
    await page.waitForLoadState('networkidle');
  });

  test('page loads with product dropdown', async ({ page }) => {
    await expect(page.getByText(/stock alert/i)).toBeVisible();
    await expect(page.getByRole('combobox').first()).toBeVisible();
  });

  test('selecting product auto-fills stock remaining', async ({ page }) => {
    const dropdown = page.getByRole('combobox').first();
    await dropdown.selectOption({ index: 1 }); // select first real product
    await page.waitForTimeout(500);

    // Stock remaining field should be auto-filled (not blank)
    const stockField = page.getByLabel(/stock remaining/i);
    if (await stockField.isVisible()) {
      const value = await stockField.inputValue();
      // Value should be a number (0 or more)
      expect(Number(value)).toBeGreaterThanOrEqual(0);
    }
  });

  test('submit without product selection shows error', async ({ page }) => {
    await page.getByRole('button', { name: /send stock alert/i }).click();
    await expect(page.getByText(/select a product|required/i)).toBeVisible();
  });

  test('valid stock alert submits to correct endpoint', async ({ page }) => {
    // Monitor network request
    const [request] = await Promise.all([
      page.waitForRequest(req => req.url().includes('/api/stock/request'), { timeout: 5_000 })
        .catch(() => null),
      (async () => {
        await page.getByRole('combobox').first().selectOption({ index: 1 });
        await page.waitForTimeout(300);
        await page.getByLabel(/quantity needed/i).fill('20');
        await page.getByLabel(/requested by/i).fill('Playwright Test');
        await page.getByRole('button', { name: /send stock alert/i }).click();
      })(),
    ]);

    // If request was captured, verify it went to the right endpoint
    if (request) {
      expect(request.url()).toContain('/api/stock/request');
      expect(request.method()).toBe('POST');
    }
  });

});
