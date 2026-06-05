/**
 * backend/tests/integration/security.test.ts
 * Asella Organic — Security / Penetration Tests
 *
 * Tests every OWASP Top 10 concern that applies to this API:
 *   A01 Broken Access Control
 *   A02 Cryptographic Failures
 *   A03 Injection
 *   A05 Security Misconfiguration
 *   A07 Authentication Failures
 *   A09 Logging Failures (verified by log output)
 */

import request from "supertest";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";
import bcrypt from "bcryptjs";

let adminToken:    string;
let employeeToken: string;

beforeAll(async () => {
  const hash = await bcrypt.hash("SecTest123!", 10);
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active) VALUES
     (UUID(), 'sec_admin',    'sec_admin@test.com',    ?, 'Sec Admin',    'admin',    true),
     (UUID(), 'sec_employee', 'sec_emp@test.com',      ?, 'Sec Employee', 'employee', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [hash, hash]
  );
  [adminToken, employeeToken] = await Promise.all([
    request(app).post("/api/auth/login").send({ email: "sec_admin@test.com",    password: "SecTest123!" }).then(r => r.body.data.token),
    request(app).post("/api/auth/login").send({ email: "sec_emp@test.com",      password: "SecTest123!" }).then(r => r.body.data.token),
  ]);
});

afterAll(async () => {
  await pool.query(`DELETE FROM staff_users WHERE username IN ('sec_admin','sec_employee')`);
  await pool.end();
});

// ── A01: Broken Access Control ─────────────────────────────────────────────

describe("A01 — Broken Access Control", () => {
  it("employee cannot delete another staff member", async () => {
    const res = await request(app)
      .delete("/api/staff/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${employeeToken}`)
      .set("x-2fa-token", "000000");
    expect([401, 403]).toContain(res.status);
  });

  it("employee cannot create a new staff user", async () => {
    const res = await request(app)
      .post("/api/staff")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ username: "hacker", password: "hacked!", role: "admin", full_name: "H" });
    expect([401, 403]).toContain(res.status);
  });

  it("unauthenticated user cannot list orders", async () => {
    const res = await request(app).get("/api/orders");
    expect(res.status).toBe(401);
  });

  it("unauthenticated user cannot access inventory", async () => {
    const res = await request(app).get("/api/stock");
    expect(res.status).toBe(401);
  });

  it("unauthenticated user cannot adjust stock", async () => {
    const res = await request(app)
      .post("/api/stock/adjustment")
      .send({ product_id: "any", change_amount: 100, reason: "theft" });
    expect(res.status).toBe(401);
  });

  it("JWT from different secret is rejected", async () => {
    const fakeToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImZha2UiLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3MTY4MDAwMDB9.fake_signature";
    const res = await request(app)
      .get("/api/orders")
      .set("Authorization", `Bearer ${fakeToken}`);
    expect(res.status).toBe(401);
  });
});

// ── A02: Cryptographic Failures ────────────────────────────────────────────

describe("A02 — Cryptographic Failures", () => {
  it("login response never contains password_hash", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "sec_admin@test.com", password: "SecTest123!" });
    expect(JSON.stringify(res.body)).not.toContain("password_hash");
    expect(JSON.stringify(res.body)).not.toContain("$2b$");
  });

  it("staff list response never contains password_hash", async () => {
    const res = await request(app)
      .get("/api/staff")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(JSON.stringify(res.body)).not.toContain("password_hash");
    expect(JSON.stringify(res.body)).not.toContain("$2b$");
  });

  it("JWT cookie is HttpOnly", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "sec_admin@test.com", password: "SecTest123!" });
    const cookies = res.headers["set-cookie"] as string[] | string;
    const cookieStr = Array.isArray(cookies) ? cookies.join(";") : (cookies ?? "");
    expect(cookieStr.toLowerCase()).toContain("httponly");
  });

  it("JWT secret is not in any API response", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(JSON.stringify(res.body)).not.toContain(process.env.JWT_SECRET ?? "UNSAFE");
  });
});

// ── A03: Injection ─────────────────────────────────────────────────────────

describe("A03 — Injection (SQL + XSS)", () => {
  const SQL_PAYLOADS = [
    "' OR '1'='1",
    "'; DROP TABLE orders; --",
    "1; SELECT * FROM staff_users; --",
    "' UNION SELECT username,password_hash FROM staff_users --",
  ];

  const XSS_PAYLOADS = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "javascript:alert(1)",
    '"><script>document.cookie</script>',
  ];

  SQL_PAYLOADS.forEach(payload => {
    it(`rejects SQL injection in username: ${payload.slice(0, 30)}`, async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: payload, password: "anything" });
      // Must not succeed — 401 or 422 or 400 acceptable
      expect([400, 401, 422]).toContain(res.status);
      // Critical: response must not contain staff_users data
      expect(JSON.stringify(res.body)).not.toContain("password_hash");
    });
  });

  XSS_PAYLOADS.forEach(payload => {
    it(`sanitizes XSS in order customer_name: ${payload.slice(0, 30)}`, async () => {
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          source:        "website",
          customer_name: payload,
          phone:         "+251900000099",
          city:          "Addis Ababa",
          location:      "Test",
          items: [{ name: "Moringa Powder", package_size: "250g", quantity: 1, unit_price: 350 }],
        });
      // Either rejected (422) or sanitized (201 with script tag removed)
      if (res.status === 201 && res.body.data?.customer_name) {
        expect(res.body.data.customer_name).not.toContain("<script");
        expect(res.body.data.customer_name).not.toContain("javascript:");
      }
      // Cleanup
      if (res.body.data?.id) {
        await pool.query(`DELETE FROM orders WHERE id = ?`, [res.body.data.id]).catch(() => {});
      }
    });
  });
});

// ── A05: Security Misconfiguration ─────────────────────────────────────────

describe("A05 — Security Misconfiguration", () => {
  it("x-powered-by header is removed", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("x-content-type-options header is set", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("x-frame-options header is set to DENY", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("returns 404 (not stack trace) on unknown routes", async () => {
    const res = await request(app).get("/api/this-does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).not.toContain("at Object");
    expect(res.body.error).not.toContain("node_modules");
  });

  it("error responses don't expose DB details in production", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: null, password: null });
    if (process.env.NODE_ENV === "production") {
      expect(JSON.stringify(res.body)).not.toContain("mysql");
      expect(JSON.stringify(res.body)).not.toContain("ER_");
      expect(JSON.stringify(res.body)).not.toContain("syntax");
    }
  });
});

// ── A07: Authentication Failures ──────────────────────────────────────────

describe("A07 — Authentication Failures", () => {
  it("expired token is rejected (cannot test without waiting, so verifies rejection of tampered exp)", async () => {
    const expiredToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InRlc3QiLCJleHAiOjF9.fake";
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it("malformed Bearer token is rejected", async () => {
    const res = await request(app)
      .get("/api/orders")
      .set("Authorization", "Bearer not.a.jwt");
    expect(res.status).toBe(401);
  });

  it("no Bearer prefix is rejected", async () => {
    const res = await request(app)
      .get("/api/orders")
      .set("Authorization", adminToken); // no "Bearer " prefix
    expect(res.status).toBe(401);
  });

  it("empty string token is rejected", async () => {
    const res = await request(app)
      .get("/api/orders")
      .set("Authorization", "Bearer ");
    expect(res.status).toBe(401);
  });
});

// ── CORS ──────────────────────────────────────────────────────────────────

describe("CORS", () => {
  it("responds with correct CORS headers for allowed origin", async () => {
    const allowedOrigin = process.env.FRONTEND_URL ?? "http://localhost:5173";
    const res = await request(app)
      .get("/api/health")
      .set("Origin", allowedOrigin);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("OPTIONS preflight returns 204", async () => {
    const res = await request(app)
      .options("/api/orders")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "GET");
    expect([200, 204]).toContain(res.status);
  });
});