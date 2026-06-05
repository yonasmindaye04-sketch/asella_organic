/**
 * backend/tests/integration/referrals.test.ts
 * Asella Organic — Referral / Affiliate Route Tests
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
const staffForAffiliateId = crypto.randomUUID();

// Track created entities for cleanup
let createdAffiliateId: string;
let createdConfigId: string;
let createdCommissionId: string;

beforeAll(async () => {
  const hash = await bcrypt.hash("RefTest123!", 10);

  // Admin
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (?, 'ref_admin', 'ref_admin@test.com', ?, 'Ref Admin', 'admin', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [adminId, hash]
  );

  // Employee (lower perms)
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (?, 'ref_employee', 'ref_emp@test.com', ?, 'Ref Employee', 'employee', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [employeeId, hash]
  );

  // Staff member to convert to affiliate
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (?, 'ref_staff_aff', 'ref_staff_aff@test.com', ?, 'Staff Affiliate', 'employee', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [staffForAffiliateId, hash]
  );

  const [adminRes, empRes] = await Promise.all([
    request(app).post("/api/auth/login").send({ email: "ref_admin@test.com", password: "RefTest123!" }),
    request(app).post("/api/auth/login").send({ email: "ref_emp@test.com", password: "RefTest123!" }),
  ]);
  adminToken    = adminRes.body.data.token;
  employeeToken = empRes.body.data.token;
});

afterAll(async () => {
  // Cleanup in safe order
  if (createdCommissionId) {
    await pool.query(`DELETE FROM referral_commissions WHERE id = ?`, [createdCommissionId]).catch(() => {});
    await pool.query(`DELETE FROM orders WHERE id = 'ORD-REF-TEST'`).catch(() => {});
  }
  if (createdAffiliateId) {
    await pool.query(`DELETE FROM affiliate_profiles WHERE id = ?`, [createdAffiliateId]).catch(() => {});
  }
  // Clean up any affiliates created by staff_id
  await pool.query(`DELETE FROM affiliate_profiles WHERE user_id = ?`, [staffForAffiliateId]).catch(() => {});
  // Clean up any test configs
  await pool.query(`DELETE FROM referral_configs WHERE commission_value = 99.99`).catch(() => {});
  await pool.query(`DELETE FROM staff_users WHERE id IN (?, ?, ?)`, [adminId, employeeId, staffForAffiliateId]).catch(() => {});
  await pool.end();
});

// ── Config ─────────────────────────────────────────────────────────────────

describe("GET /api/referrals/config", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/referrals/config");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    const res = await request(app)
      .get("/api/referrals/config")
      .set("Authorization", `Bearer ${employeeToken}`);
    expect(res.status).toBe(403);
  });

  it("returns current config for admin", async () => {
    const res = await request(app)
      .get("/api/referrals/config")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("POST /api/referrals/config", () => {
  it("creates a new config", async () => {
    const res = await request(app)
      .post("/api/referrals/config")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        commission_type: "percentage",
        commission_value: 99.99,
        min_order_amount: 100,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.commission_type).toBe("percentage");
    expect(Number(res.body.data.commission_value)).toBe(99.99);
    createdConfigId = res.body.data.id;
  });

  it("rejects invalid commission_type", async () => {
    const res = await request(app)
      .post("/api/referrals/config")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        commission_type: "invalid",
        commission_value: 10,
      });
    expect(res.status).toBe(422);
  });
});

describe("GET /api/referrals/config/history", () => {
  it("returns config history", async () => {
    const res = await request(app)
      .get("/api/referrals/config/history")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ── Affiliates ─────────────────────────────────────────────────────────────

describe("POST /api/referrals/affiliates", () => {
  it("creates an external affiliate", async () => {
    const res = await request(app)
      .post("/api/referrals/affiliates")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        full_name: "External Test Affiliate",
        email: "ext_aff@test.com",
        phone: "+251900000099",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe("external");
    expect(res.body.data.referral_code).toBeDefined();
    createdAffiliateId = res.body.data.id;
  });

  it("creates a staff-based affiliate", async () => {
    const res = await request(app)
      .post("/api/referrals/affiliates")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ staff_id: staffForAffiliateId });
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe("staff");
  });

  it("rejects duplicate staff affiliate", async () => {
    const res = await request(app)
      .post("/api/referrals/affiliates")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ staff_id: staffForAffiliateId });
    expect(res.status).toBe(409);
  });

  it("rejects when neither staff_id nor full_name provided", async () => {
    const res = await request(app)
      .post("/api/referrals/affiliates")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "no_name@test.com" });
    expect(res.status).toBe(422);
  });

  it("rejects non-existent staff_id", async () => {
    const res = await request(app)
      .post("/api/referrals/affiliates")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ staff_id: crypto.randomUUID() });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/referrals/affiliates", () => {
  it("returns all affiliates", async () => {
    const res = await request(app)
      .get("/api/referrals/affiliates")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("filters by active status", async () => {
    const res = await request(app)
      .get("/api/referrals/affiliates?active=true")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    res.body.data.forEach((a: any) => {
      expect(a.is_active).toBe(1); // MySQL true
    });
  });
});

describe("GET /api/referrals/affiliates/:id", () => {
  it("returns affiliate details", async () => {
    if (!createdAffiliateId) return;
    const res = await request(app)
      .get(`/api/referrals/affiliates/${createdAffiliateId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdAffiliateId);
    expect(res.body.data.recent_customers).toBeDefined();
  });

  it("returns 404 for non-existent", async () => {
    const res = await request(app)
      .get(`/api/referrals/affiliates/${crypto.randomUUID()}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/referrals/affiliates/:id", () => {
  it("updates affiliate full_name", async () => {
    if (!createdAffiliateId) return;
    const res = await request(app)
      .patch(`/api/referrals/affiliates/${createdAffiliateId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ full_name: "Updated Test Affiliate" });
    expect(res.status).toBe(200);
  });

  it("deactivates an affiliate", async () => {
    if (!createdAffiliateId) return;
    const res = await request(app)
      .patch(`/api/referrals/affiliates/${createdAffiliateId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ is_active: false });
    expect(res.status).toBe(200);
  });

  it("rejects invalid affiliate UUID", async () => {
    const res = await request(app)
      .patch("/api/referrals/affiliates/not-a-uuid")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ full_name: "test" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent affiliate", async () => {
    const res = await request(app)
      .patch(`/api/referrals/affiliates/${crypto.randomUUID()}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ full_name: "test" });
    expect(res.status).toBe(404);
  });
});

// ── Commissions ────────────────────────────────────────────────────────────

describe("GET /api/referrals/commissions", () => {
  it("returns commissions list", async () => {
    const res = await request(app)
      .get("/api/referrals/commissions")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe("GET /api/referrals/affiliates/:id/commissions", () => {
  it("returns commissions for a specific affiliate", async () => {
    if (!createdAffiliateId) return;
    const res = await request(app)
      .get(`/api/referrals/affiliates/${createdAffiliateId}/commissions`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe("PATCH /api/referrals/commissions/:id/pay", () => {
  beforeAll(async () => {
    if (!createdAffiliateId) return;
    // Create a test order and commission
    await pool.query(
      `INSERT INTO orders (id, customer_name, phone, city, total, status, source)
       VALUES ('ORD-REF-TEST', 'Ref Test', '123', 'City', 500, 'Pending', 'other')
       ON DUPLICATE KEY UPDATE customer_name = 'Ref Test'`
    );
    createdCommissionId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO referral_commissions (id, affiliate_id, order_id, commission_amount, commission_type, commission_value, order_total, status)
       VALUES (?, ?, 'ORD-REF-TEST', 50, 'percentage', 10, 500, 'pending')`,
      [createdCommissionId, createdAffiliateId]
    );
  });

  it("marks commission as paid", async () => {
    if (!createdCommissionId) return;
    const res = await request(app)
      .patch(`/api/referrals/commissions/${createdCommissionId}/pay`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("paid");
    expect(res.body.data.paid_at).toBeDefined();
  });

  it("rejects double-pay", async () => {
    if (!createdCommissionId) return;
    const res = await request(app)
      .patch(`/api/referrals/commissions/${createdCommissionId}/pay`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
  });

  it("returns 404 for non-existent commission", async () => {
    const res = await request(app)
      .patch(`/api/referrals/commissions/${crypto.randomUUID()}/pay`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

// ── Stats ──────────────────────────────────────────────────────────────────

describe("GET /api/referrals/stats", () => {
  it("returns aggregate stats", async () => {
    const res = await request(app)
      .get("/api/referrals/stats")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("total_affiliates");
    expect(res.body.data).toHaveProperty("active_affiliates");
    expect(res.body.data).toHaveProperty("total_commissions_generated");
    expect(res.body.data).toHaveProperty("total_paid");
    expect(res.body.data).toHaveProperty("total_pending");
  });
});
