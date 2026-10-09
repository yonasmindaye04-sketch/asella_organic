/**
 * frontend/src/pages/AffiliateControlPage.responsive.test.tsx
 *
 * Verifies the fix for the reported layout issue: the affiliates roster was
 * squeezed into a 380px sidebar column while carrying an 820px min-width
 * table, so most columns were cut off. Asserts the roster and ledger now render
 * full width and that each offers both a table (wide) and cards (narrow).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const apiGet = vi.fn();
const apiPut = vi.fn();
const apiPost = vi.fn();
const apiPatch = vi.fn();
const apiDelete = vi.fn();

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return {
    ...actual,
    api: {
      get:    (...a: unknown[]) => apiGet(...a),
      post:   (...a: unknown[]) => apiPost(...a),
      put:    (...a: unknown[]) => apiPut(...a),
      patch:  (...a: unknown[]) => apiPatch(...a),
      delete: (...a: unknown[]) => apiDelete(...a),
    },
    referrals: {
      stats:     () => apiGet('/api/referrals/stats'),
      config:    () => apiGet('/api/referrals/config'),
      list:      () => apiGet('/api/referrals/affiliates'),
      getRule:   (id: string) => apiGet(`/api/referrals/affiliates/${id}/rule`),
      saveRule:  () => apiPut('/x', {}),
      clearRule: () => apiDelete('/x'),
      create:    () => apiPost('/x', {}),
      update:    () => apiPatch('/x', {}),
      remove:    () => apiDelete('/x'),
      grantPortalAccess: () => apiPost('/x', {}, {}),
      commissions:      () => apiGet('/api/referrals/commissions'),
      markPaid:          () => apiPatch('/x', {}, {}),
      reverse:           () => apiPost('/x', {}, {}),
      recipients:        () => apiGet('/api/referrals/reports/recipients'),
      reportHistory:     () => apiGet('/api/referrals/reports/history'),
      sendReports:       () => apiPost('/x', {}, {}),
      previewUrl:        () => 'http://localhost:3001/p',
    },
    auth: {
      me: () => Promise.resolve({ success: true, data: { two_factor_enabled: true } }),
    },
  };
});

vi.mock('../layouts/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const AFF = {
  id: 'aff-1', referral_code: 'ASL-ABC123', is_active: 1, rule_type: 'global',
  total_earnings: 500, total_referrals: 2, clawback_pending: 0,
  full_name: 'Biruk Alemu', identifier: 'biruk@health.et',
  affiliate_type: 'external', total_customers: 2,
  total_commissions_amount: 500, pending_count: 1, paid_count: 1,
};

const CM = {
  id: 'rc-1', order_id: 'ORD-20260101-AAAAAA', commission_amount: 150,
  commission_type: 'percentage', commission_value: 10, order_total: 1500,
  status: 'pending', rule_source: 'global', clawback_settled: 0,
  reversal_reason: null, reversed_at: null, calculated_at: '2026-01-01T00:00:00Z',
  paid_at: null, affiliate_name: 'Biruk Alemu', referral_code: 'ASL-ABC123',
  customer_name: 'Mahlet', customer_phone: '+25191680797',
};

function route(path: string) {
  if (path.includes('/referrals/stats')) {
    return { success: true, data: { total_affiliates: 1, active_affiliates: 1,
      total_referred_customers: 2, total_commissions_generated: 500, total_paid: 130,
      total_pending: 142, pending_count: 1, total_reversed: 0, clawback_pending: 0 } };
  }
  if (path.includes('/affiliates/aff-1/rule')) {
    return { success: true, data: { rule_type: 'global', effective: false, rule: null,
      global_rule: { commission_type: 'percentage', commission_value: '10.00',
        min_order_amount: '0.00', max_commission: null } } };
  }
  if (path.includes('/referrals/affiliates')) return { success: true, data: [AFF] };
  if (path.includes('/referrals/config')) {
    return { success: true, data: { commission_type: 'percentage',
      commission_value: '10.00', min_order_amount: '0.00', max_commission: null } };
  }
  if (path.includes('/referrals/commissions')) {
    return { success: true, data: [CM], total: 1, page: 1, limit: 100 };
  }
  if (path.includes('/reports/recipients')) {
    return { success: true, data: { recipients: [{ id: 'aff-1',
      referral_code: 'ASL-ABC123', name: 'Biruk Alemu', email: 'b@x.com', has_email: true }],
      mail_configured: true } };
  }
  if (path.includes('/reports/history')) return { success: true, data: [] };
  return { success: true, data: null };
}

describe('AffiliateControlPage layout', () => {
  beforeEach(() => {
    [apiGet, apiPut, apiPost, apiPatch, apiDelete].forEach(m => m.mockReset());
    apiGet.mockImplementation((p: string) => Promise.resolve(route(p)));
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders the roster and ledger outside the narrow sidebar column', async () => {
    const { default: Page } = await import('./AffiliateControlPage');
    const { container } = render(<Page />);

    await waitFor(() => expect(screen.getAllByText('Biruk Alemu').length).toBeGreaterThan(0));

    // The old markup pinned these into an xl:grid-cols-[380px_1fr] column.
    expect(container.innerHTML).not.toContain('380px_1fr');

    // The 820px / 1000px min-width tables are gone — those forced a
    // horizontal scrollbar inside a narrow column.
    expect(container.innerHTML).not.toContain('min-w-[820px]');
    expect(container.innerHTML).not.toContain('min-w-[1000px]');

    // Rule + reports share a responsive 2-up grid; the roster is standalone.
    expect(container.innerHTML).toContain('lg:grid-cols-2');
  });

  it('provides a table for wide screens and cards for small screens', async () => {
    const { default: Page } = await import('./AffiliateControlPage');
    const { container } = render(<Page />);

    await waitFor(() => expect(screen.getAllByText('Biruk Alemu').length).toBeGreaterThan(0));

    // One table per data panel (roster + ledger); both are hidden below lg.
    expect(container.querySelectorAll('table')).toHaveLength(2);
    expect(container.innerHTML).toContain('hidden overflow-x-auto lg:block');

    // Assert the *responsive behaviour*, not the divider colour. The card
    // stack must toggle at the same breakpoint as the table hides; pinning the
    // palette class here would break every time the design tokens change.
    const cardStacks = [...container.querySelectorAll('div')].filter((el) =>
      el.className.includes('lg:hidden'),
    );
    expect(cardStacks.length).toBeGreaterThanOrEqual(2);
    for (const el of cardStacks) {
      expect(el.className).toMatch(/\bdivide-y\b/);
    }
  });

  it('keeps every action reachable in the small-screen card view', async () => {
    const { default: Page } = await import('./AffiliateControlPage');
    const { container } = render(<Page />);

    await waitFor(() => expect(screen.getAllByText('Biruk Alemu').length).toBeGreaterThan(0));

    // Delete appears once per view (table + card) for the single affiliate,
    // proving the card view is not a stripped-down version of the row.
    expect(screen.getAllByText('Delete')).toHaveLength(2);
    expect(container.innerHTML).toContain('Copy Link');
    expect(container.innerHTML).toContain('Portal Login');
  });
});