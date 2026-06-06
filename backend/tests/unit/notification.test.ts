/**
 * backend/tests/unit/notification.test.ts
 * Asella Organic — Notifications Route Tests
 *
 * Tests src/routes/notification.ts:
 *   GET /api/notifications           — unified feed (auth + role gated)
 *   GET /api/notifications/summary   — per-category counts
 *
 * The route aggregates from inventory_movements, stock_requests, orders,
 * and vendor_orders. We insert minimal rows in each table to exercise
 * every aggregation path.
 *
 * Run with:
 *   npx jest tests/unit/notification.test.ts
 */

import request from "supertest";
import bcrypt  from "bcryptjs";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

let adminToken: string;
const TEST_TS  = Date.now();

const TEST_PRODUCT = {
  id:               `notif-prod-${TEST_TS}`,
  name:             `Moringa PW ${TEST_TS}`,
  package_size:     "250g",
  price:            350,
  inventory_quantity: 5,         // below threshold
  low_stock_threshold: 10,
  active:           true,
};

const TEST_ORDER = {
  id:        `ORD-NOTIF-${TEST_TS}`,
  source:    "website",
  customer_name: "Notif Test Customer",
  phone:     `+2519${String(TEST_TS).slice(-7)}`,
  location:  "Bole",
  city:      "Addis Ababa",
  total:     500,
  status:    "Pending",
  order_type: "Online",
};

const TEST_VENDOR_ORDER = {
  id:         `VO-NOTIF-${TEST_TS}`,
  order_id:   `PO-NOTIF-${TEST_TS}`,
  vendor_name: `PW Vendor ${TEST_TS}`,
  item:       "Honey",
  amount:     "10kg",
  price:      1500,
  status:     "pending",
};

beforeAll(async () => {
  // Create admin user
  const hash = await bcrypt.hash("TestPass123!", 10);
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (UUID(), ?, ?, ?, 'Notif Tester', 'admin', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [`notif_test_${TEST_TS}`, `notif_${TEST_TS}@asella.test`, hash]
  );

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: `notif_${TEST_TS}@asella.test`, password: "TestPass123!" });
  adminToken = res.body.data.token;
});

afterAll(async () => {
  await pool.query(`DELETE FROM staff_users WHERE username = ?`, [`notif_test_${TEST_TS}`]);
  await pool.query(`DELETE FROM inventory_movements WHERE product_id = ?`, [TEST_PRODUCT.id]);
  await pool.query(`DELETE FROM stock_snapshots WHERE product_id = ?`, [TEST_PRODUCT.id]);
  await pool.query(`DELETE FROM products WHERE id = ?`, [TEST_PRODUCT.id]);
  await pool.query(`DELETE FROM order_items WHERE order_id = ?`, [TEST_ORDER.id]);
  await pool.query(`DELETE FROM orders WHERE id = ?`, [TEST_ORDER.id]);
  await pool.query(`DELETE FROM vendor_orders WHERE id = ?`, [TEST_VENDOR_ORDER.id]);
  // stock_requests has no order_id column; cleanup by item name instead.
  await pool.query(
    `DELETE FROM stock_requests WHERE item LIKE 'PW Stock Request%'`
  );
  await pool.end();
});

beforeEach(async () => {
  // Insert a low-stock movement (so 'low_stock' category has data)
  await pool.query(
    `INSERT INTO products (id, name, package_size, price, inventory_quantity, low_stock_threshold, active)
     VALUES (?, ?, ?, ?, ?, ?, true)
     ON DUPLICATE KEY UPDATE inventory_quantity = VALUES(inventory_quantity)`,
    [TEST_PRODUCT.id, TEST_PRODUCT.name, TEST_PRODUCT.package_size, TEST_PRODUCT.price,
     TEST_PRODUCT.inventory_quantity, TEST_PRODUCT.low_stock_threshold]
  );
  await pool.query(
    `INSERT INTO inventory_movements (id, product_id, movement_type, change_amount, reason, quantity_after, created_at)
     VALUES (UUID(), ?, 'sale', -1, 'PW test', ?, NOW())`,
    [TEST_PRODUCT.id, TEST_PRODUCT.inventory_quantity]
  );
});

afterEach(async () => {
  // Clear per-test notifications data
  await pool.query(
    `DELETE FROM inventory_movements
     WHERE product_id = ? AND reason = 'PW test'`,
    [TEST_PRODUCT.id]
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/notifications
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/notifications", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(401);
  });

  it("returns 200 with an array of notifications for an admin", async () => {
    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("includes low_stock notifications from inventory_movements", async () => {
    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const lowStock = res.body.data.filter((n: any) => n.category === "low_stock");
    expect(lowStock.length).toBeGreaterThanOrEqual(1);
    const item = lowStock[0];
    expect(item.title).toContain("Low Stock");
    expect(item.title).toContain(TEST_PRODUCT.name);
    expect(item.body).toContain("threshold");
  });

  it("includes new_order notifications from orders", async () => {
    await pool.query(
      `INSERT INTO orders (id, source, customer_name, phone, city, total, status, order_type, created_at)
       VALUES (?, 'website', ?, ?, 'Addis Ababa', 500, 'Pending', 'Online', NOW())`,
      [TEST_ORDER.id, TEST_ORDER.customer_name, TEST_ORDER.phone]
    );
    await pool.query(
      `INSERT INTO order_items (id, order_id, item_name, package_size, quantity, unit_price)
       VALUES (UUID(), ?, 'PW Item', '250g', 1, 500)`,
      [TEST_ORDER.id]
    );

    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const newOrders = res.body.data.filter((n: any) => n.category === "new_order");
    expect(newOrders.length).toBeGreaterThanOrEqual(1);

    // Cleanup so it doesn't leak into the next test
    await pool.query(`DELETE FROM order_items WHERE order_id = ?`, [TEST_ORDER.id]);
    await pool.query(`DELETE FROM orders WHERE id = ?`, [TEST_ORDER.id]);
  });

  it("includes vendor notifications from vendor_orders", async () => {
    await pool.query(
      `INSERT INTO vendor_orders (id, order_id, vendor_name, item, amount, price, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [TEST_VENDOR_ORDER.id, TEST_VENDOR_ORDER.order_id, TEST_VENDOR_ORDER.vendor_name,
       TEST_VENDOR_ORDER.item, TEST_VENDOR_ORDER.amount, TEST_VENDOR_ORDER.price]
    );

    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const vendorNotifs = res.body.data.filter((n: any) => n.category === "vendor");
    expect(vendorNotifs.length).toBeGreaterThanOrEqual(1);

    await pool.query(`DELETE FROM vendor_orders WHERE id = ?`, [TEST_VENDOR_ORDER.id]);
  });

  it("filters by category parameter", async () => {
    const res = await request(app)
      .get("/api/notifications?category=low_stock")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every((n: any) => n.category === "low_stock")).toBe(true);
  });

  it("respects the limit query parameter (caps at 100)", async () => {
    const res = await request(app)
      .get("/api/notifications?limit=2")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
  });

  it("caps limit at 100 even when higher value is requested", async () => {
    const res = await request(app)
      .get("/api/notifications?limit=99999")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(100);
  });

  it("parses metadata as a JSON object (not a raw string)", async () => {
    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    for (const n of res.body.data) {
      if (n.metadata !== null && n.metadata !== undefined) {
        expect(typeof n.metadata).toBe("object");
      }
    }
  });

  it("sorts notifications by created_at descending", async () => {
    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const dates = res.body.data.map((n: any) => new Date(n.created_at).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/notifications/summary
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/notifications/summary", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/notifications/summary");
    expect(res.status).toBe(401);
  });

  it("returns 200 with per-category counts", async () => {
    const res = await request(app)
      .get("/api/notifications/summary")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(typeof res.body.data.low_stock).toBe("number");
    expect(typeof res.body.data.stock_request).toBe("number");
    expect(typeof res.body.data.new_order).toBe("number");
    expect(typeof res.body.data.vendor).toBe("number");
    expect(typeof res.body.data.total).toBe("number");
  });

  it("total is the sum of per-category counts", async () => {
    const res = await request(app)
      .get("/api/notifications/summary")
      .set("Authorization", `Bearer ${adminToken}`);

    const { low_stock, stock_request, new_order, vendor, total } = res.body.data;
    expect(total).toBe(low_stock + stock_request + new_order + vendor);
  });
});
