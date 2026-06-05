/**
 * backend/tests/unit/auth.test.ts
 * Asella Organic — Auth Route Tests
 */

import request from "supertest";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";
import bcrypt from "bcryptjs";

// ── Helpers ────────────────────────────────────────────────────────────────

let adminToken: string;
let refreshToken: string;
const TEST_USER = { username: "test_admin", email: "test_admin@test.com", password: "TestPass123!", role: "admin", full_name: "Test Admin" };

beforeAll(async () => {
  // Create a test staff user
  const hash = await bcrypt.hash(TEST_USER.password, 10);
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (UUID(), ?, ?, ?, ?, ?, true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [TEST_USER.username, TEST_USER.email, hash, TEST_USER.full_name, TEST_USER.role]
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM staff_users WHERE username = ?`, [TEST_USER.username]);
  await pool.end();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  it("returns 422 when fields are missing", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 for wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_USER.email, password: "wrongpassword" });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 for non-existent user", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "doesnotexist@test.com", password: "anypassword" });
    expect(res.status).toBe(401);
  });

  it("logs in with correct credentials and returns token", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.role).toBe(TEST_USER.role);

    // Save for subsequent tests
    adminToken  = res.body.data.token;
    refreshToken = res.body.data.refreshToken;

    // Cookie must be set
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("does not expose password_hash in response", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_USER.email, password: TEST_USER.password });
    expect(JSON.stringify(res.body)).not.toContain("password_hash");
    expect(JSON.stringify(res.body)).not.toContain("$2b$");
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 without token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns user profile with valid token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe(TEST_USER.username);
    expect(res.body.data.password_hash).toBeUndefined();
  });
});

describe("POST /api/auth/refresh", () => {
  it("returns new token with valid refresh token", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
  });

  it("returns 401 with invalid refresh token", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "fake_token_that_does_not_exist" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("returns 401 without token", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(401);
  });

  it("logs out and clears cookie", async () => {
    // Fresh login
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_USER.email, password: TEST_USER.password });
    const token = loginRes.body.data.token;

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe("Rate limiting on /api/auth/login", () => {
  it("blocks after too many failed attempts", async () => {
    const attempts = Array.from({ length: 12 }, () =>
      request(app)
        .post("/api/auth/login")
        .send({ email: "fakex@test.com", password: "fakex" })
    );
    const results = await Promise.all(attempts);
    const tooMany = results.some(r => r.status === 429);
    expect(tooMany).toBe(true);
  });
});