/**
 * backend/tests/unit/rate-limit.test.ts
 * Asella Organic — Rate Limit Middleware Tests
 *
 * Tests src/middleware/rateLimit.ts:
 *   - generalRateLimit: returns 429 when exceeded (closes coverage gap)
 *
 * We use the /api/notifications/summary endpoint which requires auth —
 * this exercises the auth + rate-limit + 500-error paths together. To
 * reliably exceed the 600/min limit we send 605 requests with the
 * auth header.
 *
 * Run with:
 *   npx jest tests/unit/rate-limit.test.ts
 */

import request from "supertest";
import bcrypt  from "bcryptjs";
import type { Request, Response } from "express";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";
import {
  generalRateLimit,
  orderRateLimit,
  loginRateLimit,
} from "../../src/middleware/rateLimit.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const TS = Date.now();
let adminToken: string;

beforeAll(async () => {
  const hash = await bcrypt.hash("TestPass123!", 10);
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (UUID(), ?, ?, ?, 'RL Tester', 'admin', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [`rl_test_${TS}`, `rl_${TS}@asella.test`, hash]
  );
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: `rl_${TS}@asella.test`, password: "TestPass123!" });
  adminToken = res.body.data.token;
});

afterAll(async () => {
  await pool.query(`DELETE FROM staff_users WHERE username = ?`, [`rl_test_${TS}`]);
  await pool.end();
});

// ── Express-mock helpers for direct middleware calls ─────────────────────────
function makeReq(): Request {
  return {
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  } as any;
}
function makeRes(): Response {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json:   jest.fn().mockReturnThis(),
  };
  return res as Response;
}

describe("generalRateLimit", () => {
  it("returns 429 once the per-minute request count is exceeded", async () => {
    // Limit is 600/minute. Make 605 sequential requests; expect at
    // least one 429 by the time the 601st request fires.
    const LIMIT = 605;
    let count429 = 0;
    for (let i = 0; i < LIMIT; i++) {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${adminToken}`);
      if (res.status === 429) {
        count429++;
        if (count429 >= 1) break;
      }
    }
    expect(count429).toBeGreaterThan(0);
  }, 120_000);
});

describe("loginRateLimit (direct)", () => {
  it("returns 429 after the login attempt cap is exceeded", () => {
    // Direct middleware call — avoids the 5-minute wait of an integration
    // burst test. The rate limit uses an LRU cache keyed by IP; rapid
    // calls from 127.0.0.1 will hit the cap.
    let saw429 = false;
    for (let i = 0; i < 15; i++) {
      const req  = makeReq();
      const res  = makeRes();
      const n    = jest.fn();
      loginRateLimit(req, res, n);
      const status = (res as any).status.mock.calls[0]?.[0];
      if (status === 429) { saw429 = true; break; }
    }
    expect(saw429).toBe(true);
  });
});

describe("orderRateLimit (direct)", () => {
  it("returns 429 after the order cap is exceeded", () => {
    let saw429 = false;
    for (let i = 0; i < 15; i++) {
      const req = makeReq();
      const res = makeRes();
      const n   = jest.fn();
      orderRateLimit(req, res, n);
      const status = (res as any).status.mock.calls[0]?.[0];
      if (status === 429) { saw429 = true; break; }
    }
    expect(saw429).toBe(true);
  });
});

describe("generalRateLimit (direct)", () => {
  it("calls next() on first call (under limit)", () => {
    const req = makeReq();
    const res = makeRes();
    const n   = jest.fn() as any;
    generalRateLimit(req, res, n);
    expect(n).toHaveBeenCalledTimes(1);
  });
});
