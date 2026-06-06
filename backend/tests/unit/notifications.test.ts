/**
 * backend/tests/integration/notifications.test.ts
 * Asella Organic — Notifications + Vendor-Orders Route Integration Tests
 *
 * Tests the two route files with zero prior coverage:
 *   • GET /api/notifications        (category filter, since window, sort, JSON parse)
 *   • GET /api/notifications/summary
 *   • GET /api/vendor-orders
 *   • POST /api/vendor-orders       (superRefine validation rules)
 *   • PATCH /api/vendor-orders/:id
 *
 * Runs against the real Express app + a real test DB
 * (same pattern as existing auth.test.ts).
 *
 * Run with:
 *   npx jest tests/integration/notifications.test.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import request from "supertest";
import bcrypt  from "bcryptjs";
import app     from "../../src/app.js";
import pool    from "../../src/config/db.js";

// ── Test fixtures ──────────────────────────────────────────────────────────

const ADMIN = {
  username:  "notif_test_admin",
  email:     "notif_test_admin@asella.test",
  password:  "TestPass123!",
  full_name: "Notifications Test Admin",
  role:      "admin",
};

let adminToken: string;
let vendorOrderId: string;

// ── Setup / teardown ───────────────────────────────────────────────────────

beforeAll(async () => {
  // Create admin user
  const hash = await bcrypt.hash(ADMIN.password, 10);
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (UUID(), ?, ?, ?, ?, ?, true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [ADMIN.username, ADMIN.email, hash, ADMIN.full_name, ADMIN.role]
  );

  // Log in and capture the access token
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: ADMIN.email, password: ADMIN.password });

  // Login response shape: { success, data: { token, refreshToken, user } }
  // (the field is `token`, not `accessToken`).
  adminToken = res.body?.data?.token ?? res.body?.data?.accessToken ?? res.body?.accessToken;
  if (!adminToken) throw new Error("Login failed during test setup");
});

afterAll(async () => {
  await pool.query(`DELETE FROM staff_users WHERE username = ?`, [ADMIN.username]);
  // The vendor_orders table has no created_by column, so we can't
  // scope cleanup to this admin. Orders created by the test are
  // identifiable by their vendor_name.
  await pool.query(`DELETE FROM vendor_orders WHERE vendor_name = ?`,
    ["Supplier Co."]);
  await pool.end();
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/notifications
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/notifications", () => {
  it("returns 401 when not authenticated", async () => {
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

  it("respects the category query parameter (only low_stock items)", async () => {
    const res = await request(app)
      .get("/api/notifications?category=low_stock")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const notifications: any[] = res.body.data;
    notifications.forEach((n: any) => {
      expect(n.category).toBe("low_stock");
    });
  });

  it("respects the since query parameter (filters by date)", async () => {
    // Future date → should return empty or only future items
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const res = await request(app)
      .get(`/api/notifications?since=${future}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // No real data exists in the future — list should be empty
    expect(res.body.data).toHaveLength(0);
  });

  it("respects the limit query parameter", async () => {
    const res = await request(app)
      .get("/api/notifications?limit=1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // May legitimately return 0 items in a fresh test DB, but never more than limit
    expect(res.body.data.length).toBeLessThanOrEqual(1);
  });

  it("caps limit at 100 even when higher value is requested", async () => {
    const res = await request(app)
      .get("/api/notifications?limit=9999")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // Server should not crash or return more than 100 rows
    expect(res.body.data.length).toBeLessThanOrEqual(100);
  });

  it("returns notifications sorted descending by created_at", async () => {
    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const dates: string[] = (res.body.data as any[]).map((n: any) => n.created_at);
    for (let i = 1; i < dates.length; i++) {
      const prev = dates[i - 1];
      const cur  = dates[i];
      if (prev === undefined || cur === undefined) continue;
      expect(new Date(prev).getTime()).toBeGreaterThanOrEqual(
        new Date(cur).getTime()
      );
    }
  });

  it("parses metadata as a JSON object (not a raw string)", async () => {
    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    (res.body.data as any[]).forEach((n: any) => {
      if (n.metadata !== null && n.metadata !== undefined) {
        expect(typeof n.metadata).toBe("object");
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/notifications/summary
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/notifications/summary", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/notifications/summary");
    expect(res.status).toBe(401);
  });

  it("returns 200 with unread counts per category for an admin", async () => {
    const res = await request(app)
      .get("/api/notifications/summary")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // The summary shape should be an object with category keys
    const data = res.body.data;
    expect(typeof data).toBe("object");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/vendor-orders — Zod superRefine validation
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/vendor-orders — validation", () => {
  const BASE_VALID = {
    vendor_name: "Supplier Co.",
    item:        "Moringa powder",
    amount:      "50kg",
    price:       1500,
  };

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).post("/api/vendor-orders").send(BASE_VALID);
    expect(res.status).toBe(401);
  });

  it("creates a vendor order and returns 201 on valid payload", async () => {
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(BASE_VALID);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    vendorOrderId = res.body.data?.id ?? res.body.data?.vendor_order_id;
  });

  it("returns 422 when both item AND description are missing", async () => {
    const { item: _item, ...noItem } = BASE_VALID;
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...noItem });   // no item, no description

    expect(res.status).toBe(422);
    expect(res.body.details?.item ?? res.body.details?.description).toBeDefined();
  });

  it("accepts payload with description instead of item", async () => {
    const { item: _item, ...rest } = BASE_VALID;
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...rest, description: "Raw moringa leaves" });

    expect([200, 201]).toContain(res.status);
  });

  it("returns 422 when both amount AND quantity are missing", async () => {
    const { amount: _amount, ...noAmount } = BASE_VALID;
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...noAmount });

    expect(res.status).toBe(422);
    expect(res.body.details?.amount ?? res.body.details?.quantity).toBeDefined();
  });

  it("accepts payload with quantity instead of amount", async () => {
    const { amount: _amount, ...rest } = BASE_VALID;
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...rest, quantity: 50 });

    expect([200, 201]).toContain(res.status);
  });

  it("returns 422 when both price AND unit_price are missing", async () => {
    const { price: _price, ...noPrice } = BASE_VALID;
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...noPrice });

    expect(res.status).toBe(422);
    expect(res.body.details?.price ?? res.body.details?.unit_price).toBeDefined();
  });

  it("accepts payload with unit_price instead of price", async () => {
    const { price: _price, ...rest } = BASE_VALID;
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...rest, unit_price: 1500 });

    expect([200, 201]).toContain(res.status);
  });

  it("returns 422 when vendor_name is missing", async () => {
    const { vendor_name: _vn, ...noVendor } = BASE_VALID;
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(noVendor);

    expect(res.status).toBe(422);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/vendor-orders
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/vendor-orders", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/vendor-orders");
    expect(res.status).toBe(401);
  });

  it("returns 200 with an array for an authenticated admin", async () => {
    const res = await request(app)
      .get("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/vendor-orders/:id
// ═══════════════════════════════════════════════════════════════════════════

describe("PATCH /api/vendor-orders/:id/status", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await request(app)
      .patch("/api/vendor-orders/fake-id/status")
      .send({ status: "confirmed" });
    expect(res.status).toBe(401);
  });

  it("returns 422 for an invalid status value", async () => {
    const id = vendorOrderId ?? "test-id";
    const res = await request(app)
      .patch(`/api/vendor-orders/${id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "shipped" });  // not in enum

    expect(res.status).toBe(422);
  });

  it("updates status to 'confirmed' on a valid PATCH", async () => {
    if (!vendorOrderId) {
      console.warn("Skipping PATCH test — no vendor order created in POST test");
      return;
    }

    const res = await request(app)
      .patch(`/api/vendor-orders/${vendorOrderId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "confirmed" });

    expect([200, 204]).toContain(res.status);
  });

  it("returns 404 for a non-existent vendor order ID", async () => {
    const res = await request(app)
      .patch("/api/vendor-orders/00000000-0000-0000-0000-000000000000/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "confirmed" });

    expect(res.status).toBe(404);
  });
});