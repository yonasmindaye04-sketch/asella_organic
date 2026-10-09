/**
 * backend/tests/unit/customer-activity.test.ts
 * Asella Organic — Customer Activity Timeline Unit Tests
 *
 * Covers activityTypeForStatus, the mapping that decides whether an
 * order status transition lands on the customer timeline as a sale
 * movement, a plain status change, a return, or a cancellation.
 *
 * This is the one piece of the timeline feature with real branching,
 * and getting it wrong is silent: a "Returned" order recorded as a
 * plain status change would hide every return from the Activity tab.
 *
 * No DB, no network. Run with:
 *   npx jest tests/unit/customer-activity.test.ts
 */

import { jest } from "@jest/globals";

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.unstable_mockModule("../../src/config/db.js", () => ({
  default: { query: jest.fn() },
}));

jest.unstable_mockModule("../../src/lib/logger.js", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { default: pool } = await import("../../src/config/db.js");
const { activityTypeForStatus, recordCustomerActivity } =
  await import("../../src/lib/customerActivity.js");

const query = pool.query as unknown as jest.Mock;

describe("activityTypeForStatus", () => {
  it("maps delivery and every intermediate step to a plain status change", () => {
    for (const status of [
      "Confirmed", "Packed", "Processing", "In Transit",
      "Out for Delivery", "Delivered",
    ]) {
      expect(activityTypeForStatus(status, "Pending")).toBe("status_change");
    }
  });

  it("maps Returned and Cancelled to their own movement types", () => {
    expect(activityTypeForStatus("Returned", "Delivered")).toBe("return");
    expect(activityTypeForStatus("Cancelled", "Pending")).toBe("cancellation");
  });

  it("treats Issue as a return, since stock came back", () => {
    // orders.ts restores stock for Issue and returns reverse the
    // affiliate commission, so it must be visible as a return.
    expect(activityTypeForStatus("Issue", "Delivered")).toBe("return");
  });

  it("returns null when the status did not actually change", () => {
    // Recording a no-op transition would put a duplicate entry on the
    // timeline for an update that changed nothing.
    expect(activityTypeForStatus("Pending", "Pending")).toBeNull();
    expect(activityTypeForStatus("Delivered", "Delivered")).toBeNull();
  });

  it("records a move out of Returned rather than treating it as void", () => {
    expect(activityTypeForStatus("In Transit", "Returned")).toBe("status_change");
  });

  it("tolerates surrounding whitespace and a missing previous status", () => {
    expect(activityTypeForStatus("  Delivered  ", " Pending ")).toBe("status_change");
    expect(activityTypeForStatus("Cancelled", null)).toBe("cancellation");
    expect(activityTypeForStatus("Returned")).toBe("return");
  });
});

describe("recordCustomerActivity", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("inserts with the full movement payload", async () => {
    query.mockResolvedValueOnce([[{ id: "cust-1" }]]);

    const id = await recordCustomerActivity({
      phone: "0911223344",
      orderId: "ORD-20260101-AB12",
      activityType: "return",
      title: "Order ORD-20260101-AB12 returned",
      detail: "Customer not available",
      amount: -1500,
      statusFrom: "Delivered",
      statusTo: "Returned",
      actorName: "sam",
    });

    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(query).toHaveBeenCalledTimes(2);

    // First call resolves the customer by phone.
    expect(query.mock.calls[0][0]).toContain("FROM customers WHERE phone");
    expect(query.mock.calls[0][1]).toEqual(["0911223344"]);

    // Second writes the row. A return must carry a negative amount so
    // the timeline nets out against the original sale.
    const [sql, params] = query.mock.calls[1];
    expect(sql).toContain("INSERT INTO customer_activity");
    expect(params[1]).toBe("cust-1");
    expect(params[3]).toBe("return");
    expect(params[6]).toBe(-1500);
    expect(params[8]).toBe("Returned");
  });

  it("skips the lookup when customerId is already known", async () => {
    query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await recordCustomerActivity({
      customerId: "cust-9",
      activityType: "note",
      title: "Note added",
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1][1]).toBe("cust-9");
  });

  it("skips the write when no customer row can be resolved", async () => {
    query.mockResolvedValueOnce([[]]);

    const id = await recordCustomerActivity({
      phone: "0999999999",
      activityType: "sale",
      title: "Order placed",
    });

    // Not an error — the order is still on `orders`. Returning null
    // lets the caller carry on without a timeline entry.
    expect(id).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("swallows database errors so the order write is never blocked", async () => {
    // The critical invariant: a timeline failure must not roll back or
    // reject an order status change that already applied its stock
    // movement.
    query.mockRejectedValueOnce(new Error("ER_NO_SUCH_TABLE"));

    const id = await recordCustomerActivity({
      customerId: "cust-1",
      activityType: "sale",
      title: "Order placed",
    });

    expect(id).toBeNull();
  });

  it("returns null rather than throwing on a rejected insert", async () => {
    query.mockResolvedValueOnce([[{ id: "cust-1" }]]);
    query.mockRejectedValueOnce(new Error("deadlock"));

    await expect(
      recordCustomerActivity({ phone: "0911", activityType: "sale", title: "x" })
    ).resolves.toBeNull();
  });
});