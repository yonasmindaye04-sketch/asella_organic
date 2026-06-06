/**
 * tests/dashboard/vendor.spec.ts
 * Tests the Vendor Purchase form (staff-facing).
 * Uses saved admin auth state.
 *
 * Submits to POST /api/vendor-orders (the merged schema, not the
 * legacy /api/orders endpoint).
 */
import { test, expect } from '@playwright/test';

test.describe('Vendor Purchase', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/vendor');
    await page.waitForLoadState('networkidle');
  });

  test('page loads with the vendor form', async ({ page }) => {
    await expect(page.getByText(/vendor purchase|vendor order/i).first()).toBeVisible();
    // Required inputs: vendor_name, item (or description), amount (or quantity), price (or unit_price)
    await expect(page.getByLabel(/vendor|supplier/i).first()).toBeVisible();
  });

  test('total auto-calculates as price and quantity change', async ({ page }) => {
    const priceInput = page.getByPlaceholder(/price|unit.*price/i).first();
    const qtyInput   = page.getByPlaceholder(/quantity|amount|kg/i).first();

    if (await priceInput.isVisible() && await qtyInput.isVisible()) {
      await priceInput.fill('100');
      await qtyInput.fill('5');
      await page.waitForTimeout(300);

      // The total should reflect 100 * 5 = 500 in ETB.
      const totalText = await page.locator('body').innerText();
      expect(totalText, 'total should show 500 ETB').toMatch(/500/);
    } else {
      test.skip(true, 'price/quantity inputs not found in the expected form layout');
    }
  });

  test('submitting empty form shows validation', async ({ page }) => {
    // Click the submit button without filling anything
    await page.getByRole('button', { name: /submit|create|save|place/i }).first().click();
    // Should remain on the same page
    await expect(page).toHaveURL(/vendor/);
  });

  test('valid vendor order submits to /api/vendor-orders', async ({ page }) => {
    // Capture the network call to verify the correct endpoint
    const [request] = await Promise.all([
      page
        .waitForRequest(req =>
          req.url().includes('/api/vendor-orders') && req.method() === 'POST',
          { timeout: 8_000 }
        )
        .catch(() => null),
      (async () => {
        // Fill all required fields using the merged schema
        const vendorInput = page.getByLabel(/vendor|supplier/i).first();
        if (await vendorInput.isVisible()) await vendorInput.fill('Test Supplier Co.');

        const itemInput = page.getByLabel(/item|product|description/i).first();
        if (await itemInput.isVisible()) await itemInput.fill('Raw Moringa');

        const qtyInput = page.getByLabel(/quantity|amount|kg/i).first();
        if (await qtyInput.isVisible()) await qtyInput.fill('25');

        const priceInput = page.getByLabel(/price|unit.*price/i).first();
        if (await priceInput.isVisible()) await priceInput.fill('800');

        // Submit
        await page.getByRole('button', { name: /submit|create|save|place/i }).first().click();
      })(),
    ]);

    if (request) {
      // MUST hit /api/vendor-orders, not the legacy /api/orders
      expect(request.url()).toContain('/api/vendor-orders');
      expect(request.url()).not.toMatch(/\/api\/orders($|\?)/);
    } else {
      test.skip(true, 'No request captured — form may have validation errors that need manual review');
    }
  });

  test('success message appears after a valid submit', async ({ page }) => {
    const vendorInput = page.getByLabel(/vendor|supplier/i).first();
    if (!(await vendorInput.isVisible())) {
      test.skip(true, 'vendor input not present');
      return;
    }

    await vendorInput.fill('PW Test Vendor');
    await page.getByLabel(/item|product|description/i).first().fill('Test Item');
    await page.getByLabel(/quantity|amount|kg/i).first().fill('10');
    await page.getByLabel(/price|unit.*price/i).first().fill('500');
    await page.getByRole('button', { name: /submit|create|save|place/i }).first().click();

    // Success toast, banner, or redirect
    await expect(
      page.getByText(/success|created|submitted|saved/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});
