/**
 * frontend/tests/components/KPICards.test.tsx
 * Tests the dashboard KPI cards with mocked API responses
 */

import { screen, waitFor, renderWithProviders } from "../utils/renderWithProviders";
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

/** KPICards picks its KPI set from state.auth.user.role, so tests must seed one. */
const asRole = (role: string) => ({
  preloadedState: {
    auth: { user: { id: "u1", email: "t@example.com", role }, isAuthenticated: true },
  },
});

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

  it("renders the 4 admin KPI cards for an admin role", async () => {
    renderWithProviders(<KPICards />, asRole("admin"));
    await waitFor(() => {
      expect(screen.getByText("Total Revenue")).toBeInTheDocument();
      expect(screen.getByText("Total Expenses")).toBeInTheDocument();
      expect(screen.getByText("Net Profit")).toBeInTheDocument();
      expect(screen.getByText("Inventory Value")).toBeInTheDocument();
    });
  });

  it("renders the 4 order KPI cards instead for a staff role", async () => {
    // KPICards renders adminKpis OR staffKpis, never both (see isStaff).
    renderWithProviders(<KPICards />, asRole("staff"));
    await waitFor(() => {
      expect(screen.getByText("Total Orders")).toBeInTheDocument();
      expect(screen.getByText("Pending Orders")).toBeInTheDocument();
      expect(screen.getByText("In Progress")).toBeInTheDocument();
      expect(screen.getByText("Completed Orders")).toBeInTheDocument();
      expect(screen.queryByText("Net Profit")).not.toBeInTheDocument();
    });
  });

  it("shows correct total order count excluding cancelled", async () => {
    renderWithProviders(<KPICards />, asRole("staff"));
    await waitFor(() => {
      // 2 valid orders (ORD-001, ORD-002). ORD-003 is Cancelled.
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  it("calculates total revenue correctly excluding cancelled", async () => {
    renderWithProviders(<KPICards />);
    // 650 + 420 = 1070
    await waitFor(() => {
      expect(screen.getByText(/1,070/)).toBeInTheDocument();
    });
  });

  it("shows correct total expenses", async () => {
    renderWithProviders(<KPICards />);
    // MOCK_EXPENSES_SUMMARY has total_expenses: 350
    await waitFor(() => {
      expect(screen.getByText(/350/)).toBeInTheDocument();
    });
  });

  it("shows correct net profit", async () => {
    renderWithProviders(<KPICards />);
    // 1070 (revenue) - 350 (expenses) = 720
    await waitFor(() => {
      expect(screen.getByText(/720/)).toBeInTheDocument();
    });
  });

  it("falls back gracefully on API failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("Network error");
    }));
    renderWithProviders(<KPICards />, asRole("staff"));
    // Should still render cards (with 0s or fallback), not crash
    await waitFor(() => {
      expect(screen.getByText("Total Orders")).toBeInTheDocument();
    });
  });

  it("does not show NaN or undefined in any card", async () => {
    renderWithProviders(<KPICards />);
    await waitFor(() => {
      const container = document.body.textContent ?? "";
      expect(container).not.toContain("NaN");
      expect(container).not.toContain("undefined");
    });
  });
});