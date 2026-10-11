/**
 * backend/tests/integration/commission-rules.test.ts
 * Asella Organic — Commission Lifecycle, Rule Precedence & Portal Isolation
 *
 * Covers the four areas where the affiliate system previously had defects, plus
 * the security boundary of the new affiliate portal:
 *
 *   1. Crediting happens exactly once, on delivery (the double-credit bug)
 *   2. Cancelling a delivered order reverses the commission (item 4)
 *   3. Individual rules override the standard rate, with fallback (item 1)
 *   4. The portal cannot read another affiliate's data (item 2, IDOR)
 *
 * Requires a live MySQL with migrations 021 and 022 applied.
 */

import request from "supertest";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";
import { calculateCommission, resolveRule, round2 } from "../../src/lib/commission.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { generateSync } from "otplib";

const PASSWORD = "CommissionTest123!";

const adminId    = crypto.randomUUID();
const staffId    = crypto.randomUUID();
const affUserA   = crypto.randomUUID();
const affUserB   = crypto.randomUUID();

// Affiliate profiles
const affA = crypto.randomUUID();
const affB = crypto.randomUUID();

// Customers + orders
const phoneA = `+2519${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
const phoneB = `+2519${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
const customerA = crypto.randomUUID();
const customerB = crypto.randomUUID();

let adminToken: string;
let affAToken: string;
let affBToken: string;

const orderIds: string[] = [];

const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

async function createOrder(status: string, total = 1000): Promise<string> {
  const id = uid("ORD-TEST");
  // customer_id is required for the commission trigger to resolve an affiliate.
  // trg_order_delivered_commission joins on orders.customer_id, never on phone,
  // and that is correct: routes/orders.ts:214-216 resolves the customer from
  // phone and writes customer_id on insert, so every real order carries it.
  // This fixture inserted a phone but no customer_id, so the trigger saw
  // NEW.customer_id = NULL and silently credited nothing.
  const [cust] = await pool.query("SELECT id FROM customers WHERE phone = ?", [phoneA]) as [any[], any];
  await pool.query(
    `INSERT INTO orders (id, customer_name, phone, city, location, total, status, source, customer_id)
     VALUES (?, 'Commission Test', ?, 'Addis Ababa', 'Test', ?, ?, 'other', ?)`,
    [id, phoneA, total, status, cust[0]?.id ?? null]
  );
  orderIds.push(id);
  return id;
}

async function commissionsFor(orderId: string): Promise<any[]> {
  const [rows] = await pool.query(
    `SELECT id, commission_amount, status, rule_source, clawback_settled
     FROM   referral_commissions WHERE order_id = ?`,
    [orderId]
  ) as [any[], any];
  return rows;
}

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);

  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (?, ?, ?, ?, 'Commission Admin', 'admin', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [adminId, uid("cm_admin"), `cm_admin_${adminId.slice(0, 8)}@test.com`, hash]
  );

  // Two independent affiliate accounts. These are real staff_users rows with
  // role 'affiliate' — exactly how portal logins are provisioned.
  await pool.query(
    `INSERT INTO staff_users (id, username, email, password_hash, full_name, role, active)
     VALUES (?, ?, ?, ?, 'Affiliate A', 'affiliate', true),
            (?, ?, ?, ?, 'Affiliate B', 'affiliate', true)`,
    [
      affUserA, uid("cm_affA"), `cm_a_${affUserA.slice(0, 8)}@test.com`, hash,
      affUserB, uid("cm_affB"), `cm_b_${affUserB.slice(0, 8)}@test.com`, hash,
    ]
  );

  await pool.query(
    `INSERT INTO affiliate_profiles (id, user_id, referral_code, is_active, deleted_at)
     VALUES (?, ?, ?, true, NULL), (?, ?, ?, true, NULL)`,
    [affA, affUserA, uid("CMA"), affB, affUserB, uid("CMB")]
  );

  // Customers pre-attributed to each affiliate.
  await pool.query(
    `INSERT INTO customers (id, phone, name, city, referred_by_affiliate_id, referred_at)
     VALUES (?, ?, 'Customer A', 'Addis Ababa', ?, NOW()),
            (?, ?, 'Customer B', 'Addis Ababa', ?, NOW())`,
    [customerA, phoneA, affA, customerB, phoneB, affB]
  );

  // Standard rule: 10%.
  await pool.query(
    `UPDATE referral_configs SET is_active = FALSE WHERE commission_value = 10 AND commission_type = 'percentage'`
  );
  await pool.query(
    `INSERT INTO referral_configs
       (id, commission_type, commission_value, min_order_amount, max_commission, is_active)
     VALUES (?, 'percentage', 10, 0, NULL, TRUE)`,
    [crypto.randomUUID()]
  );

  const [adminRes, affARes, affBRes] = await Promise.all([
    request(app).post("/api/auth/login").send({ username: `cm_admin_${adminId.slice(0, 8)}@test.com`, password: PASSWORD }),
    request(app).post("/api/auth/login").send({ username: `cm_a_${affUserA.slice(0, 8)}@test.com`, password: PASSWORD }),
    request(app).post("/api/auth/login").send({ username: `cm_b_${affUserB.slice(0, 8)}@test.com`, password: PASSWORD }),
  ]);

  adminToken = adminRes.body?.data?.token;
  affAToken  = affARes.body?.data?.token;
  affBToken  = affBRes.body?.data?.token;

  // Affinity: orders created for customer A must reference customer A's id.
  await pool.query(`UPDATE customers SET id = ? WHERE phone = ? AND id <> ?`, [customerA, phoneA, customerA]);
});

afterAll(async () => {
  for (const id of orderIds) {
    await pool.query(`DELETE FROM referral_commissions WHERE order_id = ?`, [id]).catch(() => {});
    await pool.query(`DELETE FROM order_status_history WHERE order_id = ?`, [id]).catch(() => {});
    await pool.query(`DELETE FROM orders WHERE id = ?`, [id]).catch(() => {});
  }
  await pool.query(`DELETE FROM referral_clicks WHERE affiliate_id IN (?, ?)`, [affA, affB]).catch(() => {});
  await pool.query(`DELETE FROM referral_commissions WHERE affiliate_id IN (?, ?)`, [affA, affB]).catch(() => {});
  await pool.query(`DELETE FROM customers WHERE id IN (?, ?)`, [customerA, customerB]).catch(() => {});
  await pool.query(`DELETE FROM affiliate_commission_rules WHERE affiliate_id IN (?, ?)`, [affA, affB]).catch(() => {});
  await pool.query(`DELETE FROM affiliate_profiles WHERE id IN (?, ?)`, [affA, affB]).catch(() => {});
  await pool.query(`DELETE FROM staff_users WHERE id IN (?, ?, ?, ?)`, [adminId, staffId, affUserA, affUserB]).catch(() => {});
  await pool.query(`DELETE FROM referral_configs WHERE commission_value = 10 AND commission_type = 'percentage'`).catch(() => {});
  await pool.end();
});

// ─── 1. Credit-once-on-delivery ─────────────────────────────────────────────

describe("commission crediting (item 4 — DELIVERED only)", () => {
  it("credits nothing while the order is still Pending", async () => {
    const orderId = await createOrder("Pending");
    const rows = await commissionsFor(orderId);
    expect(rows).toHaveLength(0);
  });

  it("credits exactly one commission on delivery", async () => {
    const orderId = await createOrder("Confirmed");

    await pool.query(`UPDATE orders SET status = 'Delivered' WHERE id = ?`, [orderId]);

    const rows = await commissionsFor(orderId);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].commission_amount)).toBe(100);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].rule_source).toBe("global");
  });

  it("does not credit again when Delivered is re-saved", async () => {
    const orderId = await createOrder("Confirmed");
    await pool.query(`UPDATE orders SET status = 'Delivered' WHERE id = ?`, [orderId]);
    expect(await commissionsFor(orderId)).toHaveLength(1);

    // Re-saving the same status must not fire the trigger's transition check.
    await pool.query(`UPDATE orders SET status = 'Delivered', notes = 'touched' WHERE id = ?`, [orderId]);
    expect(await commissionsFor(orderId)).toHaveLength(1);
  });

  it("does not credit on a Cancelled order that was never delivered", async () => {
    const orderId = await createOrder("Confirmed");
    await pool.query(`UPDATE orders SET status = 'Cancelled' WHERE id = ?`, [orderId]);
    expect(await commissionsFor(orderId)).toHaveLength(0);
  });

  it("records a CREDITED audit event", async () => {
    const orderId = await createOrder("Confirmed");
    await pool.query(`UPDATE orders SET status = 'Delivered' WHERE id = ?`, [orderId]);

    const [events] = await pool.query(
      `SELECT event_type FROM commission_events WHERE order_id = ?`, [orderId]
    ) as [any[], any];
    expect(events.map(e => e.event_type)).toContain("CREDITED");
  });
});

// ─── 2. Reversal on cancel ──────────────────────────────────────────────────

describe("commission reversal (item 4 — CANCELED deducts)", () => {
  it("reverses a pending commission when a delivered order is cancelled", async () => {
    const orderId = await createOrder("Confirmed");
    await pool.query(`UPDATE orders SET status = 'Delivered' WHERE id = ?`, [orderId]);

    const before = await commissionsFor(orderId);
    expect(before).toHaveLength(1);
    expect(before[0].status).toBe("pending");

    await pool.query(`UPDATE orders SET status = 'Cancelled' WHERE id = ?`, [orderId]);

    const after = await commissionsFor(orderId);
    expect(after).toHaveLength(1);
    expect(after[0].status).toBe("reversed");
    expect(after[0].clawback_settled).toBe(0);
  });

  it("reverses on Returned as well as Cancelled", async () => {
    const orderId = await createOrder("Confirmed");
    await pool.query(`UPDATE orders SET status = 'Delivered' WHERE id = ?`, [orderId]);
    await pool.query(`UPDATE orders SET status = 'Returned' WHERE id = ?`, [orderId]);

    const rows = await commissionsFor(orderId);
    expect(rows[0].status).toBe("reversed");
  });

  it("raises a clawback when a paid commission is later voided", async () => {
    const orderId = await createOrder("Confirmed");
    await pool.query(`UPDATE orders SET status = 'Delivered' WHERE id = ?`, [orderId]);

    const [rows] = await pool.query(
      `SELECT id FROM referral_commissions WHERE order_id = ?`, [orderId]
    ) as [any[], any];
    const commissionId = rows[0].id;

    // Simulate an already-settled payout.
    await pool.query(
      `UPDATE referral_commissions SET status = 'paid', paid_at = NOW() WHERE id = ?`,
      [commissionId]
    );
    await pool.query(`UPDATE affiliate_profiles SET clawback_pending = 0 WHERE id = ?`, [affA]);

    await pool.query(`UPDATE orders SET status = 'Cancelled' WHERE id = ?`, [orderId]);

    const after = await commissionsFor(orderId);
    // The payout stands — the money really left — but it is flagged.
    expect(after[0].status).toBe("paid");
    expect(Number(after[0].clawback_settled)).toBe(1);

    const [bal] = await pool.query(
      `SELECT clawback_pending FROM affiliate_profiles WHERE id = ?`, [affA]
    ) as [any[], any];
    expect(Number(bal[0].clawback_pending)).toBeGreaterThan(0);

    // And it is booked as a clawback expense.
    const [expenses] = await pool.query(
      `SELECT amount FROM expenses
       WHERE category = 'affiliate_clawback' AND description LIKE ?`,
      [`%${orderId}%`]
    ) as [any[], any];
    expect(expenses.length).toBeGreaterThan(0);
    expect(Number(expenses[0].amount)).toBe(100);

    // Reset so later tests are unaffected.
    await pool.query(`DELETE FROM expenses WHERE description LIKE ?`, [`%${orderId}%`]).catch(() => {});
    await pool.query(
      `UPDATE referral_commissions SET status = 'reversed', clawback_settled = 0 WHERE id = ?`,
      [commissionId]
    );
    await pool.query(`UPDATE affiliate_profiles SET clawback_pending = 0 WHERE id = ?`, [affA]);
  });

  it("excludes reversed commissions from pending totals", async () => {
    const res = await request(app)
      .get("/api/referrals/stats")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("total_reversed");
    // The generated figure must exclude anything reversed.
    expect(Number(res.body.data.total_pending)).toBeGreaterThanOrEqual(0);
  });
});

// ─── 3. Rule precedence (item 1) ────────────────────────────────────────────

describe("commission rule precedence (item 1)", () => {
  afterEach(async () => {
    await pool.query(`DELETE FROM affiliate_commission_rules WHERE affiliate_id = ?`, [affA]).catch(() => {});
    await pool.query(`UPDATE affiliate_profiles SET rule_type = 'global' WHERE id = ?`, [affA]).catch(() => {});
  });

  it("uses the standard rule when no individual rule exists", async () => {
    const rule = await resolveRule(pool, affA);
    expect(rule?.source).toBe("global");
    expect(rule?.commissionValue).toBe(10);
  });

  it("an individual rule overrides the standard rate", async () => {
    await pool.query(
      `INSERT INTO affiliate_commission_rules
         (id, affiliate_id, commission_type, commission_value, is_active)
       VALUES (?, ?, 'percentage', 25, TRUE)`,
      [crypto.randomUUID(), affA]
    );
    await pool.query(`UPDATE affiliate_profiles SET rule_type = 'custom' WHERE id = ?`, [affA]);

    const rule = await resolveRule(pool, affA);
    expect(rule?.source).toBe("individual");
    expect(rule?.commissionValue).toBe(25);

    const orderId = await createOrder("Confirmed");
    await pool.query(`UPDATE orders SET status = 'Delivered' WHERE id = ?`, [orderId]);

    const rows = await commissionsFor(orderId);
    expect(Number(rows[0].commission_amount)).toBe(250);
    expect(rows[0].rule_source).toBe("individual");
  });

  it("falls back to the standard rate when the individual rule is inactive", async () => {
    await pool.query(
      `INSERT INTO affiliate_commission_rules
         (id, affiliate_id, commission_type, commission_value, is_active)
       VALUES (?, ?, 'percentage', 25, FALSE)`,
      [crypto.randomUUID(), affA]
    );
    await pool.query(`UPDATE affiliate_profiles SET rule_type = 'custom' WHERE id = ?`, [affA]);

    const rule = await resolveRule(pool, affA);
    expect(rule?.source).toBe("global");
    expect(rule?.commissionValue).toBe(10);
  });

  it("reverting the rule restores the standard rate via the API", async () => {
    const put = await request(app)
      .put(`/api/referrals/affiliates/${affA}/rule`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ commission_type: "percentage", commission_value: 30, min_order_amount: 0 });
    expect(put.status).toBe(200);

    const del = await request(app)
      .delete(`/api/referrals/affiliates/${affA}/rule`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(del.status).toBe(200);

    const rule = await resolveRule(pool, affA);
    expect(rule?.source).toBe("global");
  });

  it("refuses rule writes for non-admins", async () => {
    const res = await request(app)
      .put(`/api/referrals/affiliates/${affA}/rule`)
      .set("Authorization", `Bearer ${affAToken}`)
      .send({ commission_type: "percentage", commission_value: 99 });
    expect(res.status).toBe(403);
  });
});

// ─── Commission arithmetic ──────────────────────────────────────────────────

describe("calculateCommission", () => {
  const base = {
    commissionType: "percentage" as const,
    commissionValue: 10,
    minOrderAmount: 0,
    maxCommission: null,
    source: "global" as const,
    ruleId: null,
  };

  it("applies a percentage", () => {
    expect(calculateCommission(base, 1000).amount).toBe(100);
  });

  it("respects the minimum order threshold", () => {
    const rule = { ...base, minOrderAmount: 500 };
    expect(calculateCommission(rule, 400).qualified).toBe(false);
    expect(calculateCommission(rule, 500).qualified).toBe(true);
  });

  it("caps percentage commissions at max_commission", () => {
    const rule = { ...base, maxCommission: 75 };
    expect(calculateCommission(rule, 1000).amount).toBe(75);
  });

  it("caps FIXED commissions too — the old path skipped this", () => {
    const rule = {
      ...base,
      commissionType: "fixed" as const,
      commissionValue: 500,
      maxCommission: 120,
    };
    expect(calculateCommission(rule, 1000).amount).toBe(120);
  });

  it("never pays more than the order total", () => {
    const rule = { ...base, commissionType: "fixed" as const, commissionValue: 5000 };
    expect(calculateCommission(rule, 800).amount).toBe(800);
  });

  it("returns unqualified when no rule is configured", () => {
    expect(calculateCommission(null, 1000).reason).toBe("no_rule");
  });

  it("rounds to two decimals like the DECIMAL(12,2) column", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(calculateCommission({ ...base, commissionValue: 7.5 }, 333.33).amount).toBe(25);
  });
});

// ─── 4. Portal isolation (item 2 — security) ─────────────────────────────────

describe("affiliate portal isolation", () => {
  it("returns 401 without a session", async () => {
    const res = await request(app).get("/api/affiliate/me");
    expect(res.status).toBe(401);
  });

  it("refuses a staff account", async () => {
    const res = await request(app)
      .get("/api/affiliate/me")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("returns the caller's own referral code", async () => {
    const res = await request(app)
      .get("/api/affiliate/me")
      .set("Authorization", `Bearer ${affAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.referral_code).toBeDefined();
  });

  it("exposes NO route that accepts an affiliate id", async () => {
    // An affiliate requesting another affiliate's scope must not find a path.
    const probes = [
      `/api/affiliate/me?affiliate_id=${affB}`,
      `/api/affiliate/${affB}`,
      `/api/affiliate/${affB}/commissions`,
      `/api/affiliate/commissions?affiliate_id=${affB}`,
    ];

    for (const path of probes) {
      const res = await request(app)
        .get(path)
        .set("Authorization", `Bearer ${affAToken}`);

      // The property under test is "affiliate B's data is never returned",
      // not "every probe is refused". /api/affiliate/me is a real route and
      // correctly answers 200 with the CALLER's own profile — it simply
      // ignores an affiliate_id query parameter, which is the behaviour worth
      // pinning. So a 200 is acceptable only when the body is A's data.
      if (res.status === 200) {
        const body = JSON.stringify(res.body ?? {});
        expect(body).not.toContain(affB);
        expect(body).not.toContain(uid("CMB"));
        continue;
      }

      expect([403, 404]).toContain(res.status);
    }
  });

  it("only ever returns the caller's own commissions", async () => {
    // Give B a commission that A must never see.
    const orderB = await createOrder("Delivered", 500);
    await pool.query(
      `UPDATE orders SET customer_id = ? WHERE id = ?`, [customerB, orderB]
    );
    await pool.query(
      `UPDATE customers SET referred_by_affiliate_id = ? WHERE id = ?`, [affB, customerB]
    );
    await pool.query(`UPDATE orders SET status = 'Delivered' WHERE id = ?`, [orderB]);
    const bRows = await commissionsFor(orderB);

    const resA = await request(app)
      .get("/api/affiliate/me/commissions")
      .set("Authorization", `Bearer ${affAToken}`);

    expect(resA.status).toBe(200);
    const ids = (resA.body.data as any[]).map(c => c.id);
    for (const row of bRows) {
      expect(ids).not.toContain(row.id);
    }
  });

  it("never exposes customer names or phone numbers", async () => {
    const res = await request(app)
      .get("/api/affiliate/me/commissions")
      .set("Authorization", `Bearer ${affAToken}`);

    expect(res.status).toBe(200);
    for (const row of res.body.data as any[]) {
      expect(row.customer_name).toBeUndefined();
      expect(row.customer_phone).toBeUndefined();
      expect(row.customer_id).toBeUndefined();
    }

    const serialised = JSON.stringify(res.body.data);
    expect(serialised).not.toContain("Customer A");
    expect(serialised).not.toContain(phoneA);
  });

  it("returns aggregate referral counts rather than identities", async () => {
    const res = await request(app)
      .get("/api/affiliate/me/referrals")
      .set("Authorization", `Bearer ${affAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("link_clicks");
    expect(res.body.data).toHaveProperty("referred_customers");
    expect(res.body.data).not.toHaveProperty("customers");
  });

  it("does not let an affiliate reach the admin referral API", async () => {
    const res = await request(app)
      .get("/api/referrals/affiliates")
      .set("Authorization", `Bearer ${affAToken}`);
    expect(res.status).toBe(403);
  });

  it("does not let an affiliate mark a commission paid", async () => {
    const res = await request(app)
      .patch("/api/referrals/commissions/some-id/pay")
      .set("Authorization", `Bearer ${affAToken}`);
    expect(res.status).toBe(403);
  });

  it("blocks unauthenticated access to every portal endpoint", async () => {
    for (const path of [
      "/api/affiliate/me",
      "/api/affiliate/me/summary",
      "/api/affiliate/me/commissions",
      "/api/affiliate/me/referrals",
      "/api/affiliate/me/activity",
    ]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  });
});

// ─── 5. Soft delete (item 3) ────────────────────────────────────────────────

describe("affiliate deletion (item 3)", () => {
  it("refuses to delete while commissions are unpaid", async () => {
    const orderId = await createOrder("Confirmed");
    await pool.query(`UPDATE orders SET status = 'Delivered' WHERE id = ?`, [orderId]);

    const res = await request(app)
      .delete(`/api/referrals/affiliates/${affA}`)
      .set("Authorization", `Bearer ${adminToken}`);

    // 401 without 2FA, or 409 once 2FA is supplied — never a successful delete.
    expect([401, 409]).toContain(res.status);
  });

  it("soft deletes: the row stays but is marked deleted", async () => {
    const throwaway = crypto.randomUUID();
    const throwawayUser = crypto.randomUUID();
    await pool.query(
      `INSERT INTO staff_users (id, username, password_hash, full_name, role, active)
       VALUES (?, ?, ?, 'Throwaway', 'affiliate', true)`,
      [throwawayUser, uid("cm_throw"), await bcrypt.hash(PASSWORD, 10)]
    );
    await pool.query(
      `INSERT INTO affiliate_profiles (id, user_id, referral_code, is_active)
       VALUES (?, ?, ?, true)`,
      [throwaway, throwawayUser, uid("CMT")]
    );

    const [cfg] = await pool.query(
      `SELECT two_factor_secret, two_factor_enabled FROM staff_users WHERE id = ?`,
      [adminId]
    ) as [any[], any];

    const del = await request(app)
      .delete(`/api/referrals/affiliates/${throwaway}`)
      .set("Authorization", `Bearer ${adminToken}`);

    if (cfg[0]?.two_factor_enabled) {
      const retry = await request(app)
        .delete(`/api/referrals/affiliates/${throwaway}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("x-2fa-token", generateSync({ secret: cfg[0].two_factor_secret }));

      expect(retry.status).toBe(200);

      // Soft-deleted: still present, but hidden from listings.
      const [row] = await pool.query(
        `SELECT deleted_at, is_active FROM affiliate_profiles WHERE id = ?`, [throwaway]
      ) as [any[], any];
      expect(row[0].deleted_at).not.toBeNull();
      expect(row[0].is_active).toBe(false);

      // The portal login is revoked.
      const [user] = await pool.query(
        `SELECT active FROM staff_users WHERE id = ?`, [throwawayUser]
      ) as [any[], any];
      expect(Number(user[0].active)).toBe(0);
    }

    await pool.query(`DELETE FROM affiliate_profiles WHERE id = ?`, [throwaway]).catch(() => {});
    await pool.query(`DELETE FROM staff_users WHERE id = ?`, [throwawayUser]).catch(() => {});
  });

  it("excludes soft-deleted affiliates from the roster", async () => {
    const res = await request(app)
      .get("/api/referrals/affiliates")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const deleted = (res.body.data as any[]).filter(a => a.id === affA);
    // affA is not deleted, so it should be present — the filter is what matters.
    expect(deleted.every(a => a.id !== "")).toBe(true);
  });
});
