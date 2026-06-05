/**
 * backend/tests/integration/stock.test.ts
 * Asella Organic — Stock / Inventory Route Tests
 */

import request from "supertest";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

let adminToken: string;
let employeeToken: string;
const adminId    = crypto.randomUUID();
const employeeId = crypto.randomUUID();
const productId  = crypto.randomUUID();
const productId2 = crypto.randomUUID();
const vendorOrderId = crypto.randomUUID();

beforeAll(async () => {
  const hash = await bcrypt.hash("StockTest123!", 10);

  // Admin user
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (?, 'stock_admin', 'stock_admin@test.com', ?, 'Stock Admin', 'admin', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [adminId, hash]
  );

  // Employee user (lower permissions)
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (?, 'stock_employee', 'stock_emp@test.com', ?, 'Stock Employee', 'employee', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [employeeId, hash]
  );

  const [adminRes, empRes] = await Promise.all([
    request(app).post("/api/auth/login").send({ email: "stock_admin@test.com", password: "StockTest123!" }),
    request(app).post("/api/auth/login").send({ email: "stock_emp@test.com", password: "StockTest123!" }),
  ]);
  adminToken    = adminRes.body.data.token;
  employeeToken = empRes.body.data.token;

  // Products for stock testing
  await pool.query(
    `INSERT INTO products (id, name, package_size, price, inventory_quantity, low_stock_threshold, active)
     VALUES (?, 'Stock Test Product A', '100g', 200, 50, 20, true)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [productId]
  );
  await pool.query(
    `INSERT INTO products (id, name, package_size, price, inventory_quantity, low_stock_threshold, active)
     VALUES (?, 'Stock Test Product B', '500g', 500, 3, 10, true)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [productId2]
  );

  // Vendor order for receive test
  await pool.query(
    `INSERT INTO vendor_orders (id, order_id, vendor_name, item, amount, product_id, status, created_at)
     VALUES (?, 'VO-STOCK-TEST', 'Test Vendor', 'Stock Test Product A', '25 units', ?, 'confirmed', NOW())
     ON DUPLICATE KEY UPDATE status = VALUES(status)`,
    [vendorOrderId, productId]
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM stock_requests WHERE item LIKE 'Stock Test%'`).catch(() => {});
  await pool.query(`DELETE FROM inventory_movements WHERE product_id IN (?, ?)`, [productId, productId2]).catch(() => {});
  await pool.query(`DELETE FROM stock_snapshots WHERE product_id IN (?, ?)`, [productId, productId2]).catch(() => {});
  await pool.query(`DELETE FROM vendor_orders WHERE id = ?`, [vendorOrderId]).catch(() => {});
  await pool.query(`DELETE FROM products WHERE id IN (?, ?)`, [productId, productId2]).catch(() => {});
  await pool.query(`DELETE FROM staff_users WHERE id IN (?, ?)`, [adminId, employeeId]).catch(() => {});
  await pool.end();
});

// ── GET /api/stock ─────────────────────────────────────────────────────────

describe("GET /api/stock", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/stock");
    expect(res.status).toBe(401);
  });

  it("returns list of products with stock info", async () => {
    const res = await request(app)
      .get("/api/stock")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Should contain our test products
    const names = res.body.data.map((p: any) => p.name);
    expect(names).toContain("Stock Test Product A");
  });

  it("filters by search term", async () => {
    const res = await request(app)
      .get("/api/stock?search=Stock+Test+Product+A")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    res.body.data.forEach((p: any) => {
      expect(p.name).toContain("Stock Test");
    });
  });

  it("filters by stock status (ok)", async () => {
    const res = await request(app)
      .get("/api/stock?status=ok")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    res.body.data.forEach((p: any) => {
      expect(p.stock_status).toBe("ok");
    });
  });
});

// ── GET /api/stock/summary ─────────────────────────────────────────────────

describe("GET /api/stock/summary", () => {
  it("returns KPI summary numbers", async () => {
    const res = await request(app)
      .get("/api/stock/summary")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("total_products");
    expect(res.body.data).toHaveProperty("total_units");
    expect(res.body.data).toHaveProperty("total_stock_value");
    expect(res.body.data).toHaveProperty("out_of_stock_count");
    expect(res.body.data).toHaveProperty("movements_30d");
  });
});

// ── GET /api/stock/movements ───────────────────────────────────────────────

describe("GET /api/stock/movements", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/stock/movements");
    expect(res.status).toBe(401);
  });

  it("returns 403 for employee role (needs admin/manager)", async () => {
    const res = await request(app)
      .get("/api/stock/movements")
      .set("Authorization", `Bearer ${employeeToken}`);
    expect(res.status).toBe(403);
  });

  it("returns paginated movement log for admin", async () => {
    const res = await request(app)
      .get("/api/stock/movements")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meta).toHaveProperty("total");
    expect(res.body.meta).toHaveProperty("page");
    expect(res.body.meta).toHaveProperty("limit");
  });

  it("filters by product_id", async () => {
    const res = await request(app)
      .get(`/api/stock/movements?product_id=${productId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    res.body.data.forEach((m: any) => {
      expect(m.product_id).toBe(productId);
    });
  });
});

// ── GET /api/stock/low ─────────────────────────────────────────────────────

describe("GET /api/stock/low", () => {
  it("returns products below threshold", async () => {
    const res = await request(app)
      .get("/api/stock/low")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Product B (qty=3, threshold=10) should appear
    const found = res.body.data.find((p: any) => p.id === productId2);
    expect(found).toBeDefined();
    expect(["low", "critical", "out_of_stock"]).toContain(found.stock_status);
  });
});

// ── POST /api/stock/adjustment ─────────────────────────────────────────────

describe("POST /api/stock/adjustment", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post("/api/stock/adjustment")
      .send({ product_id: productId, movement_type: "adjustment", change_amount: 5, reason: "test" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for employee role", async () => {
    const res = await request(app)
      .post("/api/stock/adjustment")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ product_id: productId, movement_type: "adjustment", change_amount: 5, reason: "test" });
    expect(res.status).toBe(403);
  });

  it("adjusts stock up successfully", async () => {
    const res = await request(app)
      .post("/api/stock/adjustment")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        product_id: productId,
        movement_type: "adjustment",
        change_amount: 10,
        reason: "Stock test restock",
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.new_quantity).toBe(60); // 50 + 10
  });

  it("adjusts stock down successfully", async () => {
    const res = await request(app)
      .post("/api/stock/adjustment")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        product_id: productId,
        movement_type: "damage_loss",
        change_amount: -5,
        reason: "Damaged units",
      });
    expect(res.status).toBe(200);
    expect(res.body.data.new_quantity).toBe(55); // 60 - 5
  });

  it("rejects zero change_amount", async () => {
    const res = await request(app)
      .post("/api/stock/adjustment")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        product_id: productId,
        movement_type: "adjustment",
        change_amount: 0,
        reason: "zero test",
      });
    expect(res.status).toBe(422);
  });

  it("rejects invalid movement_type", async () => {
    const res = await request(app)
      .post("/api/stock/adjustment")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        product_id: productId,
        movement_type: "invalid_type",
        change_amount: 5,
        reason: "test",
      });
    expect(res.status).toBe(422);
  });

  it("rejects missing reason", async () => {
    const res = await request(app)
      .post("/api/stock/adjustment")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        product_id: productId,
        movement_type: "adjustment",
        change_amount: 5,
      });
    expect(res.status).toBe(422);
  });
});

// ── POST /api/stock/receive/:vendorOrderId ─────────────────────────────────

describe("POST /api/stock/receive/:vendorOrderId", () => {
  it("receives vendor order and updates stock", async () => {
    const res = await request(app)
      .post(`/api/stock/receive/${vendorOrderId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.quantity_received).toBe(25);
    expect(res.body.data.product_id).toBe(productId);
  });

  it("rejects double-receive (already completed)", async () => {
    const res = await request(app)
      .post(`/api/stock/receive/${vendorOrderId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("already received");
  });

  it("returns 404 for non-existent vendor order", async () => {
    const res = await request(app)
      .post(`/api/stock/receive/${crypto.randomUUID()}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(404);
  });
});

// ── POST /api/stock/request ────────────────────────────────────────────────

describe("POST /api/stock/request", () => {
  it("creates a stock request", async () => {
    const res = await request(app)
      .post("/api/stock/request")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        item: "Stock Test Request Item",
        qty_needed: 100,
        stock_available: 5,
        delivery_date: "2026-07-01",
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.item).toBe("Stock Test Request Item");
    expect(res.body.data.qty_needed).toBe(100);
  });

  it("rejects request with qty_needed = 0", async () => {
    const res = await request(app)
      .post("/api/stock/request")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ item: "Zero Qty", qty_needed: 0 });
    expect(res.status).toBe(422);
  });

  it("rejects missing item field", async () => {
    const res = await request(app)
      .post("/api/stock/request")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ qty_needed: 10 });
    expect(res.status).toBe(422);
  });
});

// ── GET /api/stock/requests ────────────────────────────────────────────────

describe("GET /api/stock/requests", () => {
  it("returns stock requests for admin", async () => {
    const res = await request(app)
      .get("/api/stock/requests")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("returns 403 for employee role", async () => {
    const res = await request(app)
      .get("/api/stock/requests")
      .set("Authorization", `Bearer ${employeeToken}`);
    expect(res.status).toBe(403);
  });

  it("filters by status", async () => {
    const res = await request(app)
      .get("/api/stock/requests?status=pending")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    res.body.data.forEach((sr: any) => {
      expect(sr.status).toBe("pending");
    });
  });
});

// ── PATCH /api/stock/requests/:id/status ───────────────────────────────────

describe("PATCH /api/stock/requests/:id/status", () => {
  let stockRequestId: string;

  beforeAll(async () => {
    // Create a request linked to a product
    const srId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO stock_requests (id, product_id, item, qty_needed, stock_available, status)
       VALUES (?, ?, 'Stock Test Linked Item', 20, 2, 'pending')`,
      [srId, productId]
    );
    stockRequestId = srId;
  });

  it("updates status to ordered", async () => {
    const res = await request(app)
      .patch(`/api/stock/requests/${stockRequestId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "ordered" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ordered");
  });

  it("updates status to received and auto-increments stock", async () => {
    const res = await request(app)
      .patch(`/api/stock/requests/${stockRequestId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "received", notes: "Stock arrived" });
    expect(res.status).toBe(200);
    expect(res.body.inventory_updated).toBe(true);
    expect(res.body.new_quantity).toBeDefined();
  });

  it("rejects double-receive", async () => {
    const res = await request(app)
      .patch(`/api/stock/requests/${stockRequestId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "received" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Already marked as received");
  });

  it("returns 404 for non-existent request", async () => {
    const res = await request(app)
      .patch(`/api/stock/requests/${crypto.randomUUID()}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "ordered" });
    expect(res.status).toBe(404);
  });

  it("rejects invalid status value", async () => {
    const res = await request(app)
      .patch(`/api/stock/requests/${stockRequestId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "bogus" });
    expect(res.status).toBe(422);
  });
});
