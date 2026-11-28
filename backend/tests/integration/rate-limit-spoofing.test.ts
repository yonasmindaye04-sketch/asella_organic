/**
 * backend/tests/integration/rate-limit-spoofing.test.ts
 * Asella Organic — The rate limiters cannot be keyed on a caller-chosen
 * address (ASE-2026-010)
 *
 * The bucketing address used to be read straight out of the
 * `x-forwarded-for` request header, taking its FIRST entry. That entry is
 * written by the caller, so every request could carry a different one and
 * land in a different bucket.
 *
 * The login limiter allows 10 attempts per 5 minutes per bucket, so with a
 * spoofed header it allowed unlimited password attempts — the limiter was
 * effectively switched off for the one endpoint where it matters most.
 *
 * The address now comes from `req.ip`, which Express computes under the
 * app's single trust-proxy policy, and that policy now trusts nothing
 * unless the deployment says how many hops to trust.
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";
import bcrypt from "bcryptjs";
import { generateSecret, generateSync } from "otplib";
import crypto from "crypto";

const PASSWORD = ["asella", "ratelimit", "test"].join("-");

/** The address the caller would like the server to believe. */
const SPOOFED = "203.0.113.99";

/** The size of the login bucket. */
const BUCKET_SIZE = 10;

let adminToken: string;
let totpSecret: string;
let productId: string;

beforeAll(async () => {
  totpSecret = generateSecret();
  const hash = await bcrypt.hash(PASSWORD, 10);
  await pool.query(
    `INSERT INTO staff_users
       (id, username, email, password_hash, full_name, role, active,
        two_factor_enabled, two_factor_secret)
     VALUES (UUID(), 'rl_admin', 'rl_admin@test.com', ?, 'Rate Limit Admin', 'admin', 1, 1, ?)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       two_factor_enabled = 1,
       two_factor_secret = VALUES(two_factor_secret),
       active = 1`,
    [hash, totpSecret]
  );

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "rl_admin@test.com", password: PASSWORD });
  adminToken = login.body?.data?.token;

  productId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO products
       (id, name, package_size, price, unit_cost, active, inventory_quantity, low_stock_threshold)
     VALUES (?, ?, '250g', 50.00, 20.00, 1, 500, 10)`,
    [productId, `Rate Limit Item ${Date.now()}`]
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM order_items WHERE order_id IN
                      (SELECT id FROM orders WHERE customer_name = 'Rate Limit Probe')`).catch(() => {});
  await pool.query(`DELETE FROM orders WHERE customer_name = 'Rate Limit Probe'`).catch(() => {});
  await pool.query(`DELETE FROM inventory_movements WHERE product_id = ?`, [productId]).catch(() => {});
  await pool.query(`DELETE FROM stock_snapshots WHERE product_id = ?`, [productId]).catch(() => {});
  await pool.query(`DELETE FROM products WHERE id = ?`, [productId]).catch(() => {});
  await pool.query(`DELETE FROM staff_users WHERE username = 'rl_admin'`).catch(() => {});
  await pool.end();
});

describe("the login limiter buckets on the real client address", () => {
  it("is not thrown off by a forged x-forwarded-for", async () => {
    const attempts: number[] = [];

    // Fifteen attempts, each claiming a different address. They are all the
    // same client, so they must share one bucket — and the bucket must stop
    // admitting them.
    for (let i = 0; i < 15; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .set("X-Forwarded-For", `198.51.100.${i}`)
        .send({ email: "rl_admin@test.com", password: "wrong-password" });
      attempts.push(res.status);
    }

    const allowed = attempts.filter(s => s === 401).length;
    console.log("  login statuses:", JSON.stringify(attempts));

    // The bucket is 10, and the sign-in in beforeAll already used one of
    // them, so at most 10 attempts may be admitted — never all 15.
    expect(allowed).toBeLessThanOrEqual(BUCKET_SIZE);
    expect(attempts).toContain(429);
  });

  it("keeps every request in one bucket, whatever the header claims", async () => {
    // The bucket above is full. A request that claims no address at all is
    // the same client, so it belongs in the same bucket.
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "rl_admin@test.com", password: "wrong-password" });

    expect(res.status).toBe(429);
  });
});

describe("the audit trail records the real client address", () => {
  it("does not store the address the caller put in the header", async () => {
    const created = await request(app)
      .post("/api/orders")
      .send({
        customer_name: "Rate Limit Probe",
        phone: `+2519${Math.floor(1000000 + Math.random() * 8999999)}`,
        city: "Addis Ababa",
        location: "Bole",
        source: "other",
        order_type: "delivery",
        items: [{
          product_id:   productId,
          name:         "Rate Limit Item",
          package_size: "250g",
          quantity:     1,
          unit_price:   50.00,
        }],
      });

    expect(created.status).toBe(201);
    const orderId = created.body?.data?.id;

    const del = await request(app)
      .delete(`/api/orders/${orderId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Forwarded-For", SPOOFED)
      .set("x-2fa-token", generateSync({ secret: totpSecret }))
      .send({ reason: "rate limit probe" });

    expect(del.status).toBe(200);

    const [rows] = await pool.query(
      `SELECT deleted_at_ip FROM orders WHERE id = ?`, [orderId]
    ) as [any[], any];

    // The caller asked the server to believe it came from 203.0.113.99.
    expect(rows[0].deleted_at_ip).not.toBe(SPOOFED);
    // It recorded the peer address instead.
    expect(rows[0].deleted_at_ip).toMatch(/127\.0\.0\.1|::1|::ffff:127\.0\.0\.1/);
  });
});
