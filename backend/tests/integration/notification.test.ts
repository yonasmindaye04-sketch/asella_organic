/**
 * backend/tests/integration/notification.test.ts
 * Asella Organic — Notifications Route Tests
 */

import request from "supertest";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

let token: string;
const testEntities = {
  user_id: crypto.randomUUID(),
  product_id: crypto.randomUUID(),
  order_id: crypto.randomUUID(),
  stock_request_id: crypto.randomUUID(),
  vendor_order_id: crypto.randomUUID(),
  movement_id: crypto.randomUUID()
};

beforeAll(async () => {
  // 1. Create admin user and login
  const hash = await bcrypt.hash("NotifTest123!", 10);
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (?, 'notif_admin', 'notif_admin@test.com', ?, 'Notif Admin', 'admin', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [testEntities.user_id, hash]
  );

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: "notif_admin@test.com", password: "NotifTest123!" });
  token = loginRes.body.data.token;

  // 2. Insert Product for low stock notification
  await pool.query(
    `INSERT INTO products (id, name, package_size, price, inventory_quantity, low_stock_threshold)
     VALUES (?, 'Notif Test Product', '100g', 100, 5, 10)`,
    [testEntities.product_id]
  );

  // 3. Insert Low Stock Movement
  await pool.query(
    `INSERT INTO inventory_movements (id, product_id, movement_type, change_amount, quantity_after, reference_type, created_at)
     VALUES (?, ?, 'sale', -5, 5, 'order', NOW())`,
    [testEntities.movement_id, testEntities.product_id]
  );

  // 4. Insert Stock Request
  await pool.query(
    `INSERT INTO stock_requests (id, item, qty_needed, status, created_at)
     VALUES (?, 'Test Stock Request', 50, 'pending', NOW())`,
    [testEntities.stock_request_id]
  );

  // 5. Insert New Order
  await pool.query(
    `INSERT INTO orders (id, customer_name, phone, source, status, created_at)
     VALUES (?, 'Notif Test Customer', '+251911111111', 'Website', 'Pending', NOW())`,
    [testEntities.order_id]
  );

  // 6. Insert Vendor Order
  await pool.query(
    `INSERT INTO vendor_orders (id, order_id, vendor_name, item, amount, status, created_at)
     VALUES (?, 'VO-123456', 'Test Vendor', 'Bulk Product', '100 units', 'pending', NOW())`,
    [testEntities.vendor_order_id]
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM vendor_orders WHERE id = ?`, [testEntities.vendor_order_id]);
  await pool.query(`DELETE FROM orders WHERE id = ?`, [testEntities.order_id]);
  await pool.query(`DELETE FROM stock_requests WHERE id = ?`, [testEntities.stock_request_id]);
  await pool.query(`DELETE FROM inventory_movements WHERE id = ?`, [testEntities.movement_id]);
  await pool.query(`DELETE FROM products WHERE id = ?`, [testEntities.product_id]);
  await pool.query(`DELETE FROM staff_users WHERE id = ?`, [testEntities.user_id]);
  await pool.end();
});

describe("GET /api/notifications", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(401);
  });

  it("returns notifications across all categories when no category specified", async () => {
    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    
    const categories = res.body.data.map((n: any) => n.category);
    expect(categories).toContain("low_stock");
    expect(categories).toContain("stock_request");
    expect(categories).toContain("new_order");
    expect(categories).toContain("vendor");
  });

  it("filters by low_stock category", async () => {
    const res = await request(app)
      .get("/api/notifications?category=low_stock")
      .set("Authorization", `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    res.body.data.forEach((n: any) => {
      expect(n.category).toBe("low_stock");
    });
  });

  it("filters by new_order category", async () => {
    const res = await request(app)
      .get("/api/notifications?category=new_order")
      .set("Authorization", `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    res.body.data.forEach((n: any) => {
      expect(n.category).toBe("new_order");
    });
  });
});

describe("GET /api/notifications/summary", () => {
  it("returns counts for each category", async () => {
    const res = await request(app)
      .get("/api/notifications/summary")
      .set("Authorization", `Bearer ${token}`);
      
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBeGreaterThanOrEqual(4);
    expect(res.body.data.low_stock).toBeGreaterThanOrEqual(1);
    expect(res.body.data.stock_request).toBeGreaterThanOrEqual(1);
    expect(res.body.data.new_order).toBeGreaterThanOrEqual(1);
    expect(res.body.data.vendor).toBeGreaterThanOrEqual(1);
  });
});
