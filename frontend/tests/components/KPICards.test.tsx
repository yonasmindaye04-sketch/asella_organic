/**
 * frontend/tests/components/KPICards.test.tsx
 * Tests the dashboard KPI cards with mocked API responses
 */

import { render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import axios from "axios";
import KPICards from "../../src/components/dashboard/KPICards";

const mockAxios = axios as any;

const MOCK_ORDERS = [
  { id: "ORD-001", total: "650.00",  status: "Pending",   source: "website"   },
  { id: "ORD-002", total: "420.00",  status: "Delivered", source: "telegram"  },
  { id: "ORD-003", total: "1150.00", status: "Pending",   source: "instagram" },
  { id: "ORD-004", total: "860.00",  status: "Processing",source: "website"   },
];

const MOCK_PRODUCTS = Array.from({ length: 6 }, (_, i) => ({ id: `P${i}`, name: `Product ${i}` }));

describe("KPICards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAxios.get.mockImplementation((url: string) => {
      if (url.includes("/api/orders"))
        return Promise.resolve({ data: { success: true, data: MOCK_ORDERS } });
      if (url.includes("/api/products"))
        return Promise.resolve({ data: { success: true, data: MOCK_PRODUCTS } });
      return Promise.reject(new Error("Unknown URL"));
    });
  });

  it("renders all 5 KPI cards", async () => {
    render(<KPICards />);
    await waitFor(() => {
      expect(screen.getByText("Total Orders")).toBeInTheDocument();
      expect(screen.getByText("Total Revenue")).toBeInTheDocument();
      expect(screen.getByText("Avg. Order Value")).toBeInTheDocument();
      expect(screen.getByText("Pending Orders")).toBeInTheDocument();
      expect(screen.getByText("Products Listed")).toBeInTheDocument();
    });
  });

  it("shows correct total order count", async () => {
    render(<KPICards />);
    await waitFor(() => {
      expect(screen.getByText("4")).toBeInTheDocument();
    });
  });

  it("calculates total revenue correctly", async () => {
    render(<KPICards />);
    // 650 + 420 + 1150 + 860 = 3080
    await waitFor(() => {
      expect(screen.getByText(/3,080/)).toBeInTheDocument();
    });
  });

  it("counts Pending orders using capital-P status", async () => {
    render(<KPICards />);
    // Only ORD-001 and ORD-003 have status === 'Pending'
    await waitFor(() => {
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  it("shows correct product count", async () => {
    render(<KPICards />);
    await waitFor(() => {
      expect(screen.getByText("6")).toBeInTheDocument();
    });
  });

  it("falls back to dummy data on API failure", async () => {
    mockAxios.get.mockRejectedValue(new Error("Network error"));
    render(<KPICards />);
    // Should still render cards (with dummy data), not crash
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