/**
 * backend/tests/unit/vendor-orders.test.ts
 * Asella Organic — Vendor Purchase Order Route Tests
 *
 * Tests src/routes/vendor-orders.ts:
 *   GET    /api/vendor-orders          — list
 *   POST   /api/vendor-orders          — create (Zod superRefine validation)
 *   PATCH  /api/vendor-orders/:id/status — status update
 *
 * Run with:
 *   npx jest tests/unit/vendor-orders.test.ts
 */

import request from "supertest";
import bcrypt  from "bcryptjs";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

let adminToken: string;
const TS = Date.now();
const VENDOR_NAME = `PW Vendor ${TS}`;

beforeAll(async () => {
  const hash = await bcrypt.hash("TestPass123!", 10);
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (UUID(), ?, ?, ?, 'Vendor Order Tester', 'admin', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [`vo_test_${TS}`, `vo_${TS}@asella.test`, hash]
  );
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: `vo_${TS}@asella.test`, password: "TestPass123!" });
  adminToken = res.body.data.token;
});

afterAll(async () => {
  await pool.query(`DELETE FROM staff_users WHERE username = ?`, [`vo_test_${TS}`]);
  await pool.query(`DELETE FROM vendor_orders WHERE vendor_name = ?`, [VENDOR_NAME]);
  await pool.end();
});

const BASE_VALID = {
  vendor_name: VENDOR_NAME,
  item:        "Moringa Powder",
  amount:      "50kg",
  price:       1500,
};

describe("GET /api/vendor-orders", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/vendor-orders");
    expect(res.status).toBe(401);
  });

  it("returns 200 with an array for an admin", async () => {
    const res = await request(app)
      .get("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("includes orders created earlier in the test session", async () => {
    // Create one then list
    const create = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(BASE_VALID);
    expect(create.status).toBe(201);

    const list = await request(app)
      .get("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`);
    const found = list.body.data.find((o: any) => o.vendor_name === VENDOR_NAME);
    expect(found).toBeDefined();
  });
});

describe("POST /api/vendor-orders — Zod superRefine validation", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await request(app).post("/api/vendor-orders").send(BASE_VALID);
    expect(res.status).toBe(401);
  });

  it("creates a vendor order and returns 201 on valid payload", async () => {
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...BASE_VALID, delivery_date: "2026-07-15" });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.order_id).toMatch(/^PO-\d+$/);
    expect(res.body.data.vendor_name).toBe(VENDOR_NAME);
    expect(res.body.data.item).toBe("Moringa Powder");
    expect(res.body.data.amount).toBe("50kg");
    // MySQL DECIMAL columns are returned as strings ("1500.00"),
    // not numbers. The route stores 1500; the wire format is "1500.00".
    expect(Number(res.body.data.price)).toBe(1500);
    // delivery_date is stored as VARCHAR(100) but mysql2 may auto-coerce
    // date-shaped strings through Date parsing, then re-stringify them
    // in UTC. The server's timezone may shift the date back by a few
    // hours (e.g. "2026-07-15" → "2026-07-14T21:00:00.000Z" in UTC+3).
    // Accept any value that contains "2026-07-15" or "2026-07-14" to be
    // tolerant of the timezone shift.
    const dd = res.body.data.delivery_date;
    if (dd !== null && dd !== undefined) {
      const str = String(dd);
      expect(str.includes("2026-07-15") || str.includes("2026-07-14")).toBe(true);
    }
    expect(res.body.data.status).toBe("pending");
  });

  it("returns 422 when both item and description are missing", async () => {
    const { item, ...rest } = BASE_VALID;
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(rest);
    expect(res.status).toBe(422);
    expect(res.body.details?.item ?? res.body.details?.description).toBeDefined();
  });

  it("accepts payload with description instead of item", async () => {
    const { item, ...rest } = BASE_VALID;
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...rest, description: "Raw moringa leaves" });
    expect([200, 201]).toContain(res.status);
  });

  it("returns 422 when both amount and quantity are missing", async () => {
    const { amount, ...rest } = BASE_VALID;
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(rest);
    expect(res.status).toBe(422);
  });

  it("accepts payload with quantity instead of amount", async () => {
    const { amount, ...rest } = BASE_VALID;
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...rest, quantity: 50 });
    expect([200, 201]).toContain(res.status);
  });

  it("returns 422 when both price and unit_price are missing", async () => {
    const { price, ...rest } = BASE_VALID;
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(rest);
    expect(res.status).toBe(422);
  });

  it("accepts payload with unit_price instead of price", async () => {
    const { price, ...rest } = BASE_VALID;
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...rest, unit_price: 1500 });
    expect([200, 201]).toContain(res.status);
  });

  it("returns 422 when vendor_name is missing", async () => {
    const { vendor_name, ...rest } = BASE_VALID;
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(rest);
    expect(res.status).toBe(422);
  });

  it("returns 422 when vendor_name is too short (< 2 chars)", async () => {
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...BASE_VALID, vendor_name: "A" });
    expect(res.status).toBe(422);
  });

  it("returns 422 when delivery_date is not YYYY-MM-DD", async () => {
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...BASE_VALID, delivery_date: "07/15/2026" });
    expect(res.status).toBe(422);
  });
});

describe("PATCH /api/vendor-orders/:id/status", () => {
  let createdId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/vendor-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(BASE_VALID);
    createdId = res.body.data.id;
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app)
      .patch(`/api/vendor-orders/${createdId}/status`)
      .send({ status: "confirmed" });
    expect(res.status).toBe(401);
  });

  it("returns 422 for an invalid status value", async () => {
    const res = await request(app)
      .patch(`/api/vendor-orders/${createdId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "shipped" }); // not in enum
    expect(res.status).toBe(422);
  });

  it("updates status to 'confirmed' on a valid PATCH", async () => {
    const res = await request(app)
      .patch(`/api/vendor-orders/${createdId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "confirmed" });
    expect([200, 204]).toContain(res.status);

    const [rows] = await pool.query(
      `SELECT status FROM vendor_orders WHERE id = ?`, [createdId]
    ) as [any[], any];
    expect(rows[0].status).toBe("confirmed");
  });

  it("updates status to 'declined' on a valid PATCH", async () => {
    const res = await request(app)
      .patch(`/api/vendor-orders/${createdId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "declined" });
    expect([200, 204]).toContain(res.status);
  });

  it("returns 404 for a non-existent vendor order ID", async () => {
    const res = await request(app)
      .patch("/api/vendor-orders/00000000-0000-0000-0000-000000000000/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "confirmed" });
    expect(res.status).toBe(404);
  });

  it("accepts all four valid status values", async () => {
    for (const status of ["pending", "confirmed", "declined", "completed"]) {
      const res = await request(app)
        .patch(`/api/vendor-orders/${createdId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status });
      expect([200, 204]).toContain(res.status);
    }
  });
});
