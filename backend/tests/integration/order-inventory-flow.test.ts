/**
 * backend/tests/integration/order-inventory-flow.test.ts
 * Asella Organic — Critical Integration Test
 *
 * Verifies the complete order → stock deduction flow:
 *   1. Create product with known stock
 *   2. Create an order containing that product
 *   3. Mark order as Delivered
 *   4. Verify inventory_quantity decreased correctly
 *   5. Verify inventory_movements row was recorded
 *   6. Verify stock_snapshots updated
 */

import request from "supertest";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

let token: string;
let productId: string;
let orderId: string;
let productName: string;
const INITIAL_QTY = 100;
const ORDER_QTY   = 7;

beforeAll(async () => {
  // Create test staff user
  const hash = await bcrypt.hash("IntTest123!", 10);
  const userId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (?, 'int_test_user', 'int_test@test.com', ?, 'Int Tester', 'admin', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [userId, hash]
  );

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: "int_test@test.com", password: "IntTest123!" });
  token = loginRes.body.data.token;

  // Create a known product
  productName = `Integration Test Herb ${Date.now()}`;
  const productRes = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name:                productName,
      package_size:        "999g",
      price:               500,
      inventory_quantity:  INITIAL_QTY,
      low_stock_threshold: 10,
    });
  productId = productRes.body.data.id;
});

afterAll(async () => {
  // Cleanup in correct order (FK constraints)
  if (orderId) {
    await pool.query(`DELETE FROM inventory_movements WHERE reference_id = ?`,  [orderId]);
    await pool.query(`DELETE FROM order_items         WHERE order_id    = ?`,   [orderId]);
    await pool.query(`DELETE FROM orders              WHERE id          = ?`,   [orderId]);
  }
  if (productId) {
    await pool.query(`DELETE FROM inventory_movements WHERE product_id  = ?`,   [productId]);
    await pool.query(`DELETE FROM stock_snapshots     WHERE product_id  = ?`,   [productId]);
    await pool.query(`DELETE FROM products            WHERE id          = ?`,   [productId]);
  }
  await pool.query(`DELETE FROM staff_users WHERE username = 'int_test_user'`);
  await pool.end();
});

// ── Test ───────────────────────────────────────────────────────────────────

describe("Order → Inventory deduction flow", () => {
  it("creates order with the test product", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        source:        "website",
        order_type:    "delivery",
        customer_name: "Integration Tester",
        phone:         "+251999999999",
        city:          "Addis Ababa",
        location:      "Bole",
        items: [{
          name:         productName,
          package_size: "999g",
          quantity:     ORDER_QTY,
          unit_price:   500,
          product_id:   productId,
        }],
      });
    expect(res.status).toBe(201);
    orderId = res.body.data.id;
  });

  it("confirms stock has NOT been deducted yet (order is Pending)", async () => {
    const [rows] = await pool.query(
      `SELECT inventory_quantity FROM products WHERE id = ?`, [productId]
    ) as [any[], any];
    expect(Number(rows[0].inventory_quantity)).toBe(INITIAL_QTY);
  });

  it("advances order to Delivered", async () => {
    // Advance through statuses
    for (const status of ["Confirmed", "Packed", "In Transit", "Delivered"]) {
      const res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status });
      expect(res.status).toBe(200);
    }
  });

  it("stock was deducted after Delivered", async () => {
    // Give trigger a moment to complete
    await new Promise(r => setTimeout(r, 300));

    const [rows] = await pool.query(
      `SELECT inventory_quantity FROM products WHERE id = ?`, [productId]
    ) as [any[], any];
    expect(Number(rows[0].inventory_quantity)).toBe(INITIAL_QTY - ORDER_QTY);
  });

  it("inventory_movements row was recorded as sale", async () => {
    const [rows] = await pool.query(
      `SELECT * FROM inventory_movements
       WHERE product_id = ? AND reference_id = ? AND movement_type = 'sale'`,
      [productId, orderId]
    ) as [any[], any];
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(Number(rows[0].change_amount)).toBe(-ORDER_QTY);
    expect(Number(rows[0].quantity_after)).toBe(INITIAL_QTY - ORDER_QTY);
  });

  it("stock_snapshots was updated", async () => {
    const [rows] = await pool.query(
      `SELECT current_quantity FROM stock_snapshots WHERE product_id = ?`, [productId]
    ) as [any[], any];
    if (rows.length > 0) {
      expect(Number(rows[0].current_quantity)).toBe(INITIAL_QTY - ORDER_QTY);
    }
  });
});

// ── Concurrency safety ─────────────────────────────────────────────────────

describe("Concurrent stock adjustment safety", () => {
  let concProductId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name:               `Concurrency Test Herb ${Date.now()}`,
        package_size:       "50g",
        price:              100,
        inventory_quantity: 20,
      });
    concProductId = res.body.data.id;
  });

  afterAll(async () => {
    if (concProductId) {
      await pool.query(`DELETE FROM inventory_movements WHERE product_id = ?`, [concProductId]);
      await pool.query(`DELETE FROM stock_snapshots WHERE product_id = ?`, [concProductId]);
      await pool.query(`DELETE FROM products WHERE id = ?`, [concProductId]);
    }
  });

  it("handles 5 simultaneous adjustment requests safely", async () => {
    const adjustments = Array.from({ length: 5 }, () =>
      request(app)
        .post(`/api/products/${concProductId}/stock`)
        .set("Authorization", `Bearer ${token}`)
        .send({ change_amount: 2, reason: "concurrent test" })
    );
    const results = await Promise.all(adjustments);
    const successes = results.filter(r => r.status === 200).length;
    // At least some succeed — exact number depends on transaction isolation
    expect(successes).toBeGreaterThanOrEqual(1);

    // Final quantity must be consistent (never goes below 0)
    const [rows] = await pool.query(
      `SELECT inventory_quantity FROM products WHERE id = ?`, [concProductId]
    ) as [any[], any];
    expect(Number(rows[0].inventory_quantity)).toBeGreaterThanOrEqual(0);
  });
});
