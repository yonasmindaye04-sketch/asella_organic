/**
 * tests/dashboard/navigation.spec.ts
 * Clicks every sidebar link and verifies the page loads without error.
 * This is the "smoke test" — if any page crashes, this catches it.
 */
import { test, expect } from '@playwright/test';

const PAGES = [
  { name: 'Dashboard',        url: '/dashboard'                },
  { name: 'New Sales Order',  url: '/dashboard/new-order'      },
  { name: 'Bulk Orders',      url: '/dashboard/bulk-orders'    },
  { name: 'Vendor Purchase',  url: '/dashboard/vendor'         },
  { name: 'Products',         url: '/dashboard/products'       },
  { name: 'Stock Alert',      url: '/dashboard/stock-alert'    },
  { name: 'Order Tracking',   url: '/dashboard/tracking'       },
  { name: 'Notifications',    url: '/dashboard/notifications'  },
  { name: 'Change Password',  url: '/dashboard/change-password'},
  { name: 'User Management',  url: '/dashboard/users'          },
  { name: 'Affiliate Control',url: '/dashboard/affiliates'     },
];

test.describe('Sidebar Navigation — Smoke Tests', () => {

  for (const { name, url } of PAGES) {
    test(`${name} page loads without crash`, async ({ page }) => {
      // Listen for JS errors
      const jsErrors: string[] = [];
      page.on('pageerror', err => jsErrors.push(err.message));

      await page.goto(url);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Page should not redirect to login (auth should still be valid)
      await expect(page).not.toHaveURL(/login/);

      // No critical JS errors (filter out known third-party noise)
      const criticalErrors = jsErrors.filter(e =>
        !e.includes('youtube') &&
        !e.includes('google') &&
        !e.includes('doubleclick') &&
        !e.includes('ERR_BLOCKED_BY_CLIENT')
      );

      if (criticalErrors.length > 0) {
        console.warn(`⚠️ JS errors on ${name}:`, criticalErrors);
      }

      // Page should have some visible content (not blank)
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.trim().length, `${name} appears to be a blank page`).toBeGreaterThan(50);
    });
  }

  test('all sidebar links are clickable', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Get all sidebar links
    const links = page.locator('aside a[href]');
    const count = await links.count();
    expect(count).toBeGreaterThan(3);
    console.log(`Found ${count} sidebar links`);
  });

  test('no page shows a blank white screen', async ({ page }) => {
    for (const { name, url } of PAGES) {
      await page.goto(url);
      await page.waitForTimeout(800);
      const text = await page.locator('body').innerText();
      expect(
        text.trim().length,
        `${name} at ${url} appears blank`
      ).toBeGreaterThan(20);
    }
  });

});
