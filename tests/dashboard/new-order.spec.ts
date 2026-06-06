/**
 * tests/dashboard/new-order.spec.ts
 * Tests the New Sales Order form (staff-facing).
 * Uses saved admin auth state.
 */
import { test, expect } from '@playwright/test';

test.describe('New Sales Order', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/new-order');
    await page.waitForLoadState('networkidle');
  });

  test('page loads with form', async ({ page }) => {
    await expect(page.getByText(/new sales order/i)).toBeVisible();
    // Product dropdown should be present
    await expect(page.getByRole('combobox').first()).toBeVisible();
  });

  test('product dropdown is populated', async ({ page }) => {
    const dropdown = page.getByRole('combobox').first();
    await dropdown.click();
    // Should have options (products loaded)
    const options = await dropdown.locator('option').count();
    expect(options).toBeGreaterThan(1); // more than just the placeholder
  });

  test('submitting empty form shows validation', async ({ page }) => {
    await page.getByRole('button', { name: /submit|place|create|save/i }).first().click();
    // Should stay on same page, not navigate away
    await expect(page).toHaveURL(/new-order/);
  });

  test('can fill and submit a valid order', async ({ page }) => {
    // Fill customer name
    await page.getByPlaceholder(/customer|name/i).fill('Test Customer Playwright');
    // Fill phone
    await page.getByPlaceholder(/phone|09/i).fill('0911000000');
    // Select city
    const cityField = page.getByRole('combobox', { name: /city/i });
    if (await cityField.isVisible()) await cityField.selectOption({ index: 1 });

    // Select a product
    const productDropdown = page.getByRole('combobox').first();
    await productDropdown.selectOption({ index: 1 });

    // Set quantity
    const qtyInput = page.getByLabel(/quantity/i).first();
    if (await qtyInput.isVisible()) await qtyInput.fill('1');

    // Submit
    await page.getByRole('button', { name: /submit|place|create|send/i }).first().click();

    // Should show success message or redirect
    await expect(
      page.getByText(/success|submitted|order.*created|placed/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });

});
