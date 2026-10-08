/**
 * frontend/src/components/affiliates/AffiliateReportPanel.test.tsx
 *
 * Regression guard for the crash that white-screened Affiliate Control:
 * `Cannot read properties of undefined (reading 'length')`.
 *
 * The panel used to read /reports/recipients as { data: [...],
 * mail_configured } when the endpoint returned `data` as the array with
 * mail_configured as a sibling. TypeScript could not catch it because the
 * response is cast at the call site, so this test asserts the render survives
 * the real envelope — and survives a malformed one too.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AffiliateReportPanel from './AffiliateReportPanel';
import { referrals } from '../../services/api';

vi.mock('../../services/api', () => ({
  referrals: {
    recipients:   vi.fn(),
    reportHistory: vi.fn(),
    sendReports:  vi.fn(),
    previewUrl:   vi.fn(() => 'http://localhost:3001/preview'),
  },
}));

const noop = () => {};

/** Builds an api response in the project's standard envelope. */
const ok = <T,>(data: T) => ({ success: true as const, data });

describe('AffiliateReportPanel', () => {
  beforeEach(() => {
    vi.mocked(referrals.recipients).mockReset();
    vi.mocked(referrals.reportHistory).mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  it('renders with the current { recipients, mail_configured } shape', async () => {
    vi.mocked(referrals.recipients).mockResolvedValue(
      ok({
        recipients: [
          { id: 'a1', referral_code: 'ASL-ABC123', name: 'Biruk Alemu', email: 'b@x.com', has_email: true },
        ],
        mail_configured: true,
      }) as never,
    );
    vi.mocked(referrals.reportHistory).mockResolvedValue(ok([]) as never);

    render(<AffiliateReportPanel affiliates={[]} onMessage={noop} onError={noop} />);

    await waitFor(() => {
      expect(screen.getByText('Sales & Engagement Reports')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText(/Biruk Alemu \(ASL-ABC123\)/)).toBeTruthy();
    });
  });

  it('survives the OLD shape where data was the array itself', async () => {
    // Regression: this is what the endpoint used to return.
    vi.mocked(referrals.recipients).mockResolvedValue(
      ok([
        { id: 'a1', referral_code: 'ASL-ABC123', name: 'Biruk Alemu', email: 'b@x.com', has_email: true },
      ]) as never,
    );
    vi.mocked(referrals.reportHistory).mockResolvedValue(ok([]) as never);

    // Must render rather than throw "Cannot read properties of undefined".
    render(<AffiliateReportPanel affiliates={[]} onMessage={noop} onError={noop} />);

    await waitFor(() => {
      expect(screen.getByText('Sales & Engagement Reports')).toBeTruthy();
    });
    // Falls back to "All affiliates ... (0)" instead of crashing.
    await waitFor(() => {
      expect(screen.getByText(/All affiliates with portal access \(0\)/)).toBeTruthy();
    });
  });

  it('survives a null / undefined data payload', async () => {
    vi.mocked(referrals.recipients).mockResolvedValue(ok(null) as never);
    vi.mocked(referrals.reportHistory).mockResolvedValue(ok(undefined) as never);

    render(<AffiliateReportPanel affiliates={[]} onMessage={noop} onError={noop} />);

    await waitFor(() => {
      expect(screen.getByText('Sales & Engagement Reports')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText(/All affiliates with portal access \(0\)/)).toBeTruthy();
    });
  });

  it('survives a failed recipients request', async () => {
    vi.mocked(referrals.recipients).mockResolvedValue(
      { success: false, error: 'boom' } as never,
    );
    vi.mocked(referrals.reportHistory).mockResolvedValue({ success: false, error: 'boom' } as never);

    const onError = vi.fn();
    render(<AffiliateReportPanel affiliates={[]} onMessage={noop} onError={onError} />);

    await waitFor(() => {
      expect(screen.getByText('Sales & Engagement Reports')).toBeTruthy();
    });
    await waitFor(() => expect(onError).toHaveBeenCalled());
  });

  it('warns that email is not configured when SMTP is missing', async () => {
    vi.mocked(referrals.recipients).mockResolvedValue(
      ok({ recipients: [], mail_configured: false }) as never,
    );
    vi.mocked(referrals.reportHistory).mockResolvedValue(ok([]) as never);

    render(<AffiliateReportPanel affiliates={[]} onMessage={noop} onError={noop} />);

    await waitFor(() => {
      expect(screen.getByText(/Email is not configured/)).toBeTruthy();
    });
  });
});