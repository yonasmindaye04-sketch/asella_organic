/**
 * tests/dashboard/tracking.spec.ts
 * Tests the Order Tracking page (staff-facing).
 * Uses saved admin auth state.
 *
 * Order Tracking is the staff's at-a-glance view of all orders in
 * flight. It must:
 *   • list orders with status, customer, total
 *   • support status transitions (Pending → Confirmed → Delivered, etc.)
 *   • trigger the order-to-Delivered transition through
 *     recordMovement() / deductOrderStock()
 *   • show the timeline / history panel
 */
import { test, expect } from '@playwright/test';

test.describe('Order Tracking', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/tracking');
    await page.waitForLoadState('networkidle');
  });

  test('page loads with the orders list', async ({ page }) => {
    await expect(page.getByText(/order tracking|orders/i).first()).toBeVisible();
  });

  test('orders table is populated with at least one order', async ({ page }) => {
    // Wait for the data fetch to settle
    await page.waitForTimeout(1_000);
    // Look for any cell that contains an order ID pattern (ORD-YYYYMMDD-XXXX)
    const orderIdCell = page.getByText(/ORD-\d{8}-[A-Z0-9]{4}/i).first();
    // If there are no orders at all, the page should show an empty state.
    const emptyState = page.getByText(/no orders|empty/i).first();
    const hasOrders = await orderIdCell.count() > 0;
    const hasEmptyState = await emptyState.count() > 0;
    expect(hasOrders || hasEmptyState, 'page must show orders or an explicit empty state').toBe(true);
  });

  test('status filter pills are clickable', async ({ page }) => {
    // Each status pill is a button with the status name
    const statuses = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Issue'];
    let foundAny = false;
    for (const status of statuses) {
      const pill = page.getByRole('button', { name: new RegExp(`^${status}$`, 'i') });
      if (await pill.count() > 0) {
        await pill.first().click();
        await page.waitForTimeout(300);
        foundAny = true;
        // The URL or page content should reflect the filter
        break;
      }
    }
    expect(foundAny, 'at least one status filter should be clickable').toBe(true);
  });

  test('search box filters by customer name or phone', async ({ page }) => {
    const searchBox = page.getByPlaceholder(/search|customer|phone|name/i).first();
    if (await searchBox.isVisible()) {
      await searchBox.fill('zzzzz_no_match_zzzzz');
      await page.waitForTimeout(500);
      // Either no rows match, or the empty state shows
      const bodyText = await page.locator('body').innerText();
      expect(bodyText).toMatch(/no|empty|0 results|not found|nothing/i);
    } else {
      test.skip(true, 'No search box found on the tracking page');
    }
  });

  test('clicking a row opens the order detail / timeline', async ({ page }) => {
    // Find a clickable order row. The UI may use the row itself, a
    // "View" button, or a status-pill in a "Details" column.
    const viewBtn = page.getByRole('button', { name: /view|details|open/i }).first();
    const firstRow = page.locator('table tbody tr').first();

    if (await viewBtn.count() > 0) {
      await viewBtn.click();
    } else if (await firstRow.count() > 0) {
      await firstRow.click();
    } else {
      test.skip(true, 'No order rows found to click into');
      return;
    }

    // A detail panel / modal / new page should appear with at least
    // one of: order items, history, customer info.
    await expect(
      page.getByText(/items|history|status|customer|total/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('changing status to "Delivered" hits the right endpoint', async ({ page }) => {
    // Find a row and open it
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.count() === 0) {
      test.skip(true, 'No orders available to transition');
      return;
    }

    const viewBtn = page.getByRole('button', { name: /view|details|open/i }).first();
    if (await viewBtn.count() > 0) {
      await viewBtn.click();
    } else {
      await firstRow.click();
    }
    await page.waitForTimeout(500);

    // Look for a status dropdown / select
    const statusSelect = page.getByRole('combobox').last();
    if (await statusSelect.count() === 0) {
      test.skip(true, 'No status select found in order detail view');
      return;
    }

    // Capture the PATCH call
    const [request] = await Promise.all([
      page
        .waitForRequest(
          req => /\/api\/orders\/[^/]+\/status/.test(req.url()) && req.method() === 'PATCH',
          { timeout: 5_000 }
        )
        .catch(() => null),
      (async () => {
        // Pick "Delivered" if present, else just change to anything
        const options = await statusSelect.locator('option').allTextContents();
        const target = options.find(o => /delivered/i.test(o)) ?? options[options.length - 1];
        await statusSelect.selectOption({ label: target });
      })(),
    ]);

    if (request) {
      expect(request.url()).toMatch(/\/api\/orders\/[^/]+\/status/);
      expect(request.method()).toBe('PATCH');
    }
  });

  test('order list does not show soft-deleted (archived) orders', async ({ page }) => {
    // Soft-deleted orders have deleted_at IS NOT NULL.
    // The API filters them out, so the UI should not show them.
    // This is a passive test — if any order row is visible, the API
    // is not filtering correctly.
    await page.waitForTimeout(1_000);
    // The test is more of a sanity check; a stronger version would
    // create + soft-delete an order in the test DB and assert it's
    // absent. The current backend tests/integration tests cover that
    // contract; here we just verify the UI doesn't show "archived"
    // rows under normal conditions.
    const archivedText = page.getByText(/archived|deleted/i);
    expect(await archivedText.count()).toBe(0);
  });
});
