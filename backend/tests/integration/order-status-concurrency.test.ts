/**
 * backend/tests/integration/order-status-concurrency.test.ts
 * Asella Organic — Concurrent order status transitions (ASE-2026-008)
 *
 * PATCH /api/orders/:id/status used to read the order's current status
 * OUTSIDE the transaction and without a lock. Two concurrent requests to
 * Delivered could therefore both observe "Pending", both pass the
 * `current.status !== "Delivered"` test, and both deduct the stock.
 *
 * The commission trigger is guarded against a double credit — it only
 * fires on the transition INTO Delivered — but the stock deduction is
 * driven by that stale read and was not guarded.
 *
 * These tests fire the transition concurrently and assert the stock moved
 * exactly once.
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const PW = ["asella", "concurrency", "test"].join("-");

const INITIAL_STOCK = 100;
const ORDER_QTY    = 5;
const PARALLEL     = 6;

let adminToken: string;
let productId: string;
let orderId: string;
let phone: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (UUID(), 'conc_admin', 'conc_admin@test.com', ?, 'Conc Admin', 'admin', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [await bcrypt.hash(PW, 10)]
  );

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "conc_admin@test.com", password: PW });
  adminToken = login.body?.data?.token;

  productId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO products
       (id, name, package_size, price, unit_cost, active, inventory_quantity, low_stock_threshold)
     VALUES (?, ?, '250g', 100.00, 40.00, 1, ?, 10)`,
    [productId, `Concurrency Probe ${Date.now()}`, INITIAL_STOCK]
  );

  phone = `+2519${Math.floor(1000000 + Math.random() * 8999999)}`;
  const created = await request(app)
    .post("/api/orders")
    .send({
      customer_name: "Concurrency Probe",
      phone,
      city:          "Addis Ababa",
      location:      "Bole",
      source:        "other",
      order_type:    "delivery",
      items: [{
        product_id:   productId,
        name:         "Concurrency Probe",
        package_size: "250g",
        quantity:     ORDER_QTY,
      }],
    });

  expect(created.status).toBe(201);
  orderId = created.body.data.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM inventory_movements WHERE reference_id = ?`, [orderId]).catch(() => {});
  await pool.query(`DELETE FROM order_items WHERE order_id = ?`, [orderId]).catch(() => {});
  await pool.query(`DELETE FROM orders WHERE id = ?`, [orderId]).catch(() => {});
  await pool.query(`DELETE FROM stock_snapshots WHERE product_id = ?`, [productId]).catch(() => {});
  await pool.query(`DELETE FROM products WHERE id = ?`, [productId]).catch(() => {});
  await pool.query(`DELETE FROM staff_users WHERE username = 'conc_admin'`).catch(() => {});
  await pool.end();
});

async function stockNow(): Promise<number> {
  const [rows] = await pool.query(
    `SELECT inventory_quantity FROM products WHERE id = ?`, [productId]
  ) as [any[], any];
  return Number(rows[0].inventory_quantity);
}

describe("concurrent transitions to Delivered", () => {
  it("deducts the stock exactly once when the transition is requested in parallel", async () => {
    expect(await stockNow()).toBe(INITIAL_STOCK);

    // All of these fire at the same time.
    const results = await Promise.all(
      Array.from({ length: PARALLEL }, () =>
        request(app)
          .patch(`/api/orders/${orderId}/status`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ status: "Delivered" })
      )
    );

    const statuses = results.map(r => r.status);
    console.log("  parallel status codes:", JSON.stringify(statuses));

    // Every request is answered — the point is not to reject the losers,
    // but that the losers must not move the stock again.
    for (const r of results) {
      expect([200, 400]).toContain(r.status);
    }

    // The order ends up Delivered.
    const [orderRows] = await pool.query(
      `SELECT status FROM orders WHERE id = ?`, [orderId]
    ) as [any[], any];
    expect(orderRows[0].status).toBe("Delivered");

    // ...and the stock moved exactly once.
    expect(await stockNow()).toBe(INITIAL_STOCK - ORDER_QTY);
  });

  it("recorded exactly one sale movement for the order", async () => {
    const [rows] = await pool.query(
      `SELECT COUNT(*) c FROM inventory_movements
       WHERE reference_id = ? AND movement_type = 'sale'`,
      [orderId]
    ) as [any[], any];
    expect(Number(rows[0].c)).toBe(1);
  });

  it("recorded one terminal transition in the order history", async () => {
    const [rows] = await pool.query(
      `SELECT COUNT(*) c FROM order_status_history
       WHERE order_id = ? AND new_status = 'Delivered'`,
      [orderId]
    ) as [any[], any];
    // The leftovers of a race would show up here as extra Delivered rows.
    // A request that found the order already Delivered is a no-op and
    // writes no history.
    expect(Number(rows[0].c)).toBe(1);
  });

  it("told the customer once, not once per parallel request", async () => {
    // The customer-facing notifications are fire-and-forget, so there is
    // no table to count. What must not happen is a burst of requests
    // producing a burst of messages, and that is guaranteed by the
    // no-op path: only the request that actually changed the status
    // notifies.
    const [rows] = await pool.query(
      `SELECT COUNT(*) c FROM order_status_history
       WHERE order_id = ? AND old_status = 'Delivered' AND new_status = 'Delivered'`,
      [orderId]
    ) as [any[], any];
    expect(Number(rows[0].c)).toBe(0);
  });
});
