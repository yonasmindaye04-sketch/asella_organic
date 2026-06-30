/**
 * frontend/tests/components/KPICards.test.tsx
 * Tests the dashboard KPI cards with mocked API responses
 */

import { render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import KPICards from "../../src/components/dashboard/KPICards";

const MOCK_ORDERS = [
  { id: "ORD-001", total: 650.00,  status: "Pending",   items: [] },
  { id: "ORD-002", total: 420.00,  status: "Delivered", items: [] },
  { id: "ORD-003", total: 1150.00, status: "Cancelled", items: [] },
];

const MOCK_EXPENSES_SUMMARY = {
  total_expenses: 350.00,
  this_month: 150.00,
  last_30_days: 200.00,
  total_count: 5,
  avg_monthly: 100.00,
  categories: [],
  monthly: [],
};

describe("KPICards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/orders")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: MOCK_ORDERS }),
        };
      }
      if (url.includes("/api/expenses/summary")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: MOCK_EXPENSES_SUMMARY }),
        };
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ success: false, error: "Not Found" }),
      };
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders all 4 KPI cards", async () => {
    render(<KPICards />);
    await waitFor(() => {
      expect(screen.getByText("Total Revenue")).toBeInTheDocument();
      expect(screen.getByText("Total Expenses")).toBeInTheDocument();
      expect(screen.getByText("Net Profit")).toBeInTheDocument();
      expect(screen.getByText("Total Orders")).toBeInTheDocument();
    });
  });

  it("shows correct total order count excluding cancelled", async () => {
    render(<KPICards />);
    await waitFor(() => {
      // 2 valid orders (ORD-001, ORD-002). ORD-003 is Cancelled.
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  it("calculates total revenue correctly excluding cancelled", async () => {
    render(<KPICards />);
    // 650 + 420 = 1070
    await waitFor(() => {
      expect(screen.getByText(/1,070/)).toBeInTheDocument();
    });
  });

  it("shows correct total expenses", async () => {
    render(<KPICards />);
    // MOCK_EXPENSES_SUMMARY has total_expenses: 350
    await waitFor(() => {
      expect(screen.getByText(/350/)).toBeInTheDocument();
    });
  });

  it("shows correct net profit", async () => {
    render(<KPICards />);
    // 1070 (revenue) - 350 (expenses) = 720
    await waitFor(() => {
      expect(screen.getByText(/720/)).toBeInTheDocument();
    });
  });

  it("falls back gracefully on API failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("Network error");
    }));
    render(<KPICards />);
    // Should still render cards (with 0s or fallback), not crash
    await waitFor(() => {
      expect(screen.getByText("Total Orders")).toBeInTheDocument();
    });
  });

  it("does not show NaN or undefined in any card", async () => {
    render(<KPICards />);
    await waitFor(() => {
      const container = document.body.textContent ?? "";
      expect(container).not.toContain("NaN");
      expect(container).not.toContain("undefined");
    });
  });
});