/**
 * backend/tests/integration/idempotency-race.test.ts
 * Asella Organic — Parallel retries must not duplicate an order (ASE-2026-009)
 *
 * The idempotency lookup and the insert used to be two separate
 * statements, so N parallel requests carrying the same key could all miss
 * the cache and all run the handler — and all create an order. Two
 * concurrent retries of one checkout produced two distinct orders.
 *
 * The key is now reserved with an atomic INSERT against the unique index
 * before the handler runs, so exactly one request can own it and the rest
 * wait for its response.
 *
 * The race is intermittent, so this runs several rounds — a single round
 * misses it most of the time.
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";
import crypto from "crypto";

const ROUNDS  = 3;
const PARALLEL = 8;

let productId: string;
let productName: string;
const createdOrderIds: string[] = [];

beforeAll(async () => {
  productId   = crypto.randomUUID();
  productName = `Idem Race Item ${Date.now()}`;
  await pool.query(
    `INSERT INTO products
       (id, name, package_size, price, unit_cost, active, inventory_quantity, low_stock_threshold)
     VALUES (?, ?, '500g', 250.00, 100.00, 1, 5000, 10)`,
    [productId, productName]
  );
});

afterAll(async () => {
  for (const id of createdOrderIds) {
    await pool.query(`DELETE FROM order_items WHERE order_id = ?`, [id]).catch(() => {});
    await pool.query(`DELETE FROM orders WHERE id = ?`, [id]).catch(() => {});
  }
  await pool.query(`DELETE FROM idempotency_keys WHERE idem_key LIKE 'race-test-%'`).catch(() => {});
  await pool.query(`DELETE FROM products WHERE id = ?`, [productId]).catch(() => {});
  await pool.end();
});

function orderBody(phone: string) {
  return {
    customer_name: "Race Probe",
    phone,
    city:          "Addis Ababa",
    location:      "Bole",
    source:        "other",
    order_type:    "delivery",
    items: [{
      product_id:   productId,
      name:         productName,
      package_size: "500g",
      quantity:     1,
    }],
  };
}

describe("parallel retries with one Idempotency-Key", () => {
  it("creates exactly one order per key, however many requests race", async () => {
    for (let round = 1; round <= ROUNDS; round++) {
      const key    = `race-test-${round}-${Date.now()}`;
      const phone  = `+2518${String(round).padStart(3, "0")}${Math.floor(100000 + Math.random() * 899999)}`;
      const body   = orderBody(phone);

      // All of these carry the SAME key, and are fired at the same time.
      const responses = await Promise.all(
        Array.from({ length: PARALLEL }, () =>
          request(app)
            .post("/api/orders")
            .set("Idempotency-Key", key)
            .send(body)
        )
      );

      const statuses = responses.map(r => r.status);
      const ids      = responses.map(r => r.body?.data?.id).filter(Boolean);

      console.log(`  round ${round}: statuses=${JSON.stringify(statuses)} distinct order ids=${new Set(ids).size}`);

      // Every request is answered.
      for (const r of responses) {
        expect(r.status).toBe(201);
      }

      // ...and they all refer to the SAME order.
      expect(new Set(ids).size).toBe(1);
      const orderId = ids[0];
      createdOrderIds.push(orderId);

      // Exactly one order exists for this key.
      const [rows] = await pool.query(
        `SELECT COUNT(*) c FROM orders WHERE customer_name = 'Race Probe' AND phone = ?`,
        [phone]
      ) as [any[], any];
      expect(Number(rows[0].c)).toBe(1);
    }
  });

  it("keeps one cached response per key", async () => {
    const [rows] = await pool.query(
      `SELECT COUNT(*) c, COUNT(DISTINCT idem_key) k
       FROM idempotency_keys WHERE idem_key LIKE 'race-test-%'`
    ) as [any[], any];
    // One row per key — the reservation and its response are the same row.
    expect(Number(rows[0].c)).toBe(Number(rows[0].k));
  });
});
