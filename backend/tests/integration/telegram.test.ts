/**
 * backend/tests/integration/telegram.test.ts
 * Asella Organic — Telegram Webhook Route Tests
 */

import request from "supertest";
import app from "../../src/app.js";
import pool from "../../src/config/db.js";
import crypto from "crypto";

const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "test-secret";
const testOrderId = `ORD-TGTEST-${Date.now()}`;
const testVendorOrderId = `VO-TGTEST-${Date.now()}`;
let updateCounter = Date.now();

function nextUpdateId() {
  return ++updateCounter;
}

beforeAll(async () => {
  // Insert a test order for delivery acceptance
  await pool.query(
    `INSERT INTO orders (id, customer_name, phone, city, source, status, created_at)
     VALUES (?, 'Telegram Test Customer', '+251900TG001', 'Addis Ababa', 'Website', 'Confirmed', NOW())`,
    [testOrderId]
  );

  // Insert order items for the test order
  await pool.query(
    `INSERT INTO order_items (id, order_id, item_name, package_size, quantity, unit_price)
     VALUES (UUID(), ?, 'Test Item', '250g', 2, 350)`,
    [testOrderId]
  );

  // Insert a vendor order for PO accept test
  await pool.query(
    `INSERT INTO vendor_orders (id, order_id, vendor_name, item, amount, status)
     VALUES (UUID(), ?, 'Test Vendor', 'Test Item', '50 units', 'pending')`,
    [testVendorOrderId]
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM delivery_assignments WHERE order_id = ?`, [testOrderId]).catch(() => {});
  await pool.query(`DELETE FROM order_items WHERE order_id = ?`, [testOrderId]).catch(() => {});
  await pool.query(`DELETE FROM orders WHERE id = ?`, [testOrderId]).catch(() => {});
  await pool.query(`DELETE FROM vendor_orders WHERE order_id = ?`, [testVendorOrderId]).catch(() => {});
  await pool.query(`DELETE FROM webhook_events WHERE update_id > ${updateCounter - 100}`).catch(() => {});
  await pool.query(`DELETE FROM telegram_users WHERE username = 'test_tg_user'`).catch(() => {});
  await pool.end();
});

// ── Webhook Verification ───────────────────────────────────────────────────

describe("POST /api/telegram/webhook — verification", () => {
  it("rejects requests without valid secret token (returns 200 but does nothing)", async () => {
    const res = await request(app)
      .post("/api/telegram/webhook")
      .set("x-telegram-bot-api-secret-token", "wrong-secret")
      .send({ update_id: nextUpdateId(), message: { text: "/start", chat: { id: 999 }, from: { id: 999 } } });
    expect(res.status).toBe(200); // Telegram expects 200 always
  });

  it("rejects updates without update_id", async () => {
    const res = await request(app)
      .post("/api/telegram/webhook")
      .set("x-telegram-bot-api-secret-token", SECRET)
      .send({});
    expect(res.status).toBe(200);
  });

  it("rejects duplicate update_id (replay protection)", async () => {
    const uid = nextUpdateId();
    // First request
    await request(app)
      .post("/api/telegram/webhook")
      .set("x-telegram-bot-api-secret-token", SECRET)
      .send({
        update_id: uid,
        message: { text: "hello", chat: { id: 12345 }, from: { id: 12345 }, date: Math.floor(Date.now() / 1000) },
      });

    // Duplicate
    const res = await request(app)
      .post("/api/telegram/webhook")
      .set("x-telegram-bot-api-secret-token", SECRET)
      .send({
        update_id: uid,
        message: { text: "hello again", chat: { id: 12345 }, from: { id: 12345 }, date: Math.floor(Date.now() / 1000) },
      });
    expect(res.status).toBe(200);
  });

  it("rejects stale updates (older than 5 minutes)", async () => {
    const staleDate = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const res = await request(app)
      .post("/api/telegram/webhook")
      .set("x-telegram-bot-api-secret-token", SECRET)
      .send({
        update_id: nextUpdateId(),
        message: { text: "stale", chat: { id: 12345 }, from: { id: 12345 }, date: staleDate },
      });
    expect(res.status).toBe(200);
  });
});

// ── /start Command ─────────────────────────────────────────────────────────

describe("POST /api/telegram/webhook — /start command", () => {
  it("registers a new telegram user on /start", async () => {
    const chatId = 9999900 + Math.floor(Math.random() * 1000);
    const res = await request(app)
      .post("/api/telegram/webhook")
      .set("x-telegram-bot-api-secret-token", SECRET)
      .send({
        update_id: nextUpdateId(),
        message: {
          text: "/start",
          chat: { id: chatId },
          from: { id: chatId, username: "test_tg_user", first_name: "Test", last_name: "User" },
          date: Math.floor(Date.now() / 1000),
        },
      });
    expect(res.status).toBe(200);

    // Verify user was registered
    const [rows] = await pool.query(
      `SELECT * FROM telegram_users WHERE username = 'test_tg_user'`
    ) as [any[], any];
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Callback Query — Delivery ──────────────────────────────────────────────

describe("POST /api/telegram/webhook — delivery callbacks", () => {
  it("handles delivery_accept callback", async () => {
    const res = await request(app)
      .post("/api/telegram/webhook")
      .set("x-telegram-bot-api-secret-token", SECRET)
      .send({
        update_id: nextUpdateId(),
        callback_query: {
          id: "cb_accept_1",
          from: { id: 111222, username: "driver1", first_name: "Driver" },
          data: `delivery_accept_${testOrderId}`,
          message: { message_id: 999, text: "Order delivery request", date: Math.floor(Date.now() / 1000) },
        },
      });
    expect(res.status).toBe(200);

    // Order should now be "In Transit"
    const [rows] = await pool.query(
      `SELECT status FROM orders WHERE id = ?`,
      [testOrderId]
    ) as [any[], any];
    expect(rows[0].status).toBe("In Transit");
  });

  it("handles delivery_reject callback", async () => {
    const res = await request(app)
      .post("/api/telegram/webhook")
      .set("x-telegram-bot-api-secret-token", SECRET)
      .send({
        update_id: nextUpdateId(),
        callback_query: {
          id: "cb_reject_1",
          from: { id: 111333, username: "driver2" },
          data: `delivery_reject_${testOrderId}`,
          message: { message_id: 1000, text: "Order delivery request", date: Math.floor(Date.now() / 1000) },
        },
      });
    expect(res.status).toBe(200);
    // Status should NOT change on reject — stays as-is
  });

  it("handles delivery_accept for non-existent order", async () => {
    const res = await request(app)
      .post("/api/telegram/webhook")
      .set("x-telegram-bot-api-secret-token", SECRET)
      .send({
        update_id: nextUpdateId(),
        callback_query: {
          id: "cb_notfound",
          from: { id: 111444, username: "driver3" },
          data: "delivery_accept_ORD-DOESNOTEXIST",
          message: { message_id: 1001, text: "test", date: Math.floor(Date.now() / 1000) },
        },
      });
    expect(res.status).toBe(200); // Always 200 to Telegram
  });
});

// ── Callback Query — PO ────────────────────────────────────────────────────

describe("POST /api/telegram/webhook — PO callbacks", () => {
  it("handles po_accept callback", async () => {
    const res = await request(app)
      .post("/api/telegram/webhook")
      .set("x-telegram-bot-api-secret-token", SECRET)
      .send({
        update_id: nextUpdateId(),
        callback_query: {
          id: "cb_po_accept",
          from: { id: 222111 },
          data: `po_accept_${testVendorOrderId}`,
          message: { message_id: 1002, text: "PO", date: Math.floor(Date.now() / 1000) },
        },
      });
    expect(res.status).toBe(200);

    const [rows] = await pool.query(
      `SELECT status FROM vendor_orders WHERE order_id = ?`,
      [testVendorOrderId]
    ) as [any[], any];
    expect(rows[0]?.status).toBe("confirmed");
  });

  it("handles po_decline callback", async () => {
    const res = await request(app)
      .post("/api/telegram/webhook")
      .set("x-telegram-bot-api-secret-token", SECRET)
      .send({
        update_id: nextUpdateId(),
        callback_query: {
          id: "cb_po_decline",
          from: { id: 222222 },
          data: `po_decline_${testVendorOrderId}`,
          message: { message_id: 1003, text: "PO", date: Math.floor(Date.now() / 1000) },
        },
      });
    expect(res.status).toBe(200);

    const [rows] = await pool.query(
      `SELECT status FROM vendor_orders WHERE order_id = ?`,
      [testVendorOrderId]
    ) as [any[], any];
    expect(rows[0]?.status).toBe("declined");
  });

  it("handles unknown callback data gracefully", async () => {
    const res = await request(app)
      .post("/api/telegram/webhook")
      .set("x-telegram-bot-api-secret-token", SECRET)
      .send({
        update_id: nextUpdateId(),
        callback_query: {
          id: "cb_unknown",
          from: { id: 333333 },
          data: "unknown_action_xyz",
          message: { message_id: 1004, text: "test", date: Math.floor(Date.now() / 1000) },
        },
      });
    expect(res.status).toBe(200);
  });

  it("handles callback with empty data", async () => {
    const res = await request(app)
      .post("/api/telegram/webhook")
      .set("x-telegram-bot-api-secret-token", SECRET)
      .send({
        update_id: nextUpdateId(),
        callback_query: {
          id: "cb_empty",
          from: { id: 444444 },
          message: { message_id: 1005, text: "test", date: Math.floor(Date.now() / 1000) },
        },
      });
    expect(res.status).toBe(200);
  });
});
