/**
 * backend/tests/unit/inventory.test.ts
 * Asella Organic — Inventory Library Unit Tests
 *
 * Tests src/lib/inventory.ts: recordMovement(), deductOrderStock(),
 * restoreOrderStock() — all DB calls are mocked so no real DB is needed.
 *
 * Run with:
 *   npx jest tests/unit/inventory.test.ts
 */

import { jest } from "@jest/globals";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Mock the DB pool ───────────────────────────────────────────────────────
//
// `jest.fn()` returns a `Mock<UnknownFunction>` whose chained
// `mockResolvedValueOnce(...)` calls collapse to `never` under the
// strict overloads shipped with @types/jest. Casting each mock to
// `jest.MockedFunction<any>` (the single-argument generic form) keeps
// the mock helpers (`mockResolvedValue`, `mockResolvedValueOnce`,
// `mock.calls`, …) while widening the call/return types to `any` so
// chained setup doesn't degrade to `never`. This is purely a type-level
// concern — the runtime behaviour of `jest.fn()` is unchanged.

const mockQuery    = jest.fn() as unknown as jest.MockedFunction<(...args: any[]) => any>;
const mockCommit   = jest.fn() as unknown as jest.MockedFunction<(...args: any[]) => any>;
const mockRollback = jest.fn() as unknown as jest.MockedFunction<(...args: any[]) => any>;
const mockRelease  = jest.fn() as unknown as jest.MockedFunction<(...args: any[]) => any>;
const mockBegin    = jest.fn() as unknown as jest.MockedFunction<(...args: any[]) => any>;

const mockConn = {
  query:            mockQuery,
  beginTransaction: mockBegin,
  commit:           mockCommit,
  rollback:         mockRollback,
  release:          mockRelease,
};

const mockGetConnection = jest.fn() as unknown as jest.MockedFunction<(...args: any[]) => any>;
mockGetConnection.mockResolvedValue(mockConn);

jest.mock("../../src/config/db.js", () => ({
  default: { getConnection: mockGetConnection },
}));

// ── Mock Telegram so no HTTP requests are made ─────────────────────────────

const mockLowStockAlert = jest.fn() as unknown as jest.MockedFunction<(...args: any[]) => any>;
mockLowStockAlert.mockResolvedValue(undefined);

jest.mock("../../src/lib/telegram.js", () => ({
  sendLowStockAlert: (...args: unknown[]) => mockLowStockAlert(...args),
}));

// ── Import SUT after mocks are installed ──────────────────────────────────

import {
  recordMovement,
  deductOrderStock,
  restoreOrderStock,
} from "../../src/lib/inventory.js";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a fake product row returned by the SELECT … FOR UPDATE query */
function makeProductRow(overrides: Partial<{
  id: string; name: string; package_size: string;
  inventory_quantity: number; low_stock_threshold: number;
}> = {}) {
  return {
    id:                 "prod-uuid-001",
    name:               "Moringa",
    package_size:       "100g",
    inventory_quantity: 50,
    low_stock_threshold: 10,
    ...overrides,
  };
}

// ── Reset mocks before each test ─────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockBegin.mockResolvedValue(undefined);
  mockCommit.mockResolvedValue(undefined);
  mockRollback.mockResolvedValue(undefined);
  mockRelease.mockResolvedValue(undefined);
});

// ═══════════════════════════════════════════════════════════════════════════
// recordMovement — happy path
// ═══════════════════════════════════════════════════════════════════════════

describe("recordMovement — happy path", () => {
  it("returns the new quantity and movementId on a successful stock-out", async () => {
    const product = makeProductRow({ inventory_quantity: 50 });
    // query call order: SELECT, UPDATE products, INSERT snapshots, INSERT movements
    mockQuery
      .mockResolvedValueOnce([[product], []])  // SELECT FOR UPDATE
      .mockResolvedValueOnce([[], []])          // UPDATE products
      .mockResolvedValueOnce([[], []])          // INSERT stock_snapshots
      .mockResolvedValueOnce([[], []]);         // INSERT inventory_movements

    const result = await recordMovement({
      productId:    "prod-uuid-001",
      type:         "sale",
      changeAmount: -5,
      performedBy:  "staff-uuid-001",
      reason:       "Order delivered",
    });

    expect(result.newQuantity).toBe(45);
    expect(result.previousQty).toBe(50);
    expect(result.belowThreshold).toBe(false);
    expect(typeof result.movementId).toBe("string");
    expect(result.movementId.length).toBeGreaterThan(0);
  });

  it("opens its own transaction when no existingConn is passed", async () => {
    const product = makeProductRow();
    mockQuery
      .mockResolvedValueOnce([[product], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);

    await recordMovement({
      productId:    "prod-uuid-001",
      type:         "adjustment",
      changeAmount: 10,
      performedBy:  null,
      reason:       "Manual adjustment",
    });

    expect(mockGetConnection).toHaveBeenCalledTimes(1);
    expect(mockBegin).toHaveBeenCalledTimes(1);
    expect(mockCommit).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("does NOT open its own transaction when an existingConn is passed", async () => {
    const product = makeProductRow();
    mockQuery
      .mockResolvedValueOnce([[product], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);

    await recordMovement(
      {
        productId:    "prod-uuid-001",
        type:         "sale",
        changeAmount: -1,
        performedBy:  null,
        reason:       "Shared transaction test",
      },
      mockConn as any   // pass the existing connection
    );

    // No new connection should be fetched
    expect(mockGetConnection).not.toHaveBeenCalled();
    // No commit/rollback because the caller owns the transaction
    expect(mockCommit).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("fires a low-stock Telegram alert when stock crosses the threshold", async () => {
    // Current qty 12, threshold 10, change -5 → finalQty 7 → below threshold
    const product = makeProductRow({ inventory_quantity: 12, low_stock_threshold: 10 });
    mockQuery
      .mockResolvedValueOnce([[product], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);

    const result = await recordMovement({
      productId:    "prod-uuid-001",
      type:         "sale",
      changeAmount: -5,
      performedBy:  null,
      reason:       "Low stock test",
    });

    expect(result.belowThreshold).toBe(true);
    // Allow the non-blocking void promise to settle
    await new Promise(setImmediate);
    expect(mockLowStockAlert).toHaveBeenCalledTimes(1);
    expect(mockLowStockAlert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Moringa", current: 7 })
    );
  });

  it("does NOT fire a low-stock alert on a stock-IN even when below threshold", async () => {
    // Receiving stock when already below threshold should not alert
    const product = makeProductRow({ inventory_quantity: 3, low_stock_threshold: 10 });
    mockQuery
      .mockResolvedValueOnce([[product], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);

    await recordMovement({
      productId:    "prod-uuid-001",
      type:         "purchase_received",
      changeAmount: 5,   // positive = stock in
      performedBy:  null,
      reason:       "PO received",
    });

    await new Promise(setImmediate);
    expect(mockLowStockAlert).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// recordMovement — allowNegative guard
// ═══════════════════════════════════════════════════════════════════════════

describe("recordMovement — allowNegative guard", () => {
  it("throws 'Insufficient stock' when result would be negative (default allowNegative=false)", async () => {
    const product = makeProductRow({ inventory_quantity: 3 });
    mockQuery.mockResolvedValueOnce([[product], []]);

    await expect(
      recordMovement({
        productId:    "prod-uuid-001",
        type:         "sale",
        changeAmount: -10,   // would put stock at -7
        performedBy:  null,
        reason:       "Oversell attempt",
      })
    ).rejects.toThrow(/Insufficient stock/);

    expect(mockRollback).toHaveBeenCalledTimes(1);
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it("allows negative result when allowNegative=true", async () => {
    const product = makeProductRow({ inventory_quantity: 3 });
    mockQuery
      .mockResolvedValueOnce([[product], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);

    const result = await recordMovement({
      productId:     "prod-uuid-001",
      type:          "sale",
      changeAmount:  -10,
      performedBy:   null,
      reason:        "Allowed negative test",
      allowNegative: true,
    });

    // finalQty = Math.max(0, 3 - 10) = 0
    expect(result.newQuantity).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// recordMovement — product not found
// ═══════════════════════════════════════════════════════════════════════════

describe("recordMovement — product not found", () => {
  it("throws and rolls back when product does not exist", async () => {
    mockQuery.mockResolvedValueOnce([[], []]);   // empty product rows

    await expect(
      recordMovement({
        productId:    "nonexistent-uuid",
        type:         "sale",
        changeAmount: -1,
        performedBy:  null,
        reason:       "Product not found test",
      })
    ).rejects.toThrow(/not found/i);

    expect(mockRollback).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// deductOrderStock
// ═══════════════════════════════════════════════════════════════════════════

describe("deductOrderStock", () => {
  it("deducts stock for each item in the order", async () => {
    const items = [
      { quantity: 2, product_id: "prod-001" },
      { quantity: 3, product_id: "prod-002" },
    ];
    const product1 = makeProductRow({ id: "prod-001", inventory_quantity: 20 });
    const product2 = makeProductRow({ id: "prod-002", name: "Turmeric", inventory_quantity: 15 });

    // First call: resolve order items
    mockQuery.mockResolvedValueOnce([items, []]);
    // For each item: SELECT, UPDATE products, INSERT snapshots, INSERT movements
    mockQuery
      .mockResolvedValueOnce([[product1], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[product2], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);

    const results = await deductOrderStock("order-uuid-999", "staff-uuid-001");

    expect(results).toHaveLength(2);
    const [first, second] = results;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first!.productId).toBe("prod-001");
    expect(first!.newQuantity).toBe(18); // 20 - 2
    expect(second!.productId).toBe("prod-002");
    expect(second!.newQuantity).toBe(12); // 15 - 3
    expect(mockCommit).toHaveBeenCalledTimes(1);
  });

  it("rolls back the whole transaction if one item fails", async () => {
    const items = [{ quantity: 999, product_id: "prod-001" }];
    const product = makeProductRow({ inventory_quantity: 5 });

    mockQuery.mockResolvedValueOnce([items, []]);   // resolve items
    mockQuery.mockResolvedValueOnce([[product], []]); // SELECT FOR UPDATE → insufficient stock

    await expect(
      deductOrderStock("order-uuid-fail", null)
    ).rejects.toThrow(/Insufficient stock/);

    expect(mockRollback).toHaveBeenCalledTimes(1);
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it("returns an empty array when the order has no matching products", async () => {
    mockQuery.mockResolvedValueOnce([[], []]);  // no items

    const results = await deductOrderStock("order-uuid-empty", null);
    expect(results).toEqual([]);
    expect(mockCommit).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// restoreOrderStock
// ═══════════════════════════════════════════════════════════════════════════

describe("restoreOrderStock", () => {
  it("restores stock for each item as a 'return' movement", async () => {
    const items = [{ quantity: 2, product_id: "prod-001" }];
    const product = makeProductRow({ inventory_quantity: 18 });

    mockQuery.mockResolvedValueOnce([items, []]);
    mockQuery
      .mockResolvedValueOnce([[product], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);

    await restoreOrderStock("order-uuid-restore", "staff-uuid-001");

    // The movement INSERT should contain a positive change_amount (return = stock in)
    const insertCall = mockQuery.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === "string" && call[0].includes("INSERT INTO inventory_movements")
    );
    expect(insertCall).toBeDefined();
    // change_amount is the 4th bound parameter: [movementId, productId, type, change_amount, ...]
    const boundParams = insertCall![1] as any[];
    expect(boundParams[3]).toBe(2);   // positive quantity = restore

    expect(mockCommit).toHaveBeenCalledTimes(1);
  });

  it("rolls back if a movement fails during restore", async () => {
    const items = [{ quantity: 1, product_id: "prod-001" }];
    mockQuery.mockResolvedValueOnce([items, []]);
    mockQuery.mockResolvedValueOnce([[], []]);  // SELECT returns nothing → throws

    await expect(restoreOrderStock("order-uuid-rb", null)).rejects.toThrow();
    expect(mockRollback).toHaveBeenCalledTimes(1);
  });
});