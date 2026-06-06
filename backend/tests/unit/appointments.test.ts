/**
 * backend/tests/unit/appointments.test.ts
 * Asella Organic — Appointments Route Tests
 *
 * Tests src/routes/appointments.ts: POST /api/appointments
 *   - Validates the request body via Zod
 *   - Falls back to Telegram when SMTP_USER / SMTP_PASS are not set
 *   - Sends emails via nodemailer when SMTP creds are available
 *   - Returns 500 if the email send fails
 *
 * The Telegram fallback path uses the real globalThis.fetch (mocked
 * here). The SMTP path mocks nodemailer.createTransport.
 *
 * Run with:
 *   npx jest tests/unit/appointments.test.ts
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
    // Should not 422
    expect(res.status).not.toBe(422);
  });
});

describe("POST /api/appointments — Telegram fallback (no SMTP)", () => {
  let originalSmtpUser: string | undefined;
  let originalSmtpPass: string | undefined;
  let originalAdminChat: string | undefined;

  beforeAll(() => {
    originalSmtpUser   = process.env.SMTP_USER;
    originalSmtpPass   = process.env.SMTP_PASS;
    originalAdminChat  = process.env.TELEGRAM_ADMIN_CHAT_ID;
    process.env.SMTP_USER  = "";
    process.env.SMTP_PASS  = "";
    process.env.TELEGRAM_ADMIN_CHAT_ID = "111";
  });

  afterAll(() => {
    process.env.SMTP_USER  = originalSmtpUser;
    process.env.SMTP_PASS  = originalSmtpPass;
    process.env.TELEGRAM_ADMIN_CHAT_ID = originalAdminChat;
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
    // Route format: ` *Email:* ${data.email || "N/A"}` (markdown bold)
    expect(body.text).toContain("*Email:* N/A");
  });
});

describe("POST /api/appointments — SMTP path", () => {
  let originalSmtpUser: string | undefined;
  let originalSmtpPass: string | undefined;
  let sendMailMock: jest.MockedFunction<(...args: any[]) => any>;

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

  beforeEach(() => {
    sendMailMock = jest.fn() as unknown as jest.MockedFunction<(...args: any[]) => any>;
    sendMailMock.mockResolvedValue({ messageId: "ok" });
    jest.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail: sendMailMock,
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sends the business notification via SMTP", async () => {
    const res = await request(app).post("/api/appointments").send(VALID_PAYLOAD);
    expect(res.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(2); // business + customer

    // First email goes to the business
    const businessCall = sendMailMock.mock.calls[0][0];
    expect(businessCall.to).toBe("asellamoringa@gmail.com");
    expect(businessCall.subject).toBe("New Appointment Request");
    expect(businessCall.html).toContain("Yonas T.");

    // Second goes to the customer (because email was provided)
    const customerCall = sendMailMock.mock.calls[1][0];
    expect(customerCall.to).toBe(VALID_PAYLOAD.email);
    expect(customerCall.subject).toContain("Appointment Request Received");
  });

  it("skips the customer email when not provided", async () => {
    const { email, ...rest } = VALID_PAYLOAD;
    const res = await request(app).post("/api/appointments").send(rest);
    expect(res.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(1); // business only
    expect(sendMailMock.mock.calls[0][0].to).toBe("asellamoringa@gmail.com");
  });

  it("returns 500 when sendMail throws", async () => {
    sendMailMock.mockRejectedValueOnce(new Error("SMTP server down"));
    const res = await request(app).post("/api/appointments").send(VALID_PAYLOAD);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/try again later/);
  });
});
