/**
 * tests/dashboard/products.spec.ts
 * Tests the combined Products page — Tab 1 (Products) and Tab 2 (Stock).
 * This is the merged ProductCatalogPage + InventoryPage.
 */
import { test, expect } from '@playwright/test';

test.describe('Products Page — Tab 1: Product Catalog', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/products');
    await page.waitForLoadState('networkidle');
  });

  test('page loads on Products tab by default', async ({ page }) => {
    await expect(page.getByText(/products/i).first()).toBeVisible();
    // Should show product cards
    await expect(page.getByRole('button', { name: /add product/i })).toBeVisible();
  });

  test('product cards are visible', async ({ page }) => {
    // Wait for cards to load
    await page.waitForTimeout(1500);
    // At least one product card should be visible (we have 29 canonical products)
    const cards = page.locator('.rounded-2xl, .rounded-xl').filter({ hasText: /ETB/ });
    await expect(cards.first()).toBeVisible();
  });

  test('search filters products', async ({ page }) => {
    await page.getByPlaceholder(/search/i).fill('Moringa');
    await page.waitForTimeout(500);
    // Should show moringa products, not others
    const cards = await page.locator('h3').allTextContents();
    const nonMoringa = cards.filter(c => !c.toLowerCase().includes('moringa'));
    expect(nonMoringa).toHaveLength(0);
  });

  test('category filter pills work', async ({ page }) => {
    // Click "Oils" category
    await page.getByRole('button', { name: /^Oils$/i }).click();
    await page.waitForTimeout(500);
    const cards = await page.locator('h3').allTextContents();
    expect(cards.length).toBeGreaterThan(0);
  });

  test('Add Product button opens form modal', async ({ page }) => {
    await page.getByRole('button', { name: /add product/i }).click();
    await expect(page.getByText(/new product/i)).toBeVisible();
    await expect(page.getByLabel(/product name/i)).toBeVisible();
  });

  test('create product form validates empty name', async ({ page }) => {
    await page.getByRole('button', { name: /add product/i }).click();
    // Try to save without name
    await page.getByRole('button', { name: /save product/i }).click();
    // Modal should still be open
    await expect(page.getByText(/new product/i)).toBeVisible();
  });

  test('create product form validates price > 0', async ({ page }) => {
    await page.getByRole('button', { name: /add product/i }).click();
    await page.getByPlaceholder(/moringa seed|product name/i).fill('Test Product PW');
    await page.getByPlaceholder(/100g|package size/i).fill('100g');
    // Leave price as 0 or blank
    await page.getByRole('button', { name: /save product/i }).click();
    // Should show price error, not close modal
    await expect(page.getByText(/new product/i)).toBeVisible();
  });

  test('create new product successfully', async ({ page }) => {
    await page.getByRole('button', { name: /add product/i }).click();

    await page.getByPlaceholder(/moringa seed|product name/i).fill('Playwright Test Product');
    await page.getByPlaceholder(/100g|package size/i).fill('50g');

    // Set price
    const priceInput = page.getByPlaceholder(/1000|price/i);
    await priceInput.fill('999');

    // Save
    await page.getByRole('button', { name: /save product/i }).click();

    // Modal should close and product should appear in grid
    await page.waitForTimeout(1500);
    await expect(page.getByText(/playwright test product/i)).toBeVisible();
  });

  test('edit product opens pre-filled form', async ({ page }) => {
    await page.waitForTimeout(1000);
    // Click edit on first product card
    const editBtn = page.getByTitle(/edit/i).first();
    await editBtn.click();
    // Form should be pre-filled (not empty)
    const nameInput = page.getByPlaceholder(/moringa seed|product name/i);
    const value = await nameInput.inputValue();
    expect(value.length).toBeGreaterThan(0);
  });

  test('empty image URL does not cause validation error', async ({ page }) => {
    await page.getByRole('button', { name: /add product/i }).click();
    await page.getByPlaceholder(/moringa seed|product name/i).fill('PW No Image Product');
    await page.getByPlaceholder(/100g|package size/i).fill('200g');
    await page.getByPlaceholder(/1000|price/i).fill('500');
    // Leave image URL blank intentionally
    await page.getByRole('button', { name: /save product/i }).click();
    // Should succeed — blank image_url should be stripped, not fail URL validation
    await page.waitForTimeout(1500);
    await expect(page.getByText(/new product/i)).toHaveCount(0); // modal closed = success
  });

  test('delete button opens 2FA modal', async ({ page }) => {
    await page.waitForTimeout(1000);
    const deleteBtn = page.getByTitle(/delete/i).first();
    await deleteBtn.click();
    // 2FA modal should appear
    await expect(page.getByText(/2fa|2-factor|authenticator/i)).toBeVisible();
    await expect(page.getByPlaceholder(/6-digit|code/i)).toBeVisible();
  });

  test('wrong 2FA code shows error', async ({ page }) => {
    await page.waitForTimeout(1000);
    const deleteBtn = page.getByTitle(/delete/i).first();
    await deleteBtn.click();
    await page.getByPlaceholder(/6-digit|code/i).fill('000000');
    await page.getByRole('button', { name: /delete/i }).last().click();
    await expect(page.getByText(/failed|invalid|wrong|check/i)).toBeVisible({ timeout: 6_000 });
  });

});

test.describe('Products Page — Tab 2: Stock', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/products');
    await page.waitForLoadState('networkidle');
    // Switch to Stock tab
    await page.getByRole('button', { name: /^stock$/i }).click();
    await page.waitForTimeout(1000);
  });

  test('stock tab shows KPI cards', async ({ page }) => {
    await expect(page.getByText(/total products/i)).toBeVisible();
    await expect(page.getByText(/total units/i)).toBeVisible();
    await expect(page.getByText(/stock value/i)).toBeVisible();
    await expect(page.getByText(/out of stock/i)).toBeVisible();
  });

  test('stock levels table is populated', async ({ page }) => {
    await expect(page.getByText(/stock levels/i)).toBeVisible();
    // Table rows should exist (we have 29 products)
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible();
  });

  test('status badges are shown on table rows', async ({ page }) => {
    const badges = page.getByText(/^(OK|Low|Critical|Out of Stock)$/i);
    await expect(badges.first()).toBeVisible();
  });

  test('adjust button opens adjustment modal', async ({ page }) => {
    const adjustBtn = page.getByRole('button', { name: /adjust/i }).first();
    await adjustBtn.click();
    await expect(page.getByText(/adjust stock/i)).toBeVisible();
    await expect(page.getByText(/add stock|remove stock/i).first()).toBeVisible();
  });

  test('adjustment modal validates empty quantity', async ({ page }) => {
    await page.getByRole('button', { name: /adjust/i }).first().click();
    await page.getByPlaceholder(/enter quantity/i).fill('');
    await page.getByPlaceholder(/reason|audit/i).fill('test reason here');
    await page.getByRole('button', { name: /save adjustment/i }).click();
    // Should show error — not close modal
    await expect(page.getByText(/adjust stock/i)).toBeVisible();
  });

  test('adjustment modal validates short reason', async ({ page }) => {
    await page.getByRole('button', { name: /adjust/i }).first().click();
    await page.getByPlaceholder(/enter quantity/i).fill('5');
    await page.getByPlaceholder(/reason|audit/i).fill('ab'); // < 3 chars
    await page.getByRole('button', { name: /save adjustment/i }).click();
    await expect(page.getByText(/reason.*3|at least 3|required/i)).toBeVisible();
  });

  test('valid stock adjustment saves successfully', async ({ page }) => {
    await page.getByRole('button', { name: /adjust/i }).first().click();

    // Select Manual Adjustment type
    await page.getByRole('button', { name: /manual adjustment/i }).click();
    // Add stock direction
    await page.getByRole('button', { name: /add stock/i }).click();
    // Quantity
    await page.getByPlaceholder(/enter quantity/i).fill('1');
    // Reason (min 3 chars)
    await page.getByPlaceholder(/reason|audit/i).fill('Playwright automated test adjustment');

    await page.getByRole('button', { name: /save adjustment/i }).click();

    // Modal should close on success
    await page.waitForTimeout(2000);
    await expect(page.getByText(/adjust stock/i)).toHaveCount(0);
  });

  test('live quantity preview updates as you type', async ({ page }) => {
    await page.getByRole('button', { name: /adjust/i }).first().click();
    await page.getByPlaceholder(/enter quantity/i).fill('10');
    // Arrow preview (e.g. "219 → 229 units") should be visible
    await expect(page.getByText(/→.*units/i)).toBeVisible();
  });

  test('movement log sub-tab shows history', async ({ page }) => {
    await page.getByRole('button', { name: /movement log/i }).click();
    await page.waitForTimeout(500);
    // Should show table or empty message
    const content = page.getByText(/sale|adjustment|purchase|no movements/i);
    await expect(content.first()).toBeVisible();
  });

  test('stock requests sub-tab loads', async ({ page }) => {
    await page.getByRole('button', { name: /stock requests/i }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText(/stock requests/i)).toBeVisible();
  });

  test('status filter pills work', async ({ page }) => {
    await page.getByRole('button', { name: /low/i }).first().click();
    await page.waitForTimeout(500);
    // Either shows low-stock products or "no products match"
    const content = page.getByText(/low|no products/i);
    await expect(content.first()).toBeVisible();
  });

});
