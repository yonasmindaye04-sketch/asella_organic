/**
 * backend/tests/integration/sms.test.ts
 * Asella Organic — SMS management route tests
 *
 * The SMS surface had no route-level coverage at all: the four sms-* unit
 * suites exercise the pure libraries only, so routes/sms.ts (842 lines) and
 * lib/smsQueue.ts were reached by nothing. That gap is how
 * POST /api/sms/dispatch survived with a schema that stripped `campaign_id`,
 * leaving it permanently 404.
 *
 * Every test here runs against the real database with dispatch disabled, so
 * nothing is sent and no credits are spent. The provider layer is never
 * reached: the guards under test all sit in front of it.
 *
 * What is pinned:
 *   - authorisation (admin/manager only; employee and affiliate are refused)
 *   - input validation on every write endpoint
 *   - the 2FA and typed-confirmation gates on dispatch
 *   - consent and hard opt-out behaviour
 *   - that campaign_id actually survives request validation
 */

import request from "supertest";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

const TS = Date.now();
const PASSWORD = "SmsRoute123!";

let adminToken: string;
let managerToken: string;
let employeeToken: string;
let affiliateToken: string;
let twoFaSecret: string;
let twoFaToken: string;

const campaignIds: string[] = [];
const templateKeys: string[] = [];

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Minimal valid explicit recipient list. */
const RECIPIENTS = [{ phone: "+251911000001", name: "Route Test" }];

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);

  // otplib v13: generateSecret() guarantees the >=16-byte minimum that
  // verifySync enforces in middleware/2fa.ts, so the token below is one the
  // real 2FA path would accept.
  const { generateSecret, generateSync } = await import("otplib");
  twoFaSecret = generateSecret();
  twoFaToken = generateSync({ secret: twoFaSecret });

  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (?, ?, ?, ?, 'SMS Admin', 'admin', true),
            (?, ?, ?, ?, 'SMS Manager', 'manager', true),
            (?, ?, ?, ?, 'SMS Employee', 'employee', true),
            (?, ?, ?, ?, 'SMS Affiliate', 'affiliate', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [
      crypto.randomUUID(), uid("sms_admin"), `sms_admin_${TS}@test.com`, hash,
      crypto.randomUUID(), uid("sms_mgr"), `sms_mgr_${TS}@test.com`, hash,
      crypto.randomUUID(), uid("sms_emp"), `sms_emp_${TS}@test.com`, hash,
      crypto.randomUUID(), uid("sms_aff"), `sms_aff_${TS}@test.com`, hash,
    ],
  );

  const [admin] = await pool.query(`SELECT id FROM staff_users WHERE email = ?`, [`sms_admin_${TS}@test.com`]) as [any[], any];
  await pool.query(
    `UPDATE staff_users SET two_factor_secret = ?, two_factor_enabled = TRUE WHERE id = ?`,
    [twoFaSecret, admin[0].id],
  );

  const login = async (email: string) => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password: PASSWORD });
    return res.body?.data?.token as string;
  };

  [adminToken, managerToken, employeeToken, affiliateToken] = await Promise.all([
    login(`sms_admin_${TS}@test.com`),
    login(`sms_mgr_${TS}@test.com`),
    login(`sms_emp_${TS}@test.com`),
    login(`sms_aff_${TS}@test.com`),
  ]);
});

afterAll(async () => {
  for (const id of campaignIds) {
    await pool.query(`DELETE FROM sms_messages WHERE campaign_id = ?`, [id]).catch(() => {});
    await pool.query(`DELETE FROM sms_campaign_recipients WHERE campaign_id = ?`, [id]).catch(() => {});
    await pool.query(`DELETE FROM sms_campaign_exclusions WHERE campaign_id = ?`, [id]).catch(() => {});
    await pool.query(`DELETE FROM sms_campaigns WHERE id = ?`, [id]).catch(() => {});
  }
  for (const key of templateKeys) {
    await pool.query(`DELETE FROM sms_templates WHERE template_key = ?`, [key]).catch(() => {});
  }
  await pool.query(
    `DELETE FROM staff_users WHERE email LIKE 'sms\\_%@test.com'`,
  ).catch(() => {});
  await pool.end();
});

// ═════════════════════════════════════════════════════════════════════════
// Authorisation — every endpoint, every role
// ═════════════════════════════════════════════════════════════════════════

describe("SMS authorisation", () => {
  const guarded: Array<[string, string, unknown]> = [
    ["GET", "/api/sms/status", undefined],
    ["GET", "/api/sms/messages", undefined],
    ["GET", "/api/sms/campaigns", undefined],
    ["GET", "/api/sms/templates", undefined],
    ["POST", "/api/sms/preview", { text: "hi", recipients: RECIPIENTS }],
    ["POST", "/api/sms/campaigns", { name: "nope", body: "hi" }],
    ["POST", "/api/sms/templates", { template_key: "x.y", name: "n", body: "b" }],
    ["POST", "/api/sms/send-test", { to: "+251911000001", text: "hi" }],
    ["POST", "/api/sms/consent", { to: "+251911000001", action: "opt-in" }],
  ];

  it.each(guarded)("%s %s refuses an unauthenticated caller", async (method, path, body) => {
    const res = await (request(app) as any)[method.toLowerCase()](path).send(body);
    expect(res.status).toBe(401);
  });

  it.each(guarded)("%s %s refuses an employee", async (method, path, body) => {
    const res = await (request(app) as any)[method.toLowerCase()](path)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send(body);
    expect(res.status).toBe(403);
  });

  it.each(guarded)("%s %s refuses an affiliate", async (method, path, body) => {
    const res = await (request(app) as any)[method.toLowerCase()](path)
      .set("Authorization", `Bearer ${affiliateToken}`)
      .send(body);
    expect(res.status).toBe(403);
  });

  it("lets an admin and a manager through to a read endpoint", async () => {
    for (const token of [adminToken, managerToken]) {
      const res = await request(app).get("/api/sms/status")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════
// Status + messages
// ═════════════════════════════════════════════════════════════════════════

describe("GET /api/sms/status", () => {
  it("reports provider, queue depth and the configured ceilings", async () => {
    const res = await request(app).get("/api/sms/status")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(["smsethiopia", "textbee"]).toContain(res.body.data.provider);
    expect(typeof res.body.data.configured).toBe("boolean");
    expect(res.body.data.limits.maxSegments).toBe(5);
    expect(res.body.data.limits.maxDailyCostEtb).toBeGreaterThan(0);
  });
});

describe("GET /api/sms/messages", () => {
  it("paginates and clamps the limit to 100", async () => {
    const res = await request(app).get("/api/sms/messages?limit=9999")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(100);
  });

  it("treats a nonsense page or limit as the default rather than erroring", async () => {
    const res = await request(app).get("/api/sms/messages?page=abc&limit=-5")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("filters by category without erroring on an unknown value", async () => {
    const res = await request(app).get("/api/sms/messages?category=marketing")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// Preview — the dry run
// ═════════════════════════════════════════════════════════════════════════

describe("POST /api/sms/preview", () => {
  it("quotes segments and a cost band for an explicit list without sending", async () => {
    const res = await request(app).post("/api/sms/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ text: "Hello from the dry run", recipients: RECIPIENTS });

    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(1);
    expect(res.body.data.segmentCount).toBeGreaterThan(0);
    expect(res.body.data.costMaxEtb).toBeGreaterThan(0);
  });

  it("appends the opt-out footer to marketing copy so the quote matches billing", async () => {
    const res = await request(app).post("/api/sms/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ text: "New stock just landed", recipients: RECIPIENTS });
    expect(res.status).toBe(200);
    expect(res.body.data.body).toMatch(/STOP/);
  });

  it("rejects an empty body with 422", async () => {
    const res = await request(app).post("/api/sms/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ text: "   ", recipients: RECIPIENTS });
    expect(res.status).toBe(422);
  });

  it("rejects a missing body with 422", async () => {
    const res = await request(app).post("/api/sms/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ recipients: RECIPIENTS });
    expect(res.status).toBe(422);
  });

  it("bounds the recipient list rather than looping over whatever arrives", async () => {
    // PreviewSmsCampaignSchema caps this at 20,000. Without validate() the
    // loop below awaited once per entry, so an oversized body turned a free
    // endpoint into a long request holding a connection per recipient.
    const tooMany = Array.from({ length: 20_001 }, (_, i) => ({ phone: `+2519110${String(i).padStart(5, "0")}` }));
    const res = await request(app).post("/api/sms/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ text: "too many", recipients: tooMany });
    expect(res.status).toBe(422);
  });

  it("counts a malformed number as invalid instead of failing the whole run", async () => {
    const res = await request(app).post("/api/sms/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        text: "mixed",
        recipients: [
          { phone: "+251911000002" },
          { phone: "not-a-phone" },
          { phone: "+251911000002" },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.invalid).toBeGreaterThan(0);
    expect(res.body.data.deduped).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// Templates
// ═════════════════════════════════════════════════════════════════════════

describe("POST /api/sms/templates", () => {
  it("creates a template and is idempotent on template_key", async () => {
    const key = uid("route.tmpl");
    templateKeys.push(key);

    const first = await request(app).post("/api/sms/templates")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ template_key: key, name: "Route template", body: "Hello {{name}}" });
    expect(first.status).toBe(201);

    const second = await request(app).post("/api/sms/templates")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ template_key: key, name: "Route template v2", body: "Hi {{name}}" });
    expect(second.status).toBe(201);

    const [rows] = await pool.query(
      `SELECT COUNT(*) AS n FROM sms_templates WHERE template_key = ?`, [key],
    ) as [any[], any];
    expect(Number(rows[0].n)).toBe(1);
  });

  it("rejects a template_key containing characters outside the allowed set", async () => {
    const res = await request(app).post("/api/sms/templates")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ template_key: "bad key with spaces", name: "n", body: "b" });
    expect(res.status).toBe(422);
  });

  it("rejects a malformed locale", async () => {
    const res = await request(app).post("/api/sms/templates")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ template_key: uid("t"), name: "n", body: "b", locale: "english please" });
    expect(res.status).toBe(422);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// Campaigns
// ═════════════════════════════════════════════════════════════════════════

describe("POST /api/sms/campaigns", () => {
  it("creates a draft with an estimate and queues nothing", async () => {
    const res = await request(app).post("/api/sms/campaigns")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: uid("Campaign"), body: "Draft body", recipients: RECIPIENTS });

    expect(res.status).toBe(201);
    campaignIds.push(res.body.data.id);

    expect(res.body.data.recipientCount).toBe(1);
    expect(res.body.data.estimatedSegments).toBeGreaterThan(0);

    const [rows] = await pool.query(
      `SELECT status FROM sms_campaigns WHERE id = ?`, [res.body.data.id],
    ) as [any[], any];
    expect(rows[0].status).toBe("draft");

    // The draft is a planning artefact, not a send.
    const [msgs] = await pool.query(
      `SELECT COUNT(*) AS n FROM sms_messages WHERE campaign_id = ?`, [res.body.data.id],
    ) as [any[], any];
    expect(Number(msgs[0].n)).toBe(0);
  });

  it("requires a name of at least 3 characters", async () => {
    const res = await request(app).post("/api/sms/campaigns")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "ab", body: "x", recipients: RECIPIENTS });
    expect(res.status).toBe(422);
  });

  it("requires message text", async () => {
    const res = await request(app).post("/api/sms/campaigns")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: uid("Campaign"), recipients: RECIPIENTS });
    expect(res.status).toBe(422);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// Dispatch — the expensive operation
// ═════════════════════════════════════════════════════════════════════════

describe("POST /api/sms/dispatch", () => {
  async function makeDraft(overrides: Record<string, unknown> = {}): Promise<{ id: string; name: string }> {
    const name = uid("Dispatchable");
    const res = await request(app).post("/api/sms/campaigns")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name, body: "Dispatch body", recipients: RECIPIENTS, ...overrides });
    expect(res.status).toBe(201);
    campaignIds.push(res.body.data.id);
    return { id: res.body.data.id, name };
  }

  it("requires 2FA", async () => {
    const draft = await makeDraft();
    const res = await request(app).post("/api/sms/dispatch")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ campaign_id: draft.id, confirm_phrase: draft.name });

    // Rejected before any recipient is resolved or anything is enqueued.
    expect(res.status).not.toBe(200);
  });

  it("refuses a wrong 2FA code", async () => {
    const draft = await makeDraft();
    const res = await request(app).post("/api/sms/dispatch")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("x-2fa-token", "000000")
      .send({ campaign_id: draft.id, confirm_phrase: draft.name });

    expect([401, 403]).toContain(res.status);
  });

  it("keeps campaign_id through validation — it used to be stripped", async () => {
    // DispatchSmsCampaignSchema originally omitted campaign_id. validate()
    // replaces req.body with the parsed result and Zod strips unknown keys, so
    // the handler queried WHERE id = undefined, matched nothing, and answered
    // 404 for every possible campaign. A 404 here therefore means the id was
    // lost, not that the campaign is missing.
    const draft = await makeDraft();
    const res = await request(app).post("/api/sms/dispatch")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("x-2fa-token", twoFaToken)
      .send({ campaign_id: draft.id, confirm_phrase: draft.name });

    expect(res.status).not.toBe(404);
  });

  it("rejects a dispatch whose confirmation phrase does not match", async () => {
    const draft = await makeDraft();
    const res = await request(app).post("/api/sms/dispatch")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("x-2fa-token", twoFaToken)
      .send({ campaign_id: draft.id, confirm_phrase: "something else entirely" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/confirmation phrase/i);
  });

  it("404s for an id that is a well-formed UUID but does not exist", async () => {
    const res = await request(app).post("/api/sms/dispatch")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("x-2fa-token", twoFaToken)
      .send({ campaign_id: crypto.randomUUID(), confirm_phrase: "whatever" });

    expect(res.status).toBe(404);
  });

  it("rejects a non-UUID campaign_id at the schema rather than the database", async () => {
    const res = await request(app).post("/api/sms/dispatch")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("x-2fa-token", twoFaToken)
      .send({ campaign_id: "not-a-uuid", confirm_phrase: "whatever" });

    expect(res.status).toBe(422);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// Consent
// ═════════════════════════════════════════════════════════════════════════

describe("POST /api/sms/consent", () => {
  const phone = `+2519${String(TS).slice(-8)}`;

  beforeAll(async () => {
    // Consent is recorded against a customer record; the route answers 404
    // for a number it has never seen, which is the behaviour to preserve.
    await pool.query(
      `INSERT INTO customers (id, phone, name) VALUES (?, ?, 'Consent Test')
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [crypto.randomUUID(), phone.replace(/\s+/g, "")],
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM customers WHERE phone = ?`, [phone.replace(/\s+/g, "")]).catch(() => {});
  });

  it("404s for a valid number with no customer record", async () => {
    const res = await request(app).post("/api/sms/consent")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ to: "+251977700000", action: "opt-in" });
    expect(res.status).toBe(404);
  });

  it("records a hard opt-out and suppresses transactional sends", async () => {
    const res = await request(app).post("/api/sms/consent")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ to: phone, action: "hard-opt-out" });
    expect(res.status).toBe(200);

    const [rows] = await pool.query(
      `SELECT sms_opt_out_at FROM customers WHERE phone = ?`, [phone.replace(/\s+/g, "")],
    ) as [any[], any];
    expect(rows[0]?.sms_opt_out_at).not.toBeNull();

    // A hard opt-out must also stop a test send to that number.
    const send = await request(app).post("/api/sms/send-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ to: phone, text: "should be refused" });
    expect(send.status).toBe(409);
  });

  it("rejects an unknown action", async () => {
    const res = await request(app).post("/api/sms/consent")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ to: phone, action: "make-me-an-offer" });
    expect(res.status).toBe(422);
  });

  it("rejects a malformed number", async () => {
    const res = await request(app).post("/api/sms/consent")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ to: "12", action: "opt-in" });
    expect(res.status).toBe(422);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// Test send
// ═════════════════════════════════════════════════════════════════════════

describe("POST /api/sms/send-test", () => {
  it("rejects a malformed number before touching the provider", async () => {
    const res = await request(app).post("/api/sms/send-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ to: "12345", text: "hello" });
    expect(res.status).toBe(422);
  });

  it("rejects an empty body", async () => {
    const res = await request(app).post("/api/sms/send-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ to: "+251911000003", text: "" });
    expect(res.status).toBe(422);
  });

  it("carries its own tighter rate limit rather than the general /api budget", async () => {
    // The general limiter allows 600/minute. Every call here enqueues a real
    // message, so a dedicated budget is what stops a stolen admin session
    // from queueing hundreds of paid SMS.
    let sawLimit = false;
    for (let i = 0; i < 25; i++) {
      const res = await request(app).post("/api/sms/send-test")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({ to: `+25191100${String(1000 + i)}`, text: "rate limit probe" });
      if (res.status === 429) { sawLimit = true; break; }
    }
    expect(sawLimit).toBe(true);
  });
});
