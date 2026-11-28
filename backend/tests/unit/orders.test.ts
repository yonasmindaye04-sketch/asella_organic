/**
 * backend/tests/unit/orders.test.ts
 * Asella Organic — Orders Route Tests
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import request from "supertest";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

let token: string;

// ASE-2026-001: the order price comes from the catalogue, so the line has
// to name a product that is actually in it. The test owns its product so
// it does not depend on whatever the catalog happens to hold.
const TEST_PRODUCT_ID = crypto.randomUUID();
const TEST_PRODUCT_NAME = "Moringa Powder Order Test";
const TEST_PRODUCT_SIZE = "250g";
const TEST_PRODUCT_PRICE = 350;

const TEST_ORDER = {
  source:        "website",
  order_type:    "delivery",
  customer_name: "Test Customer",
  phone:         "+251900000001",
  location:      "Bole",
  city:          "Addis Ababa",
  items: [
    {
      product_id:   TEST_PRODUCT_ID,
      name:         TEST_PRODUCT_NAME,
      package_size: TEST_PRODUCT_SIZE,
      quantity:     2,
    }
  ],
};

beforeAll(async () => {
  const hash = await bcrypt.hash("TestPass123!", 10);
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (UUID(), 'order_test_user', 'order_test@test.com', ?, 'Order Tester', 'manager', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [hash]
  );

  await pool.query(
    `INSERT INTO products
       (id, name, package_size, price, unit_cost, active, inventory_quantity, low_stock_threshold)
     VALUES (?, ?, ?, ?, ?, 1, 500, 10)
     ON DUPLICATE KEY UPDATE price = VALUES(price), active = 1`,
    [TEST_PRODUCT_ID, TEST_PRODUCT_NAME, TEST_PRODUCT_SIZE, TEST_PRODUCT_PRICE, 100]
  );

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "order_test@test.com", password: "TestPass123!" });
  token = res.body.data.token;
});

afterAll(async () => {
  await pool.query(`DELETE FROM staff_users WHERE username = 'order_test_user'`);
  await pool.query(`DELETE FROM orders WHERE phone = '+251900000001'`);
  await pool.query(`DELETE FROM order_items WHERE order_id IN
    (SELECT id FROM orders WHERE phone = '+251900000001')`);
  await pool.query(`DELETE FROM products WHERE id = ?`, [TEST_PRODUCT_ID]);
  await pool.end();
});

// ── GET /api/orders ────────────────────────────────────────────────────────

describe("GET /api/orders", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/orders");
    expect(res.status).toBe(401);
  });

  it("returns paginated list with auth", async () => {
    const res = await request(app)
      .get("/api/orders")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta).toHaveProperty("total");
    expect(res.body.meta).toHaveProperty("page");
    expect(res.body.meta).toHaveProperty("limit");
  });

  it("filters by status correctly", async () => {
    const res = await request(app)
      .get("/api/orders?status=Pending")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    res.body.data.forEach((o: any) => {
      expect(o.status).toBe("Pending");
    });
  });

  it("filters by source correctly", async () => {
    const res = await request(app)
      .get("/api/orders?source=website")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    res.body.data.forEach((o: any) => {
      expect(o.source).toBe("website");
    });
  });

  it("respects pagination params", async () => {
    const res = await request(app)
      .get("/api/orders?page=1&limit=5")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(5);
    expect(res.body.meta.limit).toBe(5);
  });

  it("total field is numeric (not total_amount)", async () => {
    const res = await request(app)
      .get("/api/orders")
      .set("Authorization", `Bearer ${token}`);
    if (res.body.data.length > 0) {
      expect(typeof res.body.data[0].total).toBe("string"); // DECIMAL comes back as string
      expect(res.body.data[0].total_amount).toBeUndefined();
    }
  });
});

// ── POST /api/orders ───────────────────────────────────────────────────────

describe("POST /api/orders", () => {
  let createdOrderId: string;

  it("creates an order and returns id + total", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send(TEST_ORDER);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(Number(res.body.data.total)).toBe(700); // 2 × 350
    createdOrderId = res.body.data.id;
  });

  it("rejects order with missing required fields", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ source: "website" }); // missing customer_name, phone, items
    expect(res.status).toBe(422);
  });

  it("rejects order with negative quantity", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...TEST_ORDER, items: [{ ...TEST_ORDER.items[0], quantity: -1 }] });
    expect(res.status).toBe(422);
  });

  it("does not allow XSS in customer_name", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...TEST_ORDER, customer_name: "<script>alert('xss')</script>" });
    // Either rejected (422) or sanitized
    if (res.status === 201) {
      expect(res.body.data?.customer_name ?? "").not.toContain("<script>");
    }
  });

  it("does not allow SQL injection in phone field", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...TEST_ORDER, phone: "'; DROP TABLE orders; --" });
    expect([422, 400]).toContain(res.status);
  });

  // GET /:id for the order we created
  it("retrieves the created order by id", async () => {
    if (!createdOrderId) return;
    const res = await request(app)
      .get(`/api/orders/${createdOrderId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdOrderId);
  });
});

// ── PATCH /api/orders/:id/status ──────────────────────────────────────────

describe("PATCH /api/orders/:id/status", () => {
  let orderId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...TEST_ORDER, phone: "+251900000002" });
    orderId = res.body.data.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM orders WHERE phone = '+251900000002'`);
  });

  it("updates status to Confirmed", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "Confirmed" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("Confirmed");
  });

  it("returns 422 for invalid status values", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "InvalidStatusValue" });
    expect(res.status).toBe(422);
  });

  it("returns 404 for non-existent order", async () => {
    const res = await request(app)
      .patch("/api/orders/ORD-DOESNOTEXIST/status")
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "Confirmed" });
    expect(res.status).toBe(404);
  });

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .send({ status: "Confirmed" });
    expect(res.status).toBe(401);
  });
});