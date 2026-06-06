/**
 * backend/tests/unit/inventory.test.ts
 * Asella Organic — Inventory Library Unit Tests
 */

import { jest } from "@jest/globals";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Mock the DB pool ───────────────────────────────────────────────────────
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

jest.mock("../../src/config/db.js", () => ({
  default: { getConnection: (...args: any[]) => mockGetConnection(...args) },
}));

// ── Mock Telegram ──────────────────────────────────────────────────────────
const mockLowStockAlert = jest.fn() as unknown as jest.MockedFunction<(...args: any[]) => any>;

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
function makeProductRow(overrides: Partial<{
  id: string; name: string; package_size: string;
  inventory_quantity: number; low_stock_threshold: number;
}> = {}) {
  return {
    id:                  "prod-uuid-001",
    name:                "Moringa",
    package_size:        "100g",
    inventory_quantity:  50,
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
  mockLowStockAlert.mockResolvedValue(undefined);
  // Set up connection mock INSIDE beforeEach so it's always fresh
  mockGetConnection.mockResolvedValue(mockConn);
});

// ═══════════════════════════════════════════════════════════════════════════
// recordMovement — happy path
// ═══════════════════════════════════════════════════════════════════════════

describe("recordMovement — happy path", () => {
  it("returns the new quantity and movementId on a successful stock-out", async () => {
    const product = makeProductRow({ inventory_quantity: 50 });
    mockQuery
      .mockResolvedValueOnce([[product], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);

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
      mockConn as any
    );

    expect(mockGetConnection).not.toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("fires a low-stock Telegram alert when stock crosses the threshold", async () => {
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
    await new Promise(setImmediate);
    expect(mockLowStockAlert).toHaveBeenCalledTimes(1);
    expect(mockLowStockAlert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Moringa", current: 7 })
    );
  });

  it("does NOT fire a low-stock alert on a stock-IN even when below threshold", async () => {
    const product = makeProductRow({ inventory_quantity: 3, low_stock_threshold: 10 });
    mockQuery
      .mockResolvedValueOnce([[product], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);

    await recordMovement({
      productId:    "prod-uuid-001",
      type:         "purchase_received",
      changeAmount: 5,
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
        changeAmount: -10,
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

    expect(result.newQuantity).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// recordMovement — product not found
// ═══════════════════════════════════════════════════════════════════════════

describe("recordMovement — product not found", () => {
  it("throws and rolls back when product does not exist", async () => {
    mockQuery.mockResolvedValueOnce([[], []]);

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

    mockQuery.mockResolvedValueOnce([items, []]);
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
    expect(first!.newQuantity).toBe(18);
    expect(second!.productId).toBe("prod-002");
    expect(second!.newQuantity).toBe(12);
    expect(mockCommit).toHaveBeenCalledTimes(1);
  });

  it("rolls back the whole transaction if one item fails", async () => {
    const items = [{ quantity: 999, product_id: "prod-001" }];
    const product = makeProductRow({ inventory_quantity: 5 });

    mockQuery.mockResolvedValueOnce([items, []]);
    mockQuery.mockResolvedValueOnce([[product], []]);

    await expect(
      deductOrderStock("order-uuid-fail", null)
    ).rejects.toThrow(/Insufficient stock/);

    expect(mockRollback).toHaveBeenCalledTimes(1);
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it("returns an empty array when the order has no matching products", async () => {
    mockQuery.mockResolvedValueOnce([[], []]);

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

    const insertCall = mockQuery.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === "string" && call[0].includes("INSERT INTO inventory_movements")
    );
    expect(insertCall).toBeDefined();
    const boundParams = insertCall![1] as any[];
    expect(boundParams[3]).toBe(2);
    expect(mockCommit).toHaveBeenCalledTimes(1);
  });

  it("rolls back if a movement fails during restore", async () => {
    const items = [{ quantity: 1, product_id: "prod-001" }];
    mockQuery.mockResolvedValueOnce([items, []]);
    mockQuery.mockResolvedValueOnce([[], []]);

    await expect(restoreOrderStock("order-uuid-rb", null)).rejects.toThrow();
    expect(mockRollback).toHaveBeenCalledTimes(1);
  });
});