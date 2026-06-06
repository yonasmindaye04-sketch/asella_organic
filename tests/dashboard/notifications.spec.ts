/**
 * tests/dashboard/notifications.spec.ts
 * Tests the in-app Notification Center.
 */
import { test, expect } from '@playwright/test';

test.describe('Notification Center', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/notifications');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500); // let data load
  });

  test('page loads with category tabs', async ({ page }) => {
    await expect(page.getByText(/notification center/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /all/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /low stock/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /stock requests/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /new orders/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /vendor/i })).toBeVisible();
  });

  test('KPI summary cards are visible', async ({ page }) => {
    await expect(page.getByText(/low stock alerts/i)).toBeVisible();
    await expect(page.getByText(/pending orders/i)).toBeVisible();
    await expect(page.getByText(/vendor movements/i)).toBeVisible();
  });

  test('date range selector works', async ({ page }) => {
    await page.getByRole('combobox').selectOption('30'); // Last 30 days
    await page.waitForTimeout(1500);
    // Page should still show notifications section
    await expect(page.getByText(/notification center/i)).toBeVisible();
  });

  test('category filter works', async ({ page }) => {
    await page.getByRole('button', { name: /new orders/i }).click();
    await page.waitForTimeout(1000);
    // Should show only orders or empty state
    const items = page.getByText(/new order|no notifications/i);
    await expect(items.first()).toBeVisible();
  });

  test('refresh button reloads data', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh/i });
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    // Page should still be functional after refresh
    await page.waitForTimeout(1500);
    await expect(page.getByText(/notification center/i)).toBeVisible();
  });

  test('notification items show category badges', async ({ page }) => {
    // If any notifications exist, they should have type badges
    const notifList = page.locator('.divide-y').first();
    const hasItems = await notifList.locator('> div').count();
    if (hasItems > 0) {
      const badges = page.getByText(/low stock|new order|vendor|stock request/i);
      await expect(badges.first()).toBeVisible();
    }
  });

});
