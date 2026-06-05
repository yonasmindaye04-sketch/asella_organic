/**
 * backend/tests/unit/products.test.ts
 * Asella Organic — Products & Stock Route Tests
 */

import request from "supertest";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";
import bcrypt from "bcryptjs";

let adminToken: string;
let managerToken: string;
let testProductId: string;

beforeAll(async () => {
  const hash = await bcrypt.hash("TestPass123!", 10);
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active) VALUES
     (UUID(), 'prod_test_admin',   'prod_admin@test.com',   ?, 'Prod Admin',   'admin',   true),
     (UUID(), 'prod_test_manager', 'prod_manager@test.com', ?, 'Prod Manager', 'manager', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [hash, hash]
  );

  const [adminRes, managerRes] = await Promise.all([
    request(app).post("/api/auth/login").send({ email: "prod_admin@test.com",   password: "TestPass123!" }),
    request(app).post("/api/auth/login").send({ email: "prod_manager@test.com", password: "TestPass123!" }),
  ]);
  adminToken   = adminRes.body.data.token;
  managerToken = managerRes.body.data.token;
});

afterAll(async () => {
  await pool.query(
    `DELETE FROM staff_users WHERE username IN ('prod_test_admin','prod_test_manager')`
  );
  if (testProductId) {
    await pool.query(`DELETE FROM inventory_movements WHERE product_id = ?`, [testProductId]);
    await pool.query(`DELETE FROM stock_snapshots WHERE product_id = ?`, [testProductId]);
    await pool.query(`DELETE FROM products WHERE id = ?`, [testProductId]);
  }
  await pool.end();
});

// ── GET /api/products ──────────────────────────────────────────────────────

describe("GET /api/products", () => {
  it("is publicly accessible (no auth required)", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("returns pagination meta", async () => {
    const res = await request(app).get("/api/products?page=1&limit=5");
    expect(res.body.meta.limit).toBe(5);
    expect(res.body.meta).toHaveProperty("total");
    expect(res.body.meta).toHaveProperty("pages");
    expect(res.body.data.length).toBeLessThanOrEqual(5);
  });

  it("filters by tag", async () => {
    const res = await request(app).get("/api/products?tag=bestseller");
    expect(res.status).toBe(200);
    res.body.data.forEach((p: any) => {
      expect(p.tag).toBe("bestseller");
    });
  });

  it("filters by search term", async () => {
    const res = await request(app).get("/api/products?search=moringa");
    expect(res.status).toBe(200);
    res.body.data.forEach((p: any) => {
      expect(p.name.toLowerCase()).toContain("moringa");
    });
  });

  it("only returns active products by default", async () => {
    const res = await request(app).get("/api/products");
    res.body.data.forEach((p: any) => {
      expect(p.active).toBe(1); // MySQL returns 1 for TRUE
    });
  });
});

// ── POST /api/products ─────────────────────────────────────────────────────

describe("POST /api/products", () => {
  const NEW_PRODUCT = {
    name:                "Test Herb",
    package_size:        "100g",
    price:               199,
    description:         "Test description",
    inventory_quantity:  50,
    low_stock_threshold: 10,
    featured:            true,
    tag:                 "test",
  };

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).post("/api/products").send(NEW_PRODUCT);
    expect(res.status).toBe(401);
  });

  it("allows manager to create product", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${managerToken}`)
      .send(NEW_PRODUCT);
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe(NEW_PRODUCT.name);
    testProductId = res.body.data.id;
  });

  it("rejects product with missing required fields", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ name: "Incomplete" }); // missing package_size, price
    expect(res.status).toBe(422);
  });

  it("rejects negative price", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ ...NEW_PRODUCT, price: -10 });
    expect(res.status).toBe(422);
  });
});

// ── PATCH /api/products/:id ────────────────────────────────────────────────

describe("PATCH /api/products/:id", () => {
  it("updates an existing product", async () => {
    if (!testProductId) return;
    const res = await request(app)
      .patch(`/api/products/${testProductId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ price: 250 });
    expect(res.status).toBe(200);
  });

  it("returns 404 for non-existent product", async () => {
    const res = await request(app)
      .patch("/api/products/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ price: 250 });
    expect(res.status).toBe(404);
  });
});

// ── GET /api/products/low-stock ────────────────────────────────────────────

describe("GET /api/products/low-stock", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/products/low-stock");
    expect(res.status).toBe(401);
  });

  it("returns products at or below threshold", async () => {
    const res = await request(app)
      .get("/api/products/low-stock")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    res.body.data.forEach((p: any) => {
      expect(Number(p.inventory_quantity)).toBeLessThanOrEqual(Number(p.low_stock_threshold));
    });
  });

  it("is paginated", async () => {
    const res = await request(app)
      .get("/api/products/low-stock?page=1&limit=3")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.meta).toBeDefined();
    expect(res.body.data.length).toBeLessThanOrEqual(3);
  });
});

// ── POST /api/products/:id/stock ───────────────────────────────────────────

describe("POST /api/products/:id/stock (adjustment)", () => {
  it("adjusts stock quantity up", async () => {
    if (!testProductId) return;
    // Get current quantity
    const before = await request(app)
      .get(`/api/products/${testProductId}`)
    const qtyBefore = Number(before.body.data?.inventory_quantity ?? 50);

    const res = await request(app)
      .post(`/api/products/${testProductId}/stock`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ change_amount: 10, reason: "test restock" });

    expect(res.status).toBe(200);
    expect(res.body.data.new_quantity).toBe(qtyBefore + 10);
  });

  it("rejects negative stock (below zero)", async () => {
    if (!testProductId) return;
    const res = await request(app)
      .post(`/api/products/${testProductId}/stock`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ change_amount: -99999, reason: "test" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Insufficient");
  });

  it("rejects missing reason field", async () => {
    if (!testProductId) return;
    const res = await request(app)
      .post(`/api/products/${testProductId}/stock`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ change_amount: 5 }); // no reason
    expect(res.status).toBe(422);
  });
});