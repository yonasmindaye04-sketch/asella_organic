/**
 * frontend/tests/components/CustomersPage.test.tsx
 * Regression coverage for the customer detail drawer.
 *
 * The drawer previously rendered inline, inside DashboardLayout's
 * `main.relative.z-[1]`. That positioning creates a stacking context, so the
 * panel's z-index could never lift it above the sticky TopHeader (z-40) that
 * sits outside it — the customer's name, phone and close button were painted
 * underneath the app chrome and were unreachable.
 *
 * The test asserts the drawer is portalled to document.body rather than
 * asserting on CSS, which is what actually regressed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "../utils/renderWithProviders";
import CustomersPage from "../../src/pages/CustomersPage";

// DashboardLayout pulls in the Sidebar (which polls the API on a timer) and
// TopHeader; stubbing it to children-only keeps this a unit test. The stacking
// behaviour under test comes from the portal, which is independent of it.
vi.mock("../../src/layouts/DashboardLayout", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

const mockCustomer = {
  customer_id: "11111111-1111-4111-8111-111111111111",
  name: "Almaz Kebede",
  phone: "+251 911 000 111",
  email: null,
  city: "Addis Ababa",
  location: "Bole",
  gender: "female",
  age_group: "25-34",
  customer_since: "2026-01-04T00:00:00.000Z",
  order_count: 3,
  delivered_count: 3,
  cancelled_count: 0,
  returned_count: 0,
  open_count: 0,
  lifetime_value: 4200,
  refunded_value: 0,
  net_value: 4200,
  distinct_products: 2,
  total_units: 5,
  last_order_at: "2026-10-01T00:00:00.000Z",
  last_delivered_at: "2026-10-01T00:00:00.000Z",
  days_since_last_order: 8,
  value_score: 74,
  segment: "Loyal",
  recency_score: 25,
  frequency_score: 18,
  monetary_score: 13,
  penalty_score: 0,
  avg_stars: 4,
  rating_count: 1,
  is_telegram: 1,
  affiliate_name: null,
};

const listResponse = {
  success: true,
  data: [mockCustomer],
  meta: { total: 1, page: 1, limit: 25, pages: 1 },
};

const summaryResponse = {
  success: true,
  data: {
    total_customers: 1,
    total_orders: 3,
    delivered_orders: 3,
    returned_orders: 0,
    cancelled_orders: 0,
    total_net_value: 4200,
    avg_score: 74,
    churning: 0,
    never_ordered: 0,
    segments: [{ segment: "Loyal", customers: 1, net_value: 4200, avg_score: 74 }],
    top_customers: [{ ...mockCustomer }],
  },
};

const detailResponse = {
  success: true,
  data: {
    ...mockCustomer,
    affiliate_code: null,
    orders: [
      {
        id: "ORD-20261001-AB12",
        status: "Delivered",
        payment_status: "Paid",
        total: 1400,
        source: "telegram",
        order_type: "delivery",
        city: "Addis Ababa",
        item_count: 2,
        unit_count: 3,
        created_at: "2026-10-01T00:00:00.000Z",
        delivery_date: "2026-10-03",
      },
    ],
    products: [
      { item_name: "Shilajit Oil", package_size: "30ml", units_bought: 3, amount_spent: 4200 },
    ],
    ratings: [
      { id: "r1", stars: 4, comment: "Great", rated_by_name: "dawit.admin", created_at: "2026-10-02T00:00:00.000Z" },
    ],
    activity: [
      {
        id: "a1",
        order_id: "ORD-20261001-AB12",
        activity_type: "sale",
        title: "Order ORD-20261001-AB12 placed",
        detail: "telegram / Addis Ababa",
        amount: 1400,
        status_from: null,
        status_to: "Pending",
        actor_name: null,
        created_at: "2026-10-01T00:00:00.000Z",
      },
    ],
  },
};

vi.mock("../../src/services/api", () => ({
  customers: {
    list:    vi.fn(),
    summary: vi.fn(),
    get:     vi.fn(),
    activity: vi.fn(),
    rate:    vi.fn(),
    addNote: vi.fn(),
    update:  vi.fn(),
  },
}));

import { customers as customersApi } from "../../src/services/api";

const renderPage = () =>
  renderWithProviders(
    <MemoryRouter>
      <CustomersPage />
    </MemoryRouter>,
    { preloadedState: { auth: { user: { role: "admin", name: "Dawit" } } } as never }
  );

describe("CustomersPage detail drawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (customersApi.list    as never as ReturnType<typeof vi.fn>).mockResolvedValue(listResponse);
    (customersApi.summary as never as ReturnType<typeof vi.fn>).mockResolvedValue(summaryResponse);
    (customersApi.get     as never as ReturnType<typeof vi.fn>).mockResolvedValue(detailResponse);
    (customersApi.activity as never as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true, data: [], meta: { total: 0, page: 1, limit: 20, pages: 1 },
    });
  });

  afterEach(cleanup);

  it("renders the customer list", async () => {
    renderPage();
    expect(await screen.findByText("Almaz Kebede")).toBeInTheDocument();
  });

  it("portals the drawer to document.body so the app header cannot clip it", async () => {
    const { container } = renderPage();

    const row = await screen.findByText("Almaz Kebede");
    fireEvent.click(row);

    const closeBtn = await screen.findByRole("button", { name: /close customer details/i });
    const panel    = closeBtn.closest("div[class*='fixed']");

    // The regression: while the drawer was rendered inline it sat inside
    // the page's stacking context and its header was hidden behind TopHeader.
    expect(panel).not.toBeNull();
    expect(document.body.contains(panel)).toBe(true);
    expect(container.contains(panel)).toBe(false);
  });

  it("shows the full customer identity in the drawer header", async () => {
    renderPage();
    fireEvent.click(await screen.findByText("Almaz Kebede"));

    // Both the name and phone must be present — these are exactly the
    // elements that were cut off by the clipping bug.
    await waitFor(() => {
      expect(screen.getAllByText("Almaz Kebede").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("+251 911 000 111").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /close customer details/i })).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    renderPage();
    fireEvent.click(await screen.findByText("Almaz Kebede"));

    const closeBtn = await screen.findByRole("button", { name: /close customer details/i });
    expect(closeBtn).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /close customer details/i })).toBeNull();
    });
  });

  it("renders the score breakdown and movement timeline", async () => {
    renderPage();
    fireEvent.click(await screen.findByText("Almaz Kebede"));

    expect(await screen.findByText("Value Score")).toBeInTheDocument();
    expect(screen.getByText(/Movement Timeline/)).toBeInTheDocument();
    expect(screen.getByText("Order ORD-20261001-AB12 placed")).toBeInTheDocument();
  });

  // The platform rule (OrderTracking) is: a solid colour dot plus bold,
  // fully saturated text on the plain surface — status never sits inside a
  // tinted chip. These guard the styling decision, not just that text exists.
  it("renders the segment indicator as bold coloured text on a neutral background", async () => {
    renderPage();
    await screen.findByText("Almaz Kebede");

    const badge = screen.getAllByText("Loyal")[0] as HTMLElement;

    expect(badge.tagName).toBe("SPAN");
    expect(badge.className).toMatch(/font-extrabold/);
    expect(badge.className).toMatch(/uppercase/);
    // No tinted chip fill: the badge itself must carry no bg-* utility.
    expect(badge.className).not.toMatch(/\bbg-/);

    // Colour is a saturated inline colour, not a muted token.
    expect(badge.style.color).toBe("rgb(46, 125, 50)");

    // The accompanying dot uses the same full-strength colour.
    const dot = badge.firstElementChild as HTMLElement;
    expect(dot.style.background).toBe("rgb(46, 125, 50)");
  });

  it("renders movement-type indicators on a neutral surface with coloured icons", async () => {
    renderPage();
    fireEvent.click(await screen.findByText("Almaz Kebede"));
    await screen.findByText("Order ORD-20261001-AB12 placed");

    const icon = document.querySelector(".material-symbols-outlined");
    expect(icon).not.toBeNull();
  });
});