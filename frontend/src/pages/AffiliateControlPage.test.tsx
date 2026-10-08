/**
 * frontend/src/pages/AffiliateControlPage.test.tsx
 *
 * Mounts the real Affiliate Control page against the exact envelope shapes the
 * backend returns. This is the test that would have caught the crash reported
 * on the dashboard: `Cannot read properties of undefined (reading 'length')`
 * took down all four panels at once, because nothing above them was guarded.
 *
 * Also asserts each panel survives independently — a failure in one must not
 * take down the rest, which is what PanelErrorBoundary now guarantees.
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
      stats:      () => apiGet('/api/referrals/stats'),
      config:     () => apiGet('/api/referrals/config'),
      list:       () => apiGet('/api/referrals/affiliates'),
      getRule:    (id: string) => apiGet(`/api/referrals/affiliates/${id}/rule`),
      saveRule:   (id: string, b: unknown) => apiPut(`/api/referrals/affiliates/${id}/rule`, b),
      clearRule:  (id: string) => apiDelete(`/api/referrals/affiliates/${id}/rule`),
      create:     (b: unknown) => apiPost('/api/referrals/affiliates', b),
      update:     (id: string, b: unknown) => apiPatch(`/api/referrals/affiliates/${id}`, b),
      remove:     (id: string, t: string) => apiDelete(`/api/referrals/affiliates/${id}`, { 'x-2fa-token': t }),
      grantPortalAccess: (id: string, t: string) =>
                           apiPost(`/api/referrals/affiliates/${id}/portal-access`, {}, { 'x-2fa-token': t }),
      commissions: (p: unknown) => apiGet(`/api/referrals/commissions?${JSON.stringify(p ?? {})}`),
      markPaid:   (id: string, t: string) => apiPatch(`/api/referrals/commissions/${id}/pay`, {}, { 'x-2fa-token': t }),
      reverse:    (id: string, r: string, t: string) =>
                     apiPost(`/api/referrals/commissions/${id}/reverse`, { reason: r }, { 'x-2fa-token': t }),
      recipients:   () => apiGet('/api/referrals/reports/recipients'),
      reportHistory:() => apiGet('/api/referrals/reports/history'),
      sendReports:  (b: unknown, t: string) => apiPost('/api/referrals/reports/send', b, { 'x-2fa-token': t }),
      previewUrl:   () => 'http://localhost:3001/preview',
    },
  };
});

vi.mock('../layouts/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const AFF_ROW = {
  id: 'aff-1',
  referral_code: 'ASL-ABC123',
  is_active: 1,
  rule_type: 'custom',
  total_earnings: 500,
  total_referrals: 2,
  clawback_pending: 0,
  full_name: 'Biruk Alemu',
  identifier: 'biruk@health.et',
  affiliate_type: 'external',
  total_customers: 2,
  total_commissions_amount: 500,
  pending_count: 1,
  paid_count: 1,
};

const COMMISSION = {
  id: 'rc-1',
  order_id: 'ORD-20260101-AAAAAA',
  commission_amount: 150,
  commission_type: 'percentage',
  commission_value: 10,
  order_total: 1500,
  status: 'pending',
  rule_source: 'individual',
  clawback_settled: 0,
  reversal_reason: null,
  reversed_at: null,
  calculated_at: '2026-01-01T00:00:00Z',
  paid_at: null,
  affiliate_name: 'Biruk Alemu',
  referral_code: 'ASL-ABC123',
  customer_name: 'Mahlet',
  customer_phone: '+25191680797',
};

/** Maps a path fragment to a realistic response, mirroring the live backend. */
function route(path: string) {
  if (path.includes('/referrals/stats')) {
    return { success: true, data: {
      total_affiliates: 2, active_affiliates: 2, total_referred_customers: 4,
      total_commissions_generated: 500, total_paid: 130, total_pending: 142,
      pending_count: 2, total_reversed: 0, clawback_pending: 0,
    } };
  }
  if (path.includes('/referrals/affiliates/aff-1/rule')) {
    return { success: true, data: { rule_type: 'custom', effective: true,
      rule: { commission_type: 'percentage', commission_value: '25.00', min_order_amount: '300.00', max_commission: null, is_active: 1 },
      global_rule: { commission_type: 'percentage', commission_value: '10.00', min_order_amount: '300.00', max_commission: '500.00' } } };
  }
  if (path.includes('/referrals/affiliates')) {
    return { success: true, data: [AFF_ROW] };
  }
  if (path.includes('/referrals/config')) {
    return { success: true, data: { commission_type: 'percentage', commission_value: '10.00',
      min_order_amount: '300.00', max_commission: '500.00' } };
  }
  if (path.includes('/referrals/commissions')) {
    return { success: true, data: [COMMISSION], total: 1, page: 1, limit: 100 };
  }
  if (path.includes('/reports/recipients')) {
    return { success: true, data: {
      recipients: [{ id: 'aff-1', referral_code: 'ASL-ABC123', name: 'Biruk Alemu', email: 'biruk@health.et', has_email: true }],
      mail_configured: true } };
  }
  if (path.includes('/reports/history')) {
    return { success: true, data: [] };
  }
  return { success: true, data: null };
}

describe('AffiliateControlPage', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPut.mockReset();
    apiPost.mockReset();
    apiPatch.mockReset();
    apiDelete.mockReset();
    apiGet.mockImplementation((p: string) => Promise.resolve(route(p)));
  });

  afterEach(() => vi.restoreAllMocks());

  it('renders all four panels without crashing', async () => {
    const { default: Page } = await import('./AffiliateControlPage');
    render(<Page />);

    await waitFor(() => expect(screen.getByText('Affiliate Control')).toBeTruthy());

    // Header + KPI cards. Note: the labels are uppercased via CSS, which does
    // not change textContent. "Affiliates" legitimately appears twice (the KPI
    // card and the roster table header), so it is matched non-exclusively.
    await waitFor(() => expect(screen.getAllByText('Affiliates').length).toBeGreaterThan(0));
    expect(screen.getByText('Pending ETB')).toBeTruthy();
    expect(screen.getByText('Paid ETB')).toBeTruthy();

    // Item 1 — rule panel
    expect(screen.getByText('Commission Rule')).toBeTruthy();
    expect(screen.getByText('Applies to')).toBeTruthy();

    // Item 3 — roster + delete button. The affiliate name appears in both the
    // roster row and the commission ledger row, so match non-exclusively.
    await waitFor(() => expect(screen.getAllByText('Biruk Alemu').length).toBeGreaterThan(0));
    expect(screen.getByText('Delete')).toBeTruthy();
    expect(screen.getByText('Deactivate')).toBeTruthy();
    expect(screen.getByText('Portal Login')).toBeTruthy();

    // Item 5 — reports
    expect(screen.getByText('Sales & Engagement Reports')).toBeTruthy();
    expect(screen.getByText('Send to')).toBeTruthy();

    // Commission ledger
    expect(screen.getByText('Commission Movement')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Mark Paid')).toBeTruthy());
    expect(screen.getByText('Reverse')).toBeTruthy();
    expect(screen.getByText('ORD-20260101-AAAAAA')).toBeTruthy();
  });

  it('renders even when the recipients payload uses the OLD flat array shape', async () => {
    // Regression guard for the reported crash.
    apiGet.mockImplementation((p: string) => {
      if (p.includes('/reports/recipients')) {
        return Promise.resolve({ success: true, data: [
          { id: 'aff-1', referral_code: 'ASL-ABC123', name: 'Biruk Alemu', email: 'biruk@health.et', has_email: true },
        ] } as never);
      }
      return Promise.resolve(route(p));
    });

    const { default: Page } = await import('./AffiliateControlPage');
    render(<Page />);

    await waitFor(() => expect(screen.getByText('Affiliate Control')).toBeTruthy());
    // Falls back to zero rather than throwing on .length
    await waitFor(() =>
      expect(screen.getByText(/All affiliates with portal access \(0\)/)).toBeTruthy());
    // The rest of the page is unaffected
    expect(screen.getByText('Commission Movement')).toBeTruthy();
  });

  it('keeps other panels alive when one panel throws during render', async () => {
    // Force a crash inside the roster panel by handing it a broken row.
    apiGet.mockImplementation((p: string) => {
      if (p.includes('/referrals/affiliates') && !p.includes('/rule')) {
        return Promise.resolve({ success: true, data: null } as never);
      }
      return Promise.resolve(route(p));
    });

    const { default: Page } = await import('./AffiliateControlPage');
    render(<Page />);

    await waitFor(() => expect(screen.getByText('Affiliate Control')).toBeTruthy());
    // Commission ledger must still render — one panel's failure is contained
    await waitFor(() => expect(screen.getByText('Commission Movement')).toBeTruthy());
    expect(screen.getByText('Sales & Engagement Reports')).toBeTruthy();
  });
});