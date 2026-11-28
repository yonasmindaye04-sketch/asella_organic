/**
 * backend/tests/integration/idempotency-scope.test.ts
 * Asella Organic — Idempotency key scoping (ASE-2026-006)
 *
 * The idempotency middleware used to run ahead of authentication and stored
 * every key with user_id = NULL, so the key namespace was global. Two
 * consequences, both exercised here:
 *
 *   1. A cached response could be served to a DIFFERENT client. A second
 *      customer reusing a key received the first customer's cached order.
 *   2. Authentication responses were cached like any other, so replaying a
 *      login key returned a previously issued access and refresh token —
 *      a working session for whoever logged in first.
 *
 * The fixes: authentication routes are never cached, and every key is
 * scoped to a caller — the staff id for an authenticated caller, a salted
 * hash of the phone number for an anonymous one.
 *
 * The regression tests below must fail on the unfixed tree: the whole point
 * is that they reproduce the reported behaviour there.
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const PW = ["asella", "idempotency", "test"].join("-");

let adminToken: string;
let productId: string;
let productName: string;

const orderIds: string[] = [];

beforeAll(async () => {
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (UUID(), 'idem_admin', 'idem_admin@test.com', ?, 'Idem Admin', 'admin', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [await bcrypt.hash(PW, 10)]
  );

  // Order lines are priced from the catalogue (ASE-2026-001), so the probe
  // needs a real product to order.
  productId   = crypto.randomUUID();
  productName = `Idem Probe Item ${Date.now()}`;
  await pool.query(
    `INSERT INTO products
       (id, name, package_size, price, unit_cost, active, inventory_quantity, low_stock_threshold)
     VALUES (?, ?, '1kg', 100.00, 40.00, 1, 500, 10)`,
    [productId, productName]
  );

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "idem_admin@test.com", password: PW });
  adminToken = login.body?.data?.token;
});

afterAll(async () => {
  for (const id of orderIds) {
    await pool.query(`DELETE FROM order_items WHERE order_id = ?`, [id]).catch(() => {});
    await pool.query(`DELETE FROM orders WHERE id = ?`, [id]).catch(() => {});
  }
  await pool.query(`DELETE FROM idempotency_keys WHERE idem_key LIKE 'idem-test-%'`).catch(() => {});
  await pool.query(`DELETE FROM staff_users WHERE username = 'idem_admin'`).catch(() => {});
  await pool.query(`DELETE FROM products WHERE id = ?`, [productId]).catch(() => {});
  await pool.end();
});

/**
 * The idempotency record is written from an async `res.on("finish")`
 * handler, so it lands just AFTER the response reaches the client. A test
 * that reads the table the instant the response arrives is racing the
 * write. Poll for the expected number of rows instead.
 */
async function waitForRows(sql: string, params: any[], expected = 1): Promise<any[]> {
  let rows: any[] = [];
  for (let attempt = 0; attempt < 30; attempt++) {
    const [result] = await pool.query(sql, params) as [any[], any];
    rows = result;
    if (rows.length >= expected) return rows;
    await new Promise(r => setTimeout(r, 100));
  }
  return rows;
}

function orderBody(phone: string, _key: string) {
  return {
    customer_name: "Idem Probe",
    phone,
    city:          "Addis Ababa",
    location:      "Bole",
    source:        "other",
    order_type:    "delivery",
    items: [{
      product_id:   productId,
      name:         productName,
      package_size: "1kg",
      quantity:     1,
      unit_price:   100,
    }],
  };
}

// ── 1. Cached authentication responses ───────────────────────────────────────

describe("authentication responses are never cached", () => {
  it("stores nothing for a login that carried an idempotency key", async () => {
    const key = `idem-test-login-${Date.now()}`;

    const res = await request(app)
      .post("/api/auth/login")
      .set("Idempotency-Key", key)
      .send({ email: "idem_admin@test.com", password: PW });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();

    // Nothing about a login may be written to the idempotency cache.
    const rows = await waitForRows(
      `SELECT idem_key FROM idempotency_keys WHERE idem_key = ?`, [key]
    );
    expect(rows.length).toBe(0);
  });

  it("does not replay a cached token when the same login key is sent again", async () => {
    const key = `idem-test-login-replay-${Date.now()}`;

    const first = await request(app)
      .post("/api/auth/login")
      .set("Idempotency-Key", key)
      .send({ email: "idem_admin@test.com", password: PW });

    const second = await request(app)
      .post("/api/auth/login")
      .set("Idempotency-Key", key)
      .send({ email: "idem_admin@test.com", password: PW });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    // A replayed key must not hand back the token that was issued first.
    expect(second.headers["idempotency-replay"]).toBeUndefined();
    expect(second.body.data.token).not.toBe(first.body.data.token);
  });

  it("leaves no token in the idempotency cache for any auth route", async () => {
    const [rows] = await pool.query(
      `SELECT COUNT(*) c FROM idempotency_keys
       WHERE path LIKE '/auth/%' AND response_body IS NOT NULL`
    ) as [any[], any];
    expect(Number(rows[0].c)).toBe(0);
  });

  it("caches an ordinary response as a replayable payload", async () => {
    const key = `idem-test-capture-${Date.now()}`;

    const res = await request(app)
      .post("/api/orders")
      .set("Idempotency-Key", key)
      .send(orderBody("+251911110007", key));
    expect(res.status).toBe(201);
    orderIds.push(res.body.data.id);

    const rows = await waitForRows(
      `SELECT response_body FROM idempotency_keys WHERE idem_key = ?`, [key]
    );
    expect(rows.length).toBe(1);

    // The cached body must be the response object, not a JSON string of
    // it. Express implements res.json() on top of res.send(), so a naive
    // capture stores the serialised text and then encodes it a second
    // time; a replay then hands back a quoted string.
    const cached = typeof rows[0].response_body === "string"
      ? JSON.parse(rows[0].response_body)
      : rows[0].response_body;
    expect(typeof cached).toBe("object");
    expect(cached.data.id).toBe(res.body.data.id);
  });
});

// ── 2. The key namespace must not be global ──────────────────────────────────

describe("an idempotency key belongs to one caller", () => {
  it("does not serve one customer's cached order to another", async () => {
    const key = `idem-test-shared-${Date.now()}`;

    const first = await request(app)
      .post("/api/orders")
      .set("Idempotency-Key", key)
      .send(orderBody("+251911110001", key));

    expect(first.status).toBe(201);
    orderIds.push(first.body.data.id);

    // A DIFFERENT customer, same key, same shape of request.
    const second = await request(app)
      .post("/api/orders")
      .set("Idempotency-Key", key)
      .send(orderBody("+251911110002", key));

    expect(second.status).toBe(201);
    orderIds.push(second.body.data.id);

    // The second customer must get their own order, not the first one's.
    expect(second.body.data.id).not.toBe(first.body.data.id);
    expect(second.headers["idempotency-replay"]).toBeUndefined();
  });

  it("still replays the same customer's own retry", async () => {
    const key = `idem-test-own-retry-${Date.now()}`;

    const first = await request(app)
      .post("/api/orders")
      .set("Idempotency-Key", key)
      .send(orderBody("+251911110003", key));

    expect(first.status).toBe(201);
    orderIds.push(first.body.data.id);

    const second = await request(app)
      .post("/api/orders")
      .set("Idempotency-Key", key)
      .send(orderBody("+251911110003", key));

    expect(second.status).toBe(201);
    // Same caller, same key, same payload — the point of the feature.
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(second.headers["idempotency-replay"]).toBe("true");
  });

  it("stores a different scope for a different caller", async () => {
    const key = `idem-test-scope-${Date.now()}`;

    await request(app)
      .post("/api/orders")
      .set("Idempotency-Key", key)
      .send(orderBody("+251911110004", key));

    await request(app)
      .post("/api/orders")
      .set("Idempotency-Key", key)
      .send(orderBody("+251911110005", key));

    const rows = await waitForRows(
      `SELECT DISTINCT scope_key FROM idempotency_keys WHERE idem_key = ?`, [key], 2
    );

    // Two callers, two scopes. A single shared scope would be the bug.
    expect(rows.length).toBe(2);
  });

  it("does not let one staff account's key reach another's session", async () => {
    const key = `idem-test-staff-${Date.now()}`;

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", key)
      .send(orderBody("+251911110006", key));

    expect(res.status).toBe(201);
    orderIds.push(res.body.data.id);

    const rows = await waitForRows(
      `SELECT user_id, scope_key FROM idempotency_keys WHERE idem_key = ?`, [key]
    );

    // The authenticated caller is recorded as themselves, and the scope is
    // tied to them rather than to the phone number they happened to send.
    expect(rows.length).toBe(1);
    expect(rows[0].user_id).toBeTruthy();
    expect(rows[0].scope_key).not.toBe(rows[0].user_id);
  });
});
