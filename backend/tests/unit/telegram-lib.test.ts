/**
 * backend/tests/unit/telegram-lib.test.ts
 * Asella Organic — Telegram Bot Helpers Unit Tests
 *
 * Tests src/lib/telegram.ts: pure formatters, senders that hit the
 * Telegram Bot API, and DB-backed helpers.
 *
 * The HTTP layer (`globalThis.fetch` to api.telegram.org) is stubbed so
 * no real network calls are made. DB-backed helpers use the real
 * pool — they're integration-flavored but live in the unit suite
 * because their behaviour is small and self-contained.
 *
 * Run with:
 *   npx jest tests/unit/telegram-lib.test.ts
 */

import { jest } from "@jest/globals";
import pool from "../../src/config/db.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Mock the global fetch so we never hit api.telegram.org ──────────────────
const mockFetch = jest.fn() as unknown as jest.MockedFunction<(...args: any[]) => any>;
let originalFetch: typeof globalThis.fetch;

beforeAll(() => {
  originalFetch = globalThis.fetch;
  (globalThis as any).fetch = mockFetch;
});

afterAll(async () => {
  (globalThis as any).fetch = originalFetch;
  await pool.end();
});

beforeEach(() => {
  mockFetch.mockReset();
  // Default: Telegram returns ok
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, result: { message_id: 12345 } }),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Imports SUT AFTER the fetch mock is installed
// ─────────────────────────────────────────────────────────────────────────────
import {
  sendSimpleMessage,
  answerCallbackQuery,
  editMessageText,
  formatGroupDeliveryMessage,
  formatPrivateDeliveryMessage,
  sendWithButtons,
  sendOrderToAdmin,
  sendToDeliveryGroup,
  sendDetailsToAssignedDriver,
  sendTelegramToCustomer,
  sendLowStockAlert,
  sendStockRequestAlert,
  storePendingVendorMessage,
  sendVendorPO,
  sendMorningBriefing,
  enforceStringValue,
} from "../../src/lib/telegram.js";

// ─────────────────────────────────────────────────────────────────────────────
// Pure formatters
// ─────────────────────────────────────────────────────────────────────────────

describe("formatGroupDeliveryMessage", () => {
  it("formats an order with items into a delivery-group summary", () => {
    const order = {
      id: "ORD-1",
      city: "Addis Ababa",
      location: "Bole",
      items: [
        { name: "Moringa", package_size: "250g", quantity: 2 },
        { item_name: "Turmeric", size: "100g", quantity: 1 },
      ],
      created_at: "2026-06-01T10:00:00Z",
    };
    const text = formatGroupDeliveryMessage(order);
    expect(text).toContain("📦 *New Delivery Order*");
    expect(text).toContain("🆔 *Order:* ORD-1");
    expect(text).toContain("🏙 *City:* Addis Ababa");
    expect(text).toContain("📍 *Location:* Bole");
    expect(text).toContain("Moringa");
    expect(text).toContain("[250g] × 2");
    expect(text).toContain("Turmeric");
    expect(text).toContain("[100g] × 1");
  });

  it("falls back to 'Std' size and 'Item' name when fields are missing", () => {
    const text = formatGroupDeliveryMessage({
      id: "X",
      items: [{}],
    });
    expect(text).toContain("• Item [Std] × 1");
  });

  it("uses 'No items listed' when items array is empty", () => {
    const text = formatGroupDeliveryMessage({ id: "X", items: [] });
    expect(text).toContain("No items listed");
  });

  it("handles a missing items array gracefully", () => {
    const text = formatGroupDeliveryMessage({ id: "X" });
    expect(text).toContain("No items listed");
  });

  it("uses 'N/A' for missing order id, city, location", () => {
    const text = formatGroupDeliveryMessage({});
    expect(text).toContain("🆔 *Order:* N/A");
    expect(text).toContain("🏙 *City:* Addis Ababa"); // default
    expect(text).toContain("📍 *Location:* N/A");
  });
});

describe("formatPrivateDeliveryMessage", () => {
  it("includes order details, customer, phone, and total", () => {
    const text = formatPrivateDeliveryMessage({
      id: "ORD-99",
      customer_name: "Yonas T.",
      phone: "+251911223344",
      location: "Bole",
      city: "Addis Ababa",
      order_type: "Online",
      total: 1750,
      payment_method: "Cash",
      notes: "Leave at door",
      items: [{ name: "Honey", package_size: "500g", quantity: 1 }],
    });
    expect(text).toContain("🚗 *DELIVERY ORDER");
    expect(text).toContain("🆔 *Order ID:* `ORD-99`");
    expect(text).toContain("👤 *Customer:* Yonas T.");
    expect(text).toContain("📞 *Phone:* +251911223344");
    expect(text).toContain("📍 *Address:* Bole, Addis Ababa");
    expect(text).toContain("📋 *Order Type:* Online");
    expect(text).toContain("💰 *Total:* ETB 1750");
    expect(text).toContain("💳 *Payment:* Cash");
    expect(text).toContain("📝 *Notes:* Leave at door");
    expect(text).toContain("Honey");
  });

  it("uses 'None' for missing notes", () => {
    const text = formatPrivateDeliveryMessage({ id: "X" });
    expect(text).toContain("📝 *Notes:* None");
  });
});

describe("enforceStringValue", () => {
  it("returns empty string for undefined", () => {
    expect(enforceStringValue(undefined)).toBe("");
  });
  it("returns empty string for empty string", () => {
    expect(enforceStringValue("")).toBe("");
  });
  it("returns the string as-is for a single string", () => {
    expect(enforceStringValue("hello")).toBe("hello");
  });
  it("returns first element of a string array", () => {
    expect(enforceStringValue(["first", "second"])).toBe("first");
  });
  it("returns empty string for an empty array", () => {
    expect(enforceStringValue([])).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Primitive senders (call tg() → fetch)
// ─────────────────────────────────────────────────────────────────────────────

describe("sendSimpleMessage", () => {
  it("POSTs to /sendMessage with chat_id and text", async () => {
    await sendSimpleMessage(12345, "hello");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toMatch(/api\.telegram\.org\/bot.+\/sendMessage$/);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe(12345);
    expect(body.text).toBe("hello");
    expect(body.parse_mode).toBe("Markdown");
  });
});

describe("answerCallbackQuery", () => {
  it("includes only callback_query_id when no text is provided", async () => {
    await answerCallbackQuery("cb_1");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.callback_query_id).toBe("cb_1");
    expect(body.text).toBeUndefined();
    expect(body.show_alert).toBeUndefined();
  });

  it("includes text and show_alert when provided", async () => {
    await answerCallbackQuery("cb_2", "Done!", true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.callback_query_id).toBe("cb_2");
    expect(body.text).toBe("Done!");
    expect(body.show_alert).toBe(true);
  });
});

describe("editMessageText", () => {
  it("POSTs the right payload to /editMessageText", async () => {
    await editMessageText(999, 42, "new text");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.chat_id).toBe(999);
    expect(body.message_id).toBe(42);
    expect(body.text).toBe("new text");
    expect(body.parse_mode).toBe("Markdown");
  });
});

describe("sendWithButtons", () => {
  it("sends reply_markup with inline_keyboard", async () => {
    const buttons = [[{ text: "OK", callback_data: "ok_1" }]];
    await sendWithButtons(12345, "msg", buttons);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reply_markup.inline_keyboard).toEqual(buttons);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Order / vendor / notification senders
// ─────────────────────────────────────────────────────────────────────────────

describe("sendOrderToAdmin", () => {
  const originalAdminChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
  beforeAll(() => { process.env.TELEGRAM_ADMIN_CHAT_ID = "111"; });
  afterAll(()  => { process.env.TELEGRAM_ADMIN_CHAT_ID = originalAdminChat; });

  it("skips regular orders (returns without fetching)", async () => {
    await sendOrderToAdmin({ id: "ORD-1", message_type: "order" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips when no admin chat id is set", async () => {
    const orig = process.env.TELEGRAM_ADMIN_CHAT_ID;
    process.env.TELEGRAM_ADMIN_CHAT_ID = "";
    await sendOrderToAdmin({ id: "ORD-1", message_type: "issue" });
    process.env.TELEGRAM_ADMIN_CHAT_ID = orig;
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends non-regular messages to admin chat", async () => {
    await sendOrderToAdmin({ id: "ORD-1", message_type: "issue" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.chat_id).toBe("111");
  });
});

describe("sendToDeliveryGroup", () => {
  const originalGroup = process.env.TELEGRAM_DELIVERY_GROUP_ID;
  beforeAll(() => { process.env.TELEGRAM_DELIVERY_GROUP_ID = "-100123"; });
  afterAll(()  => { process.env.TELEGRAM_DELIVERY_GROUP_ID = originalGroup; });

  it("returns null when no group chat id is set", async () => {
    const orig = process.env.TELEGRAM_DELIVERY_GROUP_ID;
    process.env.TELEGRAM_DELIVERY_GROUP_ID = "";
    const result = await sendToDeliveryGroup({ id: "ORD-1" });
    process.env.TELEGRAM_DELIVERY_GROUP_ID = orig;
    expect(result).toBeNull();
  });

  it("sends the formatted message with accept/reject buttons", async () => {
    const result = await sendToDeliveryGroup({ id: "ORD-42", items: [] });
    expect(result).toBe(12345); // mocked message_id
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.chat_id).toBe("-100123");
    expect(body.reply_markup.inline_keyboard[0][0].callback_data).toBe("delivery_accept_ORD-42");
    expect(body.reply_markup.inline_keyboard[0][1].callback_data).toBe("delivery_reject_ORD-42");
  });

  it("returns null when Telegram returns !ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ ok: false, description: "bad" }),
    });
    const result = await sendToDeliveryGroup({ id: "ORD-1" });
    expect(result).toBeNull();
  });
});

describe("sendDetailsToAssignedDriver", () => {
  it("sends a private formatted message to the driver chat id", async () => {
    await sendDetailsToAssignedDriver(777, { id: "ORD-1", items: [] });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.chat_id).toBe(777);
    expect(body.text).toContain("🚗 *DELIVERY ORDER");
  });
});

describe("sendTelegramToCustomer", () => {
  const TEST_PHONE = "+251900000999";
  const TEST_CHAT = "555000111";

  beforeAll(async () => {
    // Set up a customer row with a linked telegram chat id
    await pool.query(
      `INSERT INTO customers (id, phone, name, telegram_chat_id)
       VALUES (UUID(), ?, 'Test Customer', ?)
       ON DUPLICATE KEY UPDATE telegram_chat_id = VALUES(telegram_chat_id)`,
      [TEST_PHONE, TEST_CHAT]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM customers WHERE phone = ?`, [TEST_PHONE]);
  });

  it("does nothing when no telegram_chat_id is set", async () => {
    await sendTelegramToCustomer({ phone: "+251911111111", message: "hi" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends the message to the customer's linked chat", async () => {
    await sendTelegramToCustomer({ phone: TEST_PHONE, message: "Order shipped!" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // MySQL bigint columns are returned as numbers, not strings.
    // The body we send to Telegram can be either; we coerce for the assertion.
    expect(String(body.chat_id)).toBe(String(TEST_CHAT));
    expect(body.text).toBe("Order shipped!");
  });

  it("swallows errors without throwing", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));
    await expect(
      sendTelegramToCustomer({ phone: TEST_PHONE, message: "ignored" })
    ).resolves.toBeUndefined();
  });
});

describe("sendLowStockAlert", () => {
  it("skips when admin chat id is not set", async () => {
    const orig = process.env.TELEGRAM_ADMIN_CHAT_ID;
    process.env.TELEGRAM_ADMIN_CHAT_ID = "";
    await sendLowStockAlert({ name: "X", size: "100g", current: 1, threshold: 5 });
    process.env.TELEGRAM_ADMIN_CHAT_ID = orig;
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends a formatted low-stock alert when admin chat is set", async () => {
    process.env.TELEGRAM_ADMIN_CHAT_ID = "111";
    await sendLowStockAlert({ name: "Moringa", size: "250g", current: 2, threshold: 10 });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.chat_id).toBe("111");
    expect(body.text).toContain("⚠️ *Low Stock Alert*");
    expect(body.text).toContain("Moringa");
    // The message uses code-formatted values: "Current: `2` — Threshold: `10`"
    expect(body.text).toMatch(/Current:\s*`?2`?/);
    expect(body.text).toMatch(/Threshold:\s*`?10`?/);
  });
});

describe("sendStockRequestAlert", () => {
  it("sends a stock request with all fields", async () => {
    process.env.TELEGRAM_ADMIN_CHAT_ID = "111";
    await sendStockRequestAlert({
      item: "Honey", packageSize: "500g", current: 1, needed: 5,
      deliveryDate: "2026-06-10", requestedBy: "Yonas",
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text).toContain("📝 *Stock Request*");
    expect(body.text).toContain("Honey");
    // Format: "Remaining: *1* → Need: *5*"
    expect(body.text).toContain("Remaining: *1*");
    expect(body.text).toContain("Need: *5*");
  });
});

describe("storePendingVendorMessage", () => {
  const TEST_CHAT = "555000222";
  const TEST_NAME = "PW Test Vendor";
  const TEST_ORDER = `PO-PWT-${Date.now()}`;

  afterAll(async () => {
    await pool.query(
      `DELETE FROM pending_vendor_messages WHERE vendor_chat_id = ?`,
      [TEST_CHAT]
    );
  });

  it("inserts a row and updates on duplicate", async () => {
    await storePendingVendorMessage(TEST_CHAT, TEST_NAME, TEST_ORDER, "first");
    const [before] = await pool.query(
      `SELECT message FROM pending_vendor_messages
       WHERE vendor_chat_id = ? AND order_id = ?`,
      [TEST_CHAT, TEST_ORDER]
    ) as [any[], any];
    expect(before[0].message).toBe("first");

    await storePendingVendorMessage(TEST_CHAT, TEST_NAME, TEST_ORDER, "second");
    const [after] = await pool.query(
      `SELECT message FROM pending_vendor_messages
       WHERE vendor_chat_id = ? AND order_id = ?`,
      [TEST_CHAT, TEST_ORDER]
    ) as [any[], any];
    expect(after[0].message).toBe("second");
  });

  it("swallows DB errors without throwing", async () => {
    // Force a constraint violation by passing invalid type
    await expect(
      // Cast to any to bypass TS; intentionally pass undefined to trigger error
      storePendingVendorMessage(undefined as any, undefined as any, undefined as any, undefined as any)
    ).resolves.toBeUndefined();
  });
});

describe("sendVendorPO", () => {
  it("stores a pending message and notifies admin when Telegram returns !ok", async () => {
    process.env.TELEGRAM_ADMIN_CHAT_ID = "111";
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ ok: false, description: "chat not found" }),
    });

    const orderId = `PO-PWV-${Date.now()}`;
    await sendVendorPO(
      "555000333",
      "PW Vendor",
      orderId,
      [{ name: "Honey", amount: "50 units", price: "1500", deliveryDate: "2026-06-10" }],
      "staff-uuid"
    );

    // First fetch was the vendor send (ok:false). The second was the
    // admin "vendor not registered" notice.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const adminBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(adminBody.text).toContain("⚠️ *Vendor Not Registered*");

    // Cleanup
    await pool.query(
      `DELETE FROM pending_vendor_messages WHERE order_id = ?`, [orderId]
    );
  });

  it("sends the PO with 4 buttons on success", async () => {
    process.env.TELEGRAM_ADMIN_CHAT_ID = "111";
    const orderId = `PO-PWV-OK-${Date.now()}`;
    await sendVendorPO(
      "555000334",
      "PW Vendor OK",
      orderId,
      [{ name: "Moringa", amount: "100kg", price: "8000", deliveryDate: "2026-06-15" }],
      "staff-uuid"
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.chat_id).toBe("555000334");
    expect(body.reply_markup.inline_keyboard[0][0].callback_data).toBe(`po_accept_${orderId}`);
    expect(body.reply_markup.inline_keyboard[0][1].callback_data).toBe(`po_decline_${orderId}`);
  });
});

describe("sendMorningBriefing", () => {
  it("skips when admin chat id is not set", async () => {
    const orig = process.env.TELEGRAM_ADMIN_CHAT_ID;
    process.env.TELEGRAM_ADMIN_CHAT_ID = "";
    await sendMorningBriefing();
    process.env.TELEGRAM_ADMIN_CHAT_ID = orig;
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends a briefing with yesterday stats and pending count", async () => {
    process.env.TELEGRAM_ADMIN_CHAT_ID = "111";
    await sendMorningBriefing();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.chat_id).toBe("111");
    expect(body.text).toContain("☀️ *Morning Briefing");
    expect(body.text).toContain("Yesterday (");
    expect(body.text).toContain("Pending now:");
    expect(body.reply_markup.inline_keyboard[0][0].callback_data).toBe("pending_orders");
  });
});
