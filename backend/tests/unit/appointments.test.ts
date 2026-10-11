/**
 * backend/tests/unit/appointments.test.ts
 * Asella Organic — Appointments Route Tests
 */

import request from "supertest";
import { jest } from "@jest/globals";
import app from "../../src/app.js";
import nodemailer from "nodemailer";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

// ── Mock global fetch so the Telegram fallback doesn't hit the network ───────
const mockFetch = jest.fn() as unknown as jest.MockedFunction<(...args: any[]) => any>;
const originalFetch = globalThis.fetch;

beforeAll(() => {
  (globalThis as any).fetch = mockFetch;
});

afterAll(() => {
  (globalThis as any).fetch = originalFetch;
});

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({ ok: true, result: { message_id: 1 } }),
  });
});

const VALID_PAYLOAD = {
  full_name:       "Yonas T.",
  phone_number:    "+251911223344",
  preferred_date:  "2026-07-01",
  email:           "yonas@example.com",
};

// ── Transport mock, installed for the WHOLE file ──────────────────────────────
//
// This used to be scoped to the "SMTP path" describe only, which was too late.
// lib/mailer.ts caches its transporter in a module-level `cached` variable, and
// the first test in this file that reaches the mail path built and cached a
// REAL one. Every later spy was then installed on nodemailer while the cached
// value kept pointing at the genuine transport, so sendMailMock recorded zero
// calls.
//
// Two details matter here, and the second was the one that bit:
//   1. The spy has to exist before any test reaches the mail path.
//   2. There must be ONE mock object for the whole file, not a fresh one per
//      test. `cached` is set once and never cleared, so a new mock installed
//      later is simply never adopted — the route keeps using the first one. A
//      per-test mockClear() gives each test a clean call log without breaking
//      the identity the cache holds onto.
//
// Installing it file-wide also means no test here opens a real SMTP connection.
const sendMailMock = jest.fn() as unknown as jest.MockedFunction<(...args: any[]) => any>;

beforeEach(() => {
  sendMailMock.mockReset();
  sendMailMock.mockResolvedValue({ messageId: "ok" });
  jest.spyOn(nodemailer, "createTransport").mockReturnValue({
    sendMail: sendMailMock,
  } as any);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("POST /api/appointments — validation", () => {
  it("returns 422 when full_name is missing", async () => {
    const { full_name, ...rest } = VALID_PAYLOAD;
    const res = await request(app).post("/api/appointments").send(rest);
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it("returns 422 when phone_number is missing", async () => {
    const { phone_number, ...rest } = VALID_PAYLOAD;
    const res = await request(app).post("/api/appointments").send(rest);
    expect(res.status).toBe(422);
  });

  it("returns 422 when preferred_date is missing", async () => {
    const { preferred_date, ...rest } = VALID_PAYLOAD;
    const res = await request(app).post("/api/appointments").send(rest);
    expect(res.status).toBe(422);
  });

  it("accepts a payload without email (email is optional)", async () => {
    const { email, ...rest } = VALID_PAYLOAD;
    const res = await request(app).post("/api/appointments").send(rest);
    expect(res.status).not.toBe(422);
  });
});

describe("POST /api/appointments — Telegram fallback (no SMTP)", () => {
  let originalSmtpUser: string | undefined;
  let originalSmtpPass: string | undefined;
  let originalAdminChat: string | undefined;
  let originalBotToken: string | undefined;

  beforeAll(() => {
    originalSmtpUser  = process.env.SMTP_USER;
    originalSmtpPass  = process.env.SMTP_PASS;
    originalAdminChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
    originalBotToken  = process.env.TELEGRAM_BOT_TOKEN;

    process.env.SMTP_USER               = "";
    process.env.SMTP_PASS               = "";
    process.env.TELEGRAM_ADMIN_CHAT_ID  = "111";
    process.env.TELEGRAM_BOT_TOKEN      = "test-bot-token-for-ci";
  });

  afterAll(() => {
    process.env.SMTP_USER               = originalSmtpUser;
    process.env.SMTP_PASS               = originalSmtpPass;
    process.env.TELEGRAM_ADMIN_CHAT_ID  = originalAdminChat;
    process.env.TELEGRAM_BOT_TOKEN      = originalBotToken;
  });

  it("falls back to Telegram and returns 200 when SMTP is missing", async () => {
    const res = await request(app).post("/api/appointments").send(VALID_PAYLOAD);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toMatch(/Telegram/);
  });

  it("sends the formatted message to the admin chat", async () => {
    await request(app).post("/api/appointments").send(VALID_PAYLOAD);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.chat_id).toBe("111");
    expect(body.text).toContain("New Appointment Request");
    expect(body.text).toContain("Yonas T.");
    expect(body.text).toContain("+251911223344");
    expect(body.text).toContain("2026-07-01");
  });

  it("uses 'N/A' for missing email in the Telegram message", async () => {
    const { email, ...rest } = VALID_PAYLOAD;
    await request(app).post("/api/appointments").send(rest);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text).toContain("*Email:* N/A");
  });
});

describe("POST /api/appointments — SMTP path", () => {
  let originalSmtpUser: string | undefined;
  let originalSmtpPass: string | undefined;

  beforeAll(() => {
    originalSmtpUser = process.env.SMTP_USER;
    originalSmtpPass = process.env.SMTP_PASS;
    process.env.SMTP_USER = "asellamoringa@gmail.com";
    process.env.SMTP_PASS = "app-password";
  });

  afterAll(() => {
    process.env.SMTP_USER = originalSmtpUser;
    process.env.SMTP_PASS = originalSmtpPass;
  });

  // sendMailMock and the nodemailer spy come from the file-level hooks above;
  // installing them again here would race the cached transporter in
  // lib/mailer.ts all over again.

  it("sends the business notification via SMTP", async () => {
    const res = await request(app).post("/api/appointments").send(VALID_PAYLOAD);
    expect(res.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(2);

    const businessCall = sendMailMock.mock.calls[0][0];
    expect(businessCall.to).toBe("asellamoringa@gmail.com");
    expect(businessCall.subject).toBe("New Appointment Request");
    expect(businessCall.html).toContain("Yonas T.");

    const customerCall = sendMailMock.mock.calls[1][0];
    expect(customerCall.to).toBe(VALID_PAYLOAD.email);
    expect(customerCall.subject).toContain("Appointment Request Received");
  });

  it("skips the customer email when not provided", async () => {
    const { email, ...rest } = VALID_PAYLOAD;
    const res = await request(app).post("/api/appointments").send(rest);
    expect(res.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0][0].to).toBe("asellamoringa@gmail.com");
  });

  it("falls back to Telegram and still reports success when the business email fails", async () => {
    // sendMail never throws — lib/mailer.ts documents that it "resolves to
    // { sent: false, error }" — so a 500 here was never reachable. The route
    // used to discard that result, log "emails sent", and answer 200 while
    // nothing was delivered. Because there is no appointments table, that was
    // silent data loss.
    sendMailMock.mockRejectedValueOnce(new Error("SMTP server down"));

    const res = await request(app).post("/api/appointments").send(VALID_PAYLOAD);

    // The request is NOT lost: it is retried on the Telegram channel.
    expect(res.status).toBe(200);
    expect(res.body.data.delivered_via).toBe("telegram");
    expect(mockFetch).toHaveBeenCalled();
  });

  it("reports the failure honestly when both channels are unavailable", async () => {
    const originalChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
    process.env.TELEGRAM_ADMIN_CHAT_ID = "";
    try {
      sendMailMock.mockRejectedValueOnce(new Error("SMTP server down"));

      const res = await request(app).post("/api/appointments").send(VALID_PAYLOAD);

      // Still 200 — the customer did nothing wrong and re-submitting would
      // only duplicate — but the payload says plainly that nothing was
      // delivered, instead of claiming an email went out.
      expect(res.status).toBe(200);
      expect(res.body.data.delivered_via).toBe("email_failed");
    } finally {
      process.env.TELEGRAM_ADMIN_CHAT_ID = originalChat;
    }
  });
});