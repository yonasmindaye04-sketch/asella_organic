/**
 * frontend/tests/components/KPICards.test.tsx
 * Tests the dashboard KPI cards.
 *
 * KPICards is a presentational component: it receives a `metrics` object from
 * the Dashboard (which does the fetching) and renders four cards from it.
 * Earlier revisions fetched their own data via `fetch`; those tests were left
 * behind when the component was rewritten, so they mocked a transport the
 * component no longer uses and asserted labels it no longer renders.
 */

import { screen, renderWithProviders } from "../utils/renderWithProviders";
import { describe, it, expect } from "vitest";
import KPICards from "../../src/components/dashboard/KPICards";

const METRICS = {
  totalRevenue: 1070,
  netProfit: 720,
  totalOrders: 2,
  deliveredOrders: 1,
  avgOrderValue: 535,
  totalUnitsSold: 4,
  totalExpenses: 350,
  profitMargin: 67,
};

describe("KPICards", () => {
  it("renders the four KPI cards", () => {
    renderWithProviders(<KPICards metrics={METRICS} />);

    expect(screen.getByText("Total Revenue")).toBeInTheDocument();
    expect(screen.getByText("Net Profit")).toBeInTheDocument();
    expect(screen.getByText("Total Orders")).toBeInTheDocument();
    expect(screen.getByText("Avg. Order Value")).toBeInTheDocument();
  });

  it("shows the supplied metric values", () => {
    renderWithProviders(<KPICards metrics={METRICS} />);

    expect(screen.getByText(/1,070/)).toBeInTheDocument();
    expect(screen.getByText(/720/)).toBeInTheDocument();
    expect(screen.getByText(/535/)).toBeInTheDocument();
    // Total orders has no suffix, so it is the bare "2".
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("derives the profit margin when it is not supplied", () => {
    const { profitMargin: _omit, ...withoutMargin } = METRICS;
    renderWithProviders(<KPICards metrics={withoutMargin} />);

    // 720 / 1070 = 67%
    expect(screen.getByText("67% margin")).toBeInTheDocument();
  });

  it("prefers an explicit profit margin when supplied", () => {
    renderWithProviders(<KPICards metrics={{ ...METRICS, profitMargin: 40 }} />);

    expect(screen.getByText("40% margin")).toBeInTheDocument();
  });

  it("renders the delivery badge from orders and delivered", () => {
    renderWithProviders(<KPICards metrics={METRICS} />);

    // 1 delivered of 2 orders = 50%
    expect(screen.getByText("50% delivered")).toBeInTheDocument();
    expect(screen.getByText("1 completed of 2 placed")).toBeInTheDocument();
  });

  it("shows the range label in the revenue subtext", () => {
    renderWithProviders(<KPICards metrics={METRICS} rangeLabel="Last 7 Days" />);

    expect(screen.getByText("Gross sales (Last 7 Days)")).toBeInTheDocument();
  });

  it("falls back to zeroes when no metrics are supplied", () => {
    renderWithProviders(<KPICards />);

    expect(screen.getByText("Total Revenue")).toBeInTheDocument();
    // No NaN or "undefined" should ever reach the DOM.
    expect(document.body.textContent ?? "").not.toContain("NaN");
    expect(document.body.textContent ?? "").not.toContain("undefined");
  });

  it("renders a loss without producing NaN", () => {
    renderWithProviders(
      <KPICards metrics={{ ...METRICS, totalRevenue: 1000, netProfit: -250 }} />
    );

    expect(screen.getByText(/-250/)).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toContain("NaN");
  });
});
