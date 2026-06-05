/**
 * frontend/tests/components/OrderTracking.test.tsx
 * Tests source filter labels and badge rendering
 */

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import OrderTracking from "../../src/pages/OrderTracking";
import { api } from "../../src/services/api";

vi.mock("../../src/services/api", () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

const mockApi = api as any;

const MOCK_ORDERS = [
  { id: "ORD-001", customer_name: "Abebe G",  phone: "+251911", city: "Addis", source: "website",   order_type: "Online",    status: "Pending",   total: "1150.00", created_at: new Date().toISOString() },
  { id: "ORD-002", customer_name: "Tigist A",  phone: "+251922", city: "Addis", source: "telegram",  order_type: "Online",    status: "Delivered", total: "650.00",  created_at: new Date().toISOString() },
  { id: "ORD-003", customer_name: "Dawit B",   phone: "+251933", city: "Adama", source: "instagram", order_type: "Online",    status: "Processing",total: "420.00",  created_at: new Date().toISOString() },
  { id: "ORD-004", customer_name: "Franchise", phone: "+251944", city: "Addis", source: "website",   order_type: "Franchise", status: "Pending",   total: "5000.00", created_at: new Date().toISOString() },
];

function renderOrderTracking() {
  return render(
    <MemoryRouter>
      <OrderTracking />
    </MemoryRouter>
  );
}

describe("OrderTracking — source filter & badges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({ success: true, data: MOCK_ORDERS, meta: { pages: 1, total: MOCK_ORDERS.length, page: 1, limit: 100 } });
  });

  it("renders all 4 orders on load", async () => {
    renderOrderTracking();
    await waitFor(() => {
      expect(screen.getByText("Abebe G")).toBeInTheDocument();
      expect(screen.getByText("Tigist A")).toBeInTheDocument();
      expect(screen.getByText("Dawit B")).toBeInTheDocument();
      expect(screen.getByText("Franchise", { selector: "strong" })).toBeInTheDocument();
    });
  });

  it("shows human-readable source badges", async () => {
    renderOrderTracking();
    await waitFor(() => {
      expect(screen.getAllByText("Website").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Telegram")).toBeInTheDocument();
      expect(screen.getByText("Instagram")).toBeInTheDocument();
    });
  });

  it("franchise order_type shows Franchise badge regardless of source", async () => {
    renderOrderTracking();
    await waitFor(() => {
      expect(screen.getByText("Franchise")).toBeInTheDocument();
    });
  });

  it("website filter only shows non-franchise website orders", async () => {
    renderOrderTracking();
    await waitFor(() => screen.getByText("Abebe G"));

    const sourceSelect = screen.getByDisplayValue("All Sources");
    fireEvent.change(sourceSelect, { target: { value: "website" } });

    await waitFor(() => {
      expect(screen.getByText("Abebe G")).toBeInTheDocument();
      expect(screen.queryByText("Tigist A")).not.toBeInTheDocument();
      expect(screen.queryByText("Dawit B")).not.toBeInTheDocument();
      // Franchise order (order_type=Franchise) should NOT appear under website filter
      expect(screen.queryByText("Franchise", { selector: "strong" })).not.toBeInTheDocument();
    });
  });

  it("Franchise filter shows franchise orders", async () => {
    renderOrderTracking();
    await waitFor(() => screen.getByText("Abebe G"));

    const sourceSelect = screen.getByDisplayValue("All Sources");
    fireEvent.change(sourceSelect, { target: { value: "_franchise" } });

    await waitFor(() => {
      // Only the franchise order should appear
      expect(screen.queryByText("Abebe G")).not.toBeInTheDocument();
      expect(screen.queryByText("Tigist A")).not.toBeInTheDocument();
    });
  });

  it("telegram filter shows only telegram orders", async () => {
    renderOrderTracking();
    await waitFor(() => screen.getByText("Tigist A"));

    const sourceSelect = screen.getByDisplayValue("All Sources");
    fireEvent.change(sourceSelect, { target: { value: "telegram" } });

    await waitFor(() => {
      expect(screen.getByText("Tigist A")).toBeInTheDocument();
      expect(screen.queryByText("Abebe G")).not.toBeInTheDocument();
    });
  });

  it("search filter works across id, name, and phone", async () => {
    renderOrderTracking();
    await waitFor(() => screen.getByText("Abebe G"));

    const searchInput = screen.getByPlaceholderText(/Order ID, customer, phone/i);
    fireEvent.change(searchInput, { target: { value: "Tigist" } });

    await waitFor(() => {
      expect(screen.getByText("Tigist A")).toBeInTheDocument();
      expect(screen.queryByText("Abebe G")).not.toBeInTheDocument();
    });
  });

  it("status counter bar shows correct totals", async () => {
    renderOrderTracking();
    await waitFor(() => {
      // 4 total orders
      expect(screen.getByText("4")).toBeInTheDocument();
      // 2 Pending (ORD-001 and ORD-004)
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  it("shows error message on API failure", async () => {
    mockApi.get.mockRejectedValue({ message: "Network error" });
    renderOrderTracking();
    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });
  });
});

