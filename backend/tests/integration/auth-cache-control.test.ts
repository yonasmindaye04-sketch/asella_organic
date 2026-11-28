/**
 * backend/tests/integration/auth-cache-control.test.ts
 * Asella Organic — Session responses must not be cacheable (ASE-2026-024)
 *
 * POST /api/auth/login returned a live access token and refresh token with
 * no cache directives at all. Anything between the client and the API — a
 * CDN, a corporate proxy, a browser's back/forward cache — was free to keep
 * that body, and to hand the same tokens to whoever asked next.
 *
 * A response that carries a credential says so.
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";
import bcrypt from "bcryptjs";

const PASSWORD = ["asella", "cachecontrol", "test"].join("-");

let accessToken: string;
let refreshToken: string;

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);
  await pool.query(
    `INSERT INTO staff_users
       (id, username, email, password_hash, full_name, role, active, two_factor_enabled)
     VALUES (UUID(), 'cc_user', 'cc_user@test.com', ?, 'Cache Control User', 'employee', 1, 0)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), active = 1`,
    [hash]
  );

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "cc_user@test.com", password: PASSWORD });
  accessToken  = login.body?.data?.token;
  refreshToken = login.body?.data?.refreshToken;
});

afterAll(async () => {
  await pool.query(`DELETE FROM refresh_tokens WHERE user_id IN
                      (SELECT id FROM staff_users WHERE username = 'cc_user')`).catch(() => {});
  await pool.query(`DELETE FROM staff_users WHERE username = 'cc_user'`).catch(() => {});
  await pool.end();
});

describe("session responses are not cacheable", () => {
  it("marks the login response no-store", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "cc_user@test.com", password: PASSWORD });

    expect(login.status).toBe(200);
    // The body carries a live access token and refresh token.
    expect(login.body?.data?.token).toBeTruthy();
    expect(login.headers["cache-control"]).toMatch(/no-store/i);
  });

  it("marks the refresh response no-store", async () => {
    const refreshed = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body?.data?.token).toBeTruthy();
    expect(refreshed.headers["cache-control"]).toMatch(/no-store/i);
  });

  it("does not let a cached login body be served to the next caller", async () => {
    // Two sign-ins, different bodies — a cache that had kept the first
    // response would return it again.
    const first = await request(app)
      .post("/api/auth/login")
      .send({ email: "cc_user@test.com", password: PASSWORD });
    const second = await request(app)
      .post("/api/auth/login")
      .send({ email: "cc_user@test.com", password: PASSWORD });

    expect(first.headers["cache-control"]).toMatch(/no-store/i);
    expect(second.headers["cache-control"]).toMatch(/no-store/i);
    expect(second.body?.data?.token).not.toBe(first.body?.data?.token);
  });
});
