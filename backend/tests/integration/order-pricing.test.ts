/**
 * backend/tests/integration/order-pricing.test.ts
 * Asella Organic — Server-side order pricing (ASE-2026-001)
 *
 * The order creation endpoints used to accept `unit_price` from the client
 * and sum it into orders.total. A customer could therefore buy a 3000 ETB
 * product for 0.01 ETB, and that total fed revenue reporting and the
 * trg_order_delivered_commission trigger — so it also moved real money to
 * affiliates.
 *
 * The price is now resolved from products.price inside the order
 * transaction. These tests pin that down over the real HTTP stack:
 *   • a client-supplied price is ignored, whatever it claims
 *   • a legacy name/size line is priced from the catalogue too
 *   • a line with no catalogue price is refused rather than priced by the
 *     client
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";
import crypto from "crypto";

const CATALOGUE_PRICE = 1234.56;
const UNIT_COST      = 500.0;

let productId: string;
let productName: string;
const createdOrderIds: string[] = [];

function orderBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    customer_name: "Pricing Probe",
    phone:         "+251900000042",
    city:          "Addis Ababa",
    location:      "Bole",
    source:        "other",
    order_type:    "delivery",
    ...overrides,
  };
}

beforeAll(async () => {
  productId   = crypto.randomUUID();
  productName = `Pricing Probe Herb ${Date.now()}`;

  await pool.query(
    `INSERT INTO products
       (id, name, package_size, price, unit_cost, active, inventory_quantity, low_stock_threshold)
     VALUES (?, ?, '123g', ?, ?, 1, 500, 10)`,
    [productId, productName, CATALOGUE_PRICE, UNIT_COST]
  );
});

afterAll(async () => {
  for (const id of createdOrderIds) {
    await pool.query(`DELETE FROM referral_commissions WHERE order_id = ?`, [id]).catch(() => {});
    await pool.query(`DELETE FROM order_items WHERE order_id = ?`, [id]).catch(() => {});
    await pool.query(`DELETE FROM orders WHERE id = ?`, [id]).catch(() => {});
  }
  await pool.query(`DELETE FROM products WHERE id = ?`, [productId]);
  await pool.end();
});

// ── 1. A client-supplied price must never be used ────────────────────────────

describe("order pricing is taken from the catalogue", () => {
  it("ignores a client price of 0.01 and charges the catalogue price", async () => {
    const res = await request(app)
      .post("/api/orders")
      .send(orderBody({
        items: [{
          product_id:   productId,
          name:         productName,
          package_size: "123g",
          quantity:     2,
          unit_price:   0.01,
        }],
      }));

    expect(res.status).toBe(201);
    createdOrderIds.push(res.body.data.id);

    // 2 × 1234.56 — not 2 × 0.01.
    expect(Number(res.body.data.total)).toBeCloseTo(CATALOGUE_PRICE * 2, 2);

    const [items] = await pool.query(
      `SELECT unit_price FROM order_items WHERE order_id = ?`, [res.body.data.id]
    ) as [any[], any];
    expect(Number(items[0].unit_price)).toBeCloseTo(CATALOGUE_PRICE, 2);
  });

  it("ignores an inflated client price", async () => {
    const res = await request(app)
      .post("/api/orders")
      .send(orderBody({
        phone: "+251900000043",
        items: [{
          product_id:   productId,
          name:         productName,
          package_size: "123g",
          quantity:     1,
          unit_price:   999999,
        }],
      }));

    expect(res.status).toBe(201);
    createdOrderIds.push(res.body.data.id);
    expect(Number(res.body.data.total)).toBeCloseTo(CATALOGUE_PRICE, 2);
  });

  it("keeps the order total in the database equal to the catalogue price", async () => {
    const res = await request(app)
      .post("/api/orders")
      .send(orderBody({
        phone: "+251900000044",
        items: [{
          product_id:   productId,
          name:         productName,
          package_size: "123g",
          quantity:     3,
          unit_price:   0.01,
        }],
      }));

    expect(res.status).toBe(201);
    const orderId = res.body.data.id;
    createdOrderIds.push(orderId);

    const [rows] = await pool.query(`SELECT total FROM orders WHERE id = ?`, [orderId]) as [any[], any];
    expect(Number(rows[0].total)).toBeCloseTo(CATALOGUE_PRICE * 3, 2);
  });

  it("prices a legacy name/size line from the catalogue too", async () => {
    const res = await request(app)
      .post("/api/orders")
      .send(orderBody({
        phone: "+251900000045",
        items: [{
          // No product_id: the legacy Telegram-bot shape.
          name:         productName,
          package_size: "123g",
          quantity:     1,
          unit_price:   0.01,
        }],
      }));

    expect(res.status).toBe(201);
    createdOrderIds.push(res.body.data.id);
    expect(Number(res.body.data.total)).toBeCloseTo(CATALOGUE_PRICE, 2);
  });
});

// ── 2. A line with no server-side price must be refused ──────────────────────

describe("order pricing refuses lines it cannot price", () => {
  it("refuses a line that is not in the catalogue", async () => {
    const res = await request(app)
      .post("/api/orders")
      .send(orderBody({
        phone: "+251900000046",
        items: [{
          name:         "Totally Unlisted Widget",
          package_size: "999g",
          quantity:     1,
          unit_price:   1,
        }],
      }));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/not in the catalogue/i);
  });

  it("refuses an inactive product", async () => {
    const inactiveId = crypto.randomUUID();
    const inactiveName = `Inactive Probe ${Date.now()}`;
    await pool.query(
      `INSERT INTO products
         (id, name, package_size, price, unit_cost, active, inventory_quantity, low_stock_threshold)
       VALUES (?, ?, '123g', ?, ?, 0, 0, 10)`,
      [inactiveId, inactiveName, CATALOGUE_PRICE, UNIT_COST]
    );

    try {
      const res = await request(app)
        .post("/api/orders")
        .send(orderBody({
          phone: "+251900000047",
          items: [{
            product_id:   inactiveId,
            name:         inactiveName,
            package_size: "123g",
            quantity:     1,
            unit_price:   1,
          }],
        }));

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/inactive/i);
    } finally {
      await pool.query(`DELETE FROM products WHERE id = ?`, [inactiveId]);
    }
  });
});

// ── 3. The schema itself must not carry a price ──────────────────────────────

describe("the order schema carries no price", () => {
  it("strips unit_price from the request", async () => {
    const { CreateOrderSchema } = await import("../../src/schemas/index.js");

    const parsed = CreateOrderSchema.safeParse(orderBody({
      items: [{
        product_id:   productId,
        name:         productName,
        package_size: "123g",
        quantity:     1,
        unit_price:   0.01,
      }],
    }));

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    // Zod strips unknown keys, so an older client that still sends
    // unit_price is not rejected — the field simply does not exist.
    expect("unit_price" in parsed.data.items[0]).toBe(false);
  });
});
