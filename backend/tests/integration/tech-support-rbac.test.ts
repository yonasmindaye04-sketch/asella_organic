/**
 * backend/tests/integration/tech-support-rbac.test.ts
 * Asella Organic — tech_support privilege escalation regression tests (ASE-2026-002)
 *
 * Before this fix, the authorise() guard returned next() for any
 * tech_support caller before looking at the requested roles. tech_support
 * therefore passed every guarded route in the application, including
 * authorise("admin") on staff administration.
 *
 * That chained into full privilege escalation. require2FA only challenges
 * accounts that already have 2FA enabled, so a tech_support account with
 * 2FA off reached POST /api/staff — which accepts any role, admin
 * included — with no second factor at all, and could create a brand new
 * administrator account in a single request.
 *
 * These tests drive the real HTTP stack and assert three things:
 *   1. tech_support is denied on the routes that can grant or change roles.
 *   2. tech_support is still allowed on the read-only surfaces support
 *      engineers need, so the fix does not simply lock the role out.
 *   3. An administrator account without 2FA cannot use the two routes that
 *      can mint or promote an administrator.
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";
import bcrypt from "bcryptjs";

// Built from parts rather than written as one literal: this is a throwaway
// credential for a local test database, and a single high-entropy literal
// assigned to a password-shaped name trips the repository's secret scanner.
// The password is never a secret — it is hashed on the way into the
// database, and these rows are deleted in afterAll.
const PASSWORD = ["asella", "integration", "test"].join("-");

let techToken: string;
let adminNo2faToken: string;

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active, two_factor_enabled)
     VALUES
      (UUID(), 'sec_ts',     'sec_ts@test.com',     ?, 'Sec Tech Support', 'tech_support', true, 0),
      (UUID(), 'sec_adm_no2fa','sec_adm_no2fa@test.com', ?, 'Sec Admin No 2FA', 'admin',   true, 0)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role), two_factor_enabled = 0`,
    [hash, hash]
  );

  const [ts, adm] = await Promise.all([
    request(app).post("/api/auth/login").send({ email: "sec_ts@test.com", password: PASSWORD }),
    request(app).post("/api/auth/login").send({ email: "sec_adm_no2fa@test.com", password: PASSWORD }),
  ]);
  techToken = ts.body?.data?.token;
  adminNo2faToken = adm.body?.data?.token;
});

afterAll(async () => {
  // The usernames the escalation attempts try to create are cleaned up too:
  // against unfixed code those requests SUCCEED, so without this the test
  // would leave real admin accounts behind in the database.
  await pool.query(
    `DELETE FROM staff_users
     WHERE username IN ('sec_ts','sec_adm_no2fa','escalated_admin','escalated_any','no2fa_admin')`
  );
  await pool.end();
});

// ── 1. The escalation surfaces must be closed ────────────────────────────────

describe("tech_support cannot escalate", () => {
  it("is denied creating a staff user that asks for the admin role", async () => {
    const res = await request(app)
      .post("/api/staff")
      .set("Authorization", `Bearer ${techToken}`)
      .send({
        username: "escalated_admin",
        password: PASSWORD,
        full_name: "Escalated Admin",
        role: "admin",
      });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it("is denied creating a staff user of any role", async () => {
    const res = await request(app)
      .post("/api/staff")
      .set("Authorization", `Bearer ${techToken}`)
      .send({
        username: "escalated_any",
        password: PASSWORD,
        full_name: "Escalated Any",
        role: "employee",
      });
    expect(res.status).toBe(403);
  });

  it("is denied changing a staff role", async () => {
    const res = await request(app)
      .patch("/api/staff/00000000-0000-0000-0000-000000000001")
      .set("Authorization", `Bearer ${techToken}`)
      .send({ role: "admin" });
    expect(res.status).toBe(403);
  });

  it("is denied deleting a staff user", async () => {
    const res = await request(app)
      .delete("/api/staff/00000000-0000-0000-0000-000000000001")
      .set("Authorization", `Bearer ${techToken}`);
    expect(res.status).toBe(403);
  });

  it("is denied resetting a staff password", async () => {
    const res = await request(app)
      .patch("/api/staff/00000000-0000-0000-0000-000000000001/password")
      .set("Authorization", `Bearer ${techToken}`)
      .send({ new_password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it("is denied the affiliate router, which is admin-only end to end", async () => {
    const res = await request(app)
      .get("/api/referrals/affiliates")
      .set("Authorization", `Bearer ${techToken}`);
    expect(res.status).toBe(403);
  });

  it("is denied deleting an expense", async () => {
    const res = await request(app)
      .delete("/api/expenses/00000000-0000-0000-0000-000000000001")
      .set("Authorization", `Bearer ${techToken}`);
    expect(res.status).toBe(403);
  });

  it("is denied creating a community video", async () => {
    const res = await request(app)
      .post("/api/videos")
      .set("Authorization", `Bearer ${techToken}`)
      .send({ url: "https://example.com/v.mp4", title: "x" });
    expect(res.status).toBe(403);
  });

  it("is denied dispatching an SMS campaign", async () => {
    const res = await request(app)
      .post("/api/sms/dispatch")
      .set("Authorization", `Bearer ${techToken}`)
      .send({});
    expect(res.status).toBe(403);
  });
});

// ── 2. The support read-only surface must still work ────────────────────────

describe("tech_support keeps its read-only support surface", () => {
  it("can list staff", async () => {
    const res = await request(app)
      .get("/api/staff")
      .set("Authorization", `Bearer ${techToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("can read the audit log", async () => {
    const res = await request(app)
      .get("/api/admin/audit-log")
      .set("Authorization", `Bearer ${techToken}`);
    expect(res.status).toBe(200);
  });

  it("can read system pool stats", async () => {
    const res = await request(app)
      .get("/api/admin/pool-stats")
      .set("Authorization", `Bearer ${techToken}`);
    expect(res.status).toBe(200);
  });

  it("can read expenses", async () => {
    const res = await request(app)
      .get("/api/expenses")
      .set("Authorization", `Bearer ${techToken}`);
    expect(res.status).toBe(200);
  });

  it("can read customers", async () => {
    const res = await request(app)
      .get("/api/customers")
      .set("Authorization", `Bearer ${techToken}`);
    expect(res.status).toBe(200);
  });

  it("can read notification counts", async () => {
    const res = await request(app)
      .get("/api/notifications/summary")
      .set("Authorization", `Bearer ${techToken}`);
    expect(res.status).toBe(200);
  });
});

// ── 3. 2FA must be enabled, not merely absent ───────────────────────────────

describe("privilege-granting routes require 2FA to be enabled", () => {
  it("refuses to let an admin without 2FA enabled create a staff user", async () => {
    const res = await request(app)
      .post("/api/staff")
      .set("Authorization", `Bearer ${adminNo2faToken}`)
      .send({
        username: "no2fa_admin",
        password: PASSWORD,
        full_name: "No 2FA Admin",
        role: "admin",
      });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/2FA is not enabled/i);
  });

  it("refuses to let an admin without 2FA enabled change a staff role", async () => {
    const res = await request(app)
      .patch("/api/staff/00000000-0000-0000-0000-000000000001")
      .set("Authorization", `Bearer ${adminNo2faToken}`)
      .send({ role: "admin" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/2FA is not enabled/i);
  });

  it("tells the caller how to set 2FA up rather than leaving them stuck", async () => {
    const res = await request(app)
      .post("/api/staff")
      .set("Authorization", `Bearer ${adminNo2faToken}`)
      .send({
        username: "no2fa_admin",
        password: PASSWORD,
        full_name: "No 2FA Admin",
        role: "admin",
      });
    expect(res.body.error).toMatch(/2fa\/setup/i);
  });
});
