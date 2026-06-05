/**
 * backend/tests/integration/staff.test.ts
 * Asella Organic — Staff Management Route Tests
 */

import request from "supertest";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { generateSync, generateSecret } from "otplib";

let adminToken: string;
let employeeToken: string;
const adminId    = crypto.randomUUID();
const employeeId = crypto.randomUUID();

// For 2FA tests
let twoFASecret: string;

// Track created staff for cleanup
const createdStaffIds: string[] = [];

beforeAll(async () => {
  const hash = await bcrypt.hash("StaffTest123!", 10);

  // Admin with 2FA enabled (for delete/password tests)
  twoFASecret = generateSecret();
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active, two_factor_enabled, two_factor_secret)
     VALUES (?, 'staff_test_admin', 'staff_admin@test.com', ?, 'Staff Admin', 'admin', true, true, ?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), two_factor_secret = VALUES(two_factor_secret), two_factor_enabled = true`,
    [adminId, hash, twoFASecret]
  );

  // Employee
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (?, 'staff_test_emp', 'staff_emp@test.com', ?, 'Staff Employee', 'employee', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [employeeId, hash]
  );

  const [adminRes, empRes] = await Promise.all([
    request(app).post("/api/auth/login").send({ email: "staff_admin@test.com", password: "StaffTest123!" }),
    request(app).post("/api/auth/login").send({ email: "staff_emp@test.com", password: "StaffTest123!" }),
  ]);
  adminToken    = adminRes.body.data.token;
  employeeToken = empRes.body.data.token;
});

afterAll(async () => {
  // Clean up created staff
  for (const id of createdStaffIds) {
    await pool.query(`DELETE FROM refresh_tokens WHERE user_id = ?`, [id]).catch(() => {});
    await pool.query(`DELETE FROM audit_log WHERE record_id = ?`, [id]).catch(() => {});
    await pool.query(`DELETE FROM staff_users WHERE id = ?`, [id]).catch(() => {});
  }
  await pool.query(`DELETE FROM refresh_tokens WHERE user_id IN (?, ?)`, [adminId, employeeId]).catch(() => {});
  await pool.query(`DELETE FROM audit_log WHERE record_id IN (?, ?)`, [adminId, employeeId]).catch(() => {});
  await pool.query(`DELETE FROM staff_users WHERE id IN (?, ?)`, [adminId, employeeId]).catch(() => {});
  await pool.end();
});

// ── GET /api/staff ─────────────────────────────────────────────────────────

describe("GET /api/staff", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/staff");
    expect(res.status).toBe(401);
  });

  it("returns 403 for employee role", async () => {
    const res = await request(app)
      .get("/api/staff")
      .set("Authorization", `Bearer ${employeeToken}`);
    expect(res.status).toBe(403);
  });

  it("returns paginated staff list for admin", async () => {
    const res = await request(app)
      .get("/api/staff")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty("total");
    expect(res.body.meta).toHaveProperty("page");
    expect(res.body.meta).toHaveProperty("limit");
    // Should not expose password_hash
    expect(JSON.stringify(res.body)).not.toContain("password_hash");
  });

  it("filters by role", async () => {
    const res = await request(app)
      .get("/api/staff?role=admin")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    res.body.data.forEach((s: any) => {
      expect(s.role).toBe("admin");
    });
  });

  it("searches by name", async () => {
    const res = await request(app)
      .get("/api/staff?search=staff_test_admin")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("respects pagination", async () => {
    const res = await request(app)
      .get("/api/staff?page=1&limit=2")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
    expect(res.body.meta.limit).toBe(2);
  });
});

// ── GET /api/staff/:id ─────────────────────────────────────────────────────

describe("GET /api/staff/:id", () => {
  it("returns specific staff member", async () => {
    const res = await request(app)
      .get(`/api/staff/${adminId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe("staff_test_admin");
    expect(res.body.data.password_hash).toBeUndefined();
  });

  it("returns 400 for invalid UUID", async () => {
    const res = await request(app)
      .get("/api/staff/not-a-uuid")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent staff", async () => {
    const res = await request(app)
      .get(`/api/staff/${crypto.randomUUID()}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

// ── POST /api/staff ────────────────────────────────────────────────────────

describe("POST /api/staff", () => {
  it("creates a new staff member", async () => {
    const res = await request(app)
      .post("/api/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        username: "staff_new_test",
        password: "NewStaff123!",
        full_name: "New Test Staff",
        role: "employee",
        email: "new_staff@test.com",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.username).toBe("staff_new_test");
    expect(res.body.data.role).toBe("employee");
    createdStaffIds.push(res.body.data.id);
  });

  it("rejects duplicate username", async () => {
    const res = await request(app)
      .post("/api/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        username: "staff_new_test",
        password: "Duplicate123!",
        full_name: "Dup",
        role: "employee",
      });
    expect(res.status).toBe(409);
  });

  it("rejects missing required fields", async () => {
    const res = await request(app)
      .post("/api/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ username: "missing_fields" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid role", async () => {
    const res = await request(app)
      .post("/api/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        username: "bad_role_user",
        password: "BadRole123!",
        full_name: "Bad Role",
        role: "superadmin",
      });
    expect(res.status).toBe(400);
  });

  it("rejects short password", async () => {
    const res = await request(app)
      .post("/api/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        username: "short_pass",
        password: "123",
        full_name: "Short",
        role: "employee",
      });
    expect(res.status).toBe(400);
  });

  it("returns 403 for employee role", async () => {
    const res = await request(app)
      .post("/api/staff")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({
        username: "emp_create",
        password: "EmpCreate123!",
        full_name: "Emp Created",
        role: "employee",
      });
    expect(res.status).toBe(403);
  });
});

// ── PATCH /api/staff/:id ───────────────────────────────────────────────────

describe("PATCH /api/staff/:id", () => {
  it("updates staff member full_name", async () => {
    if (createdStaffIds.length === 0) return;
    const res = await request(app)
      .patch(`/api/staff/${createdStaffIds[0]}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ full_name: "Updated Staff Name" });
    expect(res.status).toBe(200);
  });

  it("updates staff role", async () => {
    if (createdStaffIds.length === 0) return;
    const res = await request(app)
      .patch(`/api/staff/${createdStaffIds[0]}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "manager" });
    expect(res.status).toBe(200);
  });

  it("rejects invalid role", async () => {
    if (createdStaffIds.length === 0) return;
    const res = await request(app)
      .patch(`/api/staff/${createdStaffIds[0]}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "superuser" });
    expect(res.status).toBe(400);
  });

  it("rejects empty update", async () => {
    if (createdStaffIds.length === 0) return;
    const res = await request(app)
      .patch(`/api/staff/${createdStaffIds[0]}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent staff", async () => {
    const res = await request(app)
      .patch(`/api/staff/${crypto.randomUUID()}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ full_name: "Ghost" });
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/staff/:id (requires 2FA) ───────────────────────────────────

describe("DELETE /api/staff/:id", () => {
  let deleteTargetId: string;

  beforeAll(async () => {
    // Create a user to delete
    const hash = await bcrypt.hash("DeleteMe123!", 10);
    deleteTargetId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
       VALUES (?, 'staff_delete_target', 'delete_target@test.com', ?, 'Delete Target', 'employee', true)`,
      [deleteTargetId, hash]
    );
    createdStaffIds.push(deleteTargetId);
  });

  it("returns 401 without 2FA token", async () => {
    const res = await request(app)
      .delete(`/api/staff/${deleteTargetId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid 2FA token", async () => {
    const res = await request(app)
      .delete(`/api/staff/${deleteTargetId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("x-2fa-token", "000000");
    expect(res.status).toBe(401);
  });

  it("soft-deletes staff with valid 2FA", async () => {
    const validToken = generateSync({ secret: twoFASecret });
    const res = await request(app)
      .delete(`/api/staff/${deleteTargetId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("x-2fa-token", validToken);
    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain("deactivated");
  });

  it("prevents self-delete", async () => {
    const validToken = generateSync({ secret: twoFASecret });
    const res = await request(app)
      .delete(`/api/staff/${adminId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("x-2fa-token", validToken);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Cannot deactivate your own");
  });
});

// ── PATCH /api/staff/:id/password (requires 2FA) ──────────────────────────

describe("PATCH /api/staff/:id/password", () => {
  let passwordTargetId: string;

  beforeAll(async () => {
    const hash = await bcrypt.hash("OldPass123!", 10);
    passwordTargetId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
       VALUES (?, 'staff_pw_target', 'pw_target@test.com', ?, 'PW Target', 'employee', true)`,
      [passwordTargetId, hash]
    );
    createdStaffIds.push(passwordTargetId);
  });

  it("returns 401 without 2FA", async () => {
    const res = await request(app)
      .patch(`/api/staff/${passwordTargetId}/password`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ new_password: "NewPass123!" });
    expect(res.status).toBe(401);
  });

  it("rejects short password", async () => {
    const validToken = generateSync({ secret: twoFASecret });
    const res = await request(app)
      .patch(`/api/staff/${passwordTargetId}/password`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("x-2fa-token", validToken)
      .send({ new_password: "123" });
    expect(res.status).toBe(400);
  });

  it("resets password with valid 2FA", async () => {
    const validToken = generateSync({ secret: twoFASecret });
    const res = await request(app)
      .patch(`/api/staff/${passwordTargetId}/password`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("x-2fa-token", validToken)
      .send({ new_password: "NewSecure123!" });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain("Password updated");
  });

  it("returns 404 for non-existent staff", async () => {
    const validToken = generateSync({ secret: twoFASecret });
    const res = await request(app)
      .patch(`/api/staff/${crypto.randomUUID()}/password`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("x-2fa-token", validToken)
      .send({ new_password: "NewPass123!" });
    expect(res.status).toBe(404);
  });
});

// ── 2FA Setup / Verify / Disable ──────────────────────────────────────────

describe("POST /api/staff/2fa/setup", () => {
  it("returns 409 if 2FA already enabled", async () => {
    // Our admin already has 2FA enabled
    const res = await request(app)
      .post("/api/staff/2fa/setup")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
  });

  it("generates QR code and secret for user without 2FA", async () => {
    // Employee doesn't have 2FA yet
    const res = await request(app)
      .post("/api/staff/2fa/setup")
      .set("Authorization", `Bearer ${employeeToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.qr_code).toBeDefined();
    expect(res.body.data.manual_entry_key).toBeDefined();
  });
});

describe("POST /api/staff/2fa/verify", () => {
  it("rejects missing token field", async () => {
    const res = await request(app)
      .post("/api/staff/2fa/verify")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("rejects invalid TOTP code", async () => {
    const res = await request(app)
      .post("/api/staff/2fa/verify")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ token: "000000" });
    expect(res.status).toBe(401);
  });

  it("enables 2FA with valid TOTP code", async () => {
    // Get the secret that was stored for the employee
    const [rows] = await pool.query(
      `SELECT two_factor_secret FROM staff_users WHERE id = ?`,
      [employeeId]
    ) as [any[], any];
    const empSecret = rows[0]?.two_factor_secret;
    if (!empSecret) return; // 2FA setup wasn't called yet

    const validToken = generateSync({ secret: empSecret });
    const res = await request(app)
      .post("/api/staff/2fa/verify")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ token: validToken });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain("enabled");
  });
});

describe("DELETE /api/staff/2fa/disable", () => {
  it("returns 401 without 2FA token header", async () => {
    const res = await request(app)
      .delete("/api/staff/2fa/disable")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(401);
  });

  it("disables 2FA with valid token", async () => {
    // Use admin's 2FA secret
    const validToken = generateSync({ secret: twoFASecret });
    const res = await request(app)
      .delete("/api/staff/2fa/disable")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("x-2fa-token", validToken);
    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain("disabled");
  });
});
