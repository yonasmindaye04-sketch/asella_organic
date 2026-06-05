/**
 * frontend/tests/components/StockAlertPage.test.tsx
 * Tests that StockAlertPage calls correct endpoint with correct payload
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import StockAlertPage from "../../src/pages/StockAlertPage";

// Mock DashboardLayout to render children only
vi.mock("../../src/layouts/DashboardLayout", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

// Mock the useProducts hook
vi.mock("../../src/hooks/useProducts", () => ({
  useProducts: () => ({
    loading: false,
    products: [
      { id: "P001", name: "Moringa Powder",  package_size: "250g",  inventory_quantity: 5,  low_stock_threshold: 10 },
      { id: "P002", name: "Black Seed Oil",  package_size: "100ml", inventory_quantity: 15, low_stock_threshold: 10 },
      { id: "P003", name: "Turmeric Powder", package_size: "250g",  inventory_quantity: 0,  low_stock_threshold: 10 },
    ],
  }),
}));

// Mock the api service
const mockPost = vi.fn();
vi.mock("../../src/services/api", () => ({
  api: {
    post: (...args: any[]) => mockPost(...args),
  },
}));

describe("StockAlertPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ success: true, data: { id: "SR-001" } });
  });

  it("renders the Stock Alert form", () => {
    render(<StockAlertPage />);
    expect(screen.getByText("Stock Alert")).toBeInTheDocument();
    expect(screen.getByText("Send Stock Alert")).toBeInTheDocument();
  });

  it("populates product dropdown with fetched products", () => {
    render(<StockAlertPage />);
    expect(screen.getByText("Moringa Powder")).toBeInTheDocument();
    expect(screen.getByText("Black Seed Oil")).toBeInTheDocument();
    expect(screen.getByText("Turmeric Powder")).toBeInTheDocument();
  });

  it("populates size dropdown after selecting a product", async () => {
    render(<StockAlertPage />);

    // Select product name
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "Moringa Powder" } });

    await waitFor(() => {
      expect(screen.getByText("250g")).toBeInTheDocument();
    });
  });

  it("auto-fills stock remaining when product and size selected", async () => {
    render(<StockAlertPage />);

    const selects = screen.getAllByRole("combobox");

    // Select product name
    fireEvent.change(selects[0], { target: { value: "Moringa Powder" } });

    await waitFor(() => screen.getByText("250g"));

    // Select size
    fireEvent.change(selects[1], { target: { value: "250g" } });

    await waitFor(() => {
      const remainingInput = screen.getByPlaceholderText("0") as HTMLInputElement;
      expect(remainingInput.value).toBe("5");
    });
  });

  it("submits to /api/stock/request with correct payload", async () => {
    render(<StockAlertPage />);

    const selects = screen.getAllByRole("combobox");

    // Select product
    fireEvent.change(selects[0], { target: { value: "Moringa Powder" } });
    await waitFor(() => screen.getByText("250g"));
    fireEvent.change(selects[1], { target: { value: "250g" } });

    // Fill other fields
    fireEvent.change(screen.getByPlaceholderText(/Your name or store name/i), {
      target: { value: "Test User" },
    });
    fireEvent.change(screen.getByPlaceholderText(/e.g. 50/i), {
      target: { value: "50" },
    });

    fireEvent.click(screen.getByText("Send Stock Alert"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/api/stock/request",
        expect.objectContaining({
          product_id:   "P001",
          item:         "Moringa Powder",
          package_size: "250g",
          qty_needed:   50,
        })
      );
    });
  });

  it("shows success message after successful submit", async () => {
    render(<StockAlertPage />);

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "Moringa Powder" } });
    await waitFor(() => screen.getByText("250g"));
    fireEvent.change(selects[1], { target: { value: "250g" } });

    fireEvent.change(screen.getByPlaceholderText(/Your name or store name/i), {
      target: { value: "Test User" },
    });
    fireEvent.change(screen.getByPlaceholderText(/e.g. 50/i), {
      target: { value: "20" },
    });

    fireEvent.click(screen.getByText("Send Stock Alert"));

    await waitFor(() => {
      expect(
        screen.getByText(/Stock alert sent for Moringa Powder/i)
      ).toBeInTheDocument();
    });
  });

  it("shows error message on API failure", async () => {
    mockPost.mockRejectedValue({ message: "Validation failed" });

    render(<StockAlertPage />);

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "Moringa Powder" } });
    await waitFor(() => screen.getByText("250g"));
    fireEvent.change(selects[1], { target: { value: "250g" } });

    fireEvent.change(screen.getByPlaceholderText(/Your name or store name/i), {
      target: { value: "Test User" },
    });
    fireEvent.change(screen.getByPlaceholderText(/e.g. 50/i), {
      target: { value: "20" },
    });

    fireEvent.click(screen.getByText("Send Stock Alert"));

    await waitFor(() => {
      expect(screen.getByText(/Validation failed/i)).toBeInTheDocument();
    });
  });
});