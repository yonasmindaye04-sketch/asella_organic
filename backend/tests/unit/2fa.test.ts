/**
 * backend/tests/unit/2fa.test.ts
 * Asella Organic — 2FA Middleware Tests
 */

import express from "express";
import request from "supertest";
import pool from "../../src/config/db.js";
import { require2FA } from "../../src/middleware/2fa.js";
import crypto from "crypto";
import { generateSync, generateSecret } from "otplib";

const app = express();
app.use(express.json());

let mockUserId: string | null = null;

// Mock authenticate middleware
app.use((req, res, next) => {
  if (mockUserId) (req as any).user = { id: mockUserId };
  next();
});

app.post("/test-2fa", require2FA, (req, res) => {
  res.json({ success: true });
});

let testUserId: string;
let secret: string;

beforeAll(async () => {
  testUserId = crypto.randomUUID();
  secret = generateSecret();
  
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active, two_factor_enabled, two_factor_secret)
     VALUES (?, '2fa_test_user', '2fa_test@test.com', 'dummyhash', '2FA Tester', 'admin', true, true, ?)`,
    [testUserId, secret]
  );
  
  const disabledUserId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active, two_factor_enabled)
     VALUES (?, '2fa_disabled_user', '2fa_disabled@test.com', 'dummyhash', 'Disabled 2FA', 'admin', true, false)`,
    [disabledUserId]
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM staff_users WHERE username IN ('2fa_test_user', '2fa_disabled_user')`);
  await pool.end();
});

describe("require2FA middleware", () => {
  it("returns 401 if x-2fa-token header is missing", async () => {
    mockUserId = testUserId;
    const res = await request(app).post("/test-2fa");
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("2FA token required");
  });

  it("returns 403 if 2FA is not enabled on account", async () => {
    // We fetch the disabled user id
    const [rows] = await pool.query(`SELECT id FROM staff_users WHERE username = '2fa_disabled_user'`) as [any[], any];
    mockUserId = rows[0].id;
    
    const res = await request(app)
      .post("/test-2fa")
      .set("x-2fa-token", "123456");
      
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("2FA is not enabled");
  });

  it("returns 401 for invalid or expired token", async () => {
    mockUserId = testUserId;
    const res = await request(app)
      .post("/test-2fa")
      .set("x-2fa-token", "000000"); // wrong token
      
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Invalid or expired 2FA token");
  });

  it("calls next() for valid token", async () => {
    mockUserId = testUserId;
    const validToken = generateSync({ secret });
    
    const res = await request(app)
      .post("/test-2fa")
      .set("x-2fa-token", validToken);
      
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
