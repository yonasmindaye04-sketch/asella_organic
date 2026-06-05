/**
 * frontend/tests/components/StockAlertPage.test.tsx
 * Tests that StockAlertPage calls correct endpoint with correct payload
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import axios from "axios";
import StockAlertPage from "../../src/pages/StockAlertPage";

// Mock DashboardLayout to render children only
vi.mock("../../src/layouts/DashboardLayout", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

const mockAxios = axios as any;

const MOCK_PRODUCTS = [
  { id: "P001", name: "Moringa Powder",  package_size: "250g", inventory_quantity: 5, low_stock_threshold: 10 },
  { id: "P002", name: "Black Seed Oil",  package_size: "100ml", inventory_quantity: 15, low_stock_threshold: 10 },
  { id: "P003", name: "Turmeric Powder", package_size: "250g", inventory_quantity: 0, low_stock_threshold: 10 },
];

describe("StockAlertPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Products fetch on mount
    mockAxios.get.mockResolvedValue({ data: { success: true, data: MOCK_PRODUCTS } });
    // Default successful POST
    mockAxios.post.mockResolvedValue({ data: { success: true, data: { id: "SR-001" } } });
  });

  it("fetches real products from /api/products on mount", async () => {
    render(<StockAlertPage />);
    await waitFor(() => {
      expect(mockAxios.get).toHaveBeenCalledWith("/api/products?limit=100");
    });
  });

  it("populates product dropdown with fetched products", async () => {
    render(<StockAlertPage />);
    await waitFor(() => {
      expect(screen.getByText(/Moringa Powder — 250g/)).toBeInTheDocument();
      expect(screen.getByText(/Black Seed Oil — 100ml/)).toBeInTheDocument();
    });
  });

  it("auto-fills item name and package_size when product selected", async () => {
    render(<StockAlertPage />);
    await waitFor(() => screen.getByText(/Moringa Powder — 250g/));

    const select = screen.getByRole("combobox", { name: /product/i });
    fireEvent.change(select, { target: { value: "P001" } });

    await waitFor(() => {
      const remainingInput = screen.getByLabelText(/Stock Remaining/i) as HTMLInputElement;
      expect(remainingInput.value).toBe("5");
    });
  });

  it("submits to /api/stock/request (NOT /api/orders)", async () => {
    render(<StockAlertPage />);
    await waitFor(() => screen.getByText(/Moringa Powder — 250g/));

    // Fill select
    const select = screen.getByRole("combobox", { name: /product/i });
    fireEvent.change(select, { target: { value: "P001" } });

    // Fill other fields
    fireEvent.change(screen.getByLabelText(/Requested By/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/Quantity Needed/i), { target: { value: "50" } });

    const dateInput = screen.getByLabelText(/Needed By/i) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-07-01" } });

    fireEvent.click(screen.getByText("Send Stock Alert"));

    await waitFor(() => {
      expect(mockAxios.post).toHaveBeenCalledWith(
        "/api/stock/request",
        expect.objectContaining({
          product_id:   "P001",
          item:         "Moringa Powder",
          qty_needed:   50,
          requested_by: "Test User",
        })
      );
      // Must NOT have called /api/orders
      const ordersCalls = (mockAxios.post.mock.calls as string[][]).filter(
        ([url]) => url === "/api/orders"
      );
      expect(ordersCalls).toHaveLength(0);
    });
  });

  it("shows success message after successful submit", async () => {
    render(<StockAlertPage />);
    await waitFor(() => screen.getByText(/Moringa Powder — 250g/));

    const select = screen.getByRole("combobox", { name: /product/i });
    fireEvent.change(select, { target: { value: "P001" } });

    fireEvent.change(screen.getByLabelText(/Requested By/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/Quantity Needed/i), { target: { value: "20" } });
    const dateInput = screen.getByLabelText(/Needed By/i);
    fireEvent.change(dateInput, { target: { value: "2026-07-01" } });

    fireEvent.click(screen.getByText("Send Stock Alert"));

    await waitFor(() => {
      expect(screen.getByText(/Stock alert sent for Moringa Powder/i)).toBeInTheDocument();
    });
  });

  it("shows error message on API failure", async () => {
    mockAxios.post.mockRejectedValue({
      message: "Validation failed"
    });

    render(<StockAlertPage />);
    await waitFor(() => screen.getByText(/Moringa Powder — 250g/));

    const select = screen.getByRole("combobox", { name: /product/i });
    fireEvent.change(select, { target: { value: "P001" } });

    fireEvent.change(screen.getByLabelText(/Requested By/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/Quantity Needed/i), { target: { value: "20" } });
    const dateInput = screen.getByLabelText(/Needed By/i);
    fireEvent.change(dateInput, { target: { value: "2026-07-01" } });

    fireEvent.click(screen.getByText("Send Stock Alert"));

    await waitFor(() => {
      expect(screen.getByText(/Validation failed/i)).toBeInTheDocument();
    });
  });
});