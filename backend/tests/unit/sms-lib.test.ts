/**
 * backend/tests/unit/sms-lib.test.ts
 * SMSEthiopia transport contract.
 *
 * globalThis.fetch is swapped BEFORE importing the module under test, the
 * same technique tests/unit/telegram-lib.test.ts uses for the Telegram API.
 * These tests must never reach the real provider — that would cost real
 * money and text real Ethiopian numbers.
 */

import { jest } from "@jest/globals";

const mockFetch = jest.fn() as unknown as jest.MockedFunction<(...args: any[]) => any>;
let originalFetch: typeof globalThis.fetch;
const originalApiKey = process.env.SMSETHIOPIA_API_KEY;

beforeAll(() => {
  originalFetch = globalThis.fetch;
  (globalThis as any).fetch = mockFetch;
  process.env.SMSETHIOPIA_API_KEY = "test-key-for-unit-tests";
});

afterAll(() => {
  (globalThis as any).fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.SMSETHIOPIA_API_KEY;
  else process.env.SMSETHIOPIA_API_KEY = originalApiKey;
});

beforeEach(() => mockFetch.mockReset());

// Imported after the fetch mock is installed.
const {
  sendSms,
  isSmsConfigured,
  MAX_SEGMENTS_PER_MESSAGE,
} = await import("../../src/lib/sms.js");

/** Build a fetch Response-like object with a readable body. */
const reply = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});

const ACCEPTED = { sent: true, id: 0, description: "Accepted for delivery" };

describe("isSmsConfigured", () => {
  it("is true when the API key is set", () => {
    expect(isSmsConfigured()).toBe(true);
  });

  it("is false when the API key is absent", () => {
    delete process.env.SMSETHIOPIA_API_KEY;
    expect(isSmsConfigured()).toBe(false);
    process.env.SMSETHIOPIA_API_KEY = "test-key-for-unit-tests";
  });
});

describe("sendSms — request shape", () => {
  it("POSTs to /api/sms/send with the KEY header and only msisdn+text", async () => {
    mockFetch.mockResolvedValue(reply(200, ACCEPTED));

    await sendSms("0911234567", "Order confirmed");

    const [url, init] = mockFetch.mock.calls[0] as [string, any];
    expect(url).toBe("https://smsethiopia.com/api/sms/send");
    expect(init.method).toBe("POST");

    // The provider publishes a machine-generated note warning that models
    // guess Bearer or username/password auth. It is a KEY header, full stop.
    expect(init.headers.KEY).toBe("test-key-for-unit-tests");
    expect(init.headers.Authorization).toBeUndefined();

    expect(JSON.parse(init.body)).toEqual({
      msisdn: "251911234567",
      text: "Order confirmed",
    });
  });

  it("normalizes the destination before sending", async () => {
    mockFetch.mockResolvedValue(reply(200, ACCEPTED));
    await sendSms("+251 911 234 567", "hello");
    const init = mockFetch.mock.calls[0][1] as any;
    expect(JSON.parse(init.body).msisdn).toBe("251911234567");
  });
});

describe("sendSms — accepted", () => {
  it("reports accepted on the documented 200 shape", async () => {
    mockFetch.mockResolvedValue(reply(200, ACCEPTED));
    const result = await sendSms("0911234567", "hello");

    expect(result.sent).toBe(true);
    expect(result.outcome).toBe("accepted");
    expect(result.httpStatus).toBe(200);
    // `id` is documented as reserved and always 0, so it must NOT become a
    // provider reference — there is nothing to correlate a receipt with.
    expect(result.providerRef).toBeUndefined();
  });

  it("treats a 200 with an empty body as accepted", async () => {
    mockFetch.mockResolvedValue(reply(200, ""));
    const result = await sendSms("0911234567", "hello");
    expect(result.outcome).toBe("accepted");
  });

  it("surfaces a providerRef if a future response carries a real id", async () => {
    mockFetch.mockResolvedValue(reply(200, { sent: true, id: 90210 }));
    const result = await sendSms("0911234567", "hello");
    expect(result.providerRef).toBe("90210");
  });

  it("reports rejected when a 200 body carries sent:false", async () => {
    mockFetch.mockResolvedValue(
      reply(200, { sent: false, description: "Account restricted" }),
    );
    const result = await sendSms("0911234567", "hello");
    expect(result.sent).toBe(false);
    expect(result.outcome).toBe("rejected");
    expect(result.error).toContain("Account restricted");
  });

  it("records the segment count and encoding for billing", async () => {
    mockFetch.mockResolvedValue(reply(200, ACCEPTED));
    const result = await sendSms("0911234567", "a".repeat(200));
    expect(result.segmentCount).toBe(2);
    expect(result.encoding).toBe("GSM-7");
  });
});

describe("sendSms — rejections must not be retried", () => {
  it("classifies 400 as rejected, not transient", async () => {
    mockFetch.mockResolvedValue(reply(400, { message: "Invalid msisdn" }));
    const result = await sendSms("0911234567", "hello");

    expect(result.outcome).toBe("rejected");
    expect(result.error).toContain("HTTP 400");
    expect(result.error).toContain("Invalid msisdn");
  });

  it("classifies 401 as rejected", async () => {
    mockFetch.mockResolvedValue(reply(401, { message: "Invalid key" }));
    expect((await sendSms("0911234567", "hello")).outcome).toBe("rejected");
  });

  it("classifies 402 as rejected — an exhausted balance will not refill", async () => {
    mockFetch.mockResolvedValue(reply(402, { message: "Insufficient balance" }));
    expect((await sendSms("0911234567", "hello")).outcome).toBe("rejected");
  });

  it("falls back to the raw body when no error field is present", async () => {
    mockFetch.mockResolvedValue(reply(400, "plain text rejection"));
    expect((await sendSms("0911234567", "hello")).error).toContain(
      "plain text rejection",
    );
  });

  it("handles an empty error body without throwing", async () => {
    mockFetch.mockResolvedValue(reply(400, ""));
    expect((await sendSms("0911234567", "hello")).error).toContain(
      "no response body",
    );
  });

  // An unnormalizable number will never work. Retrying it burns a rate-limit
  // slot every cycle and never succeeds.
  it("rejects an unnormalizable number without calling the provider", async () => {
    const result = await sendSms("not-a-number", "hello");
    expect(result.outcome).toBe("rejected");
    expect(result.error).toMatch(/Invalid Ethiopian mobile number/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("sendSms — transient failures must be retried", () => {
  it("classifies 500 as transient", async () => {
    mockFetch.mockResolvedValue(reply(500, { message: "Server error" }));
    expect((await sendSms("0911234567", "hello")).outcome).toBe("transient");
  });

  it("classifies 502 and 503 as transient", async () => {
    for (const status of [502, 503]) {
      mockFetch.mockResolvedValue(reply(status, {}));
      expect((await sendSms("0911234567", "hello")).outcome).toBe("transient");
    }
  });

  it("classifies 429 rate limiting as transient", async () => {
    mockFetch.mockResolvedValue(reply(429, { message: "Too many requests" }));
    expect((await sendSms("0911234567", "hello")).outcome).toBe("transient");
  });

  it("classifies 408 as transient", async () => {
    mockFetch.mockResolvedValue(reply(408, {}));
    expect((await sendSms("0911234567", "hello")).outcome).toBe("transient");
  });

  it("classifies a network failure as transient with status 0", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await sendSms("0911234567", "hello");

    expect(result.outcome).toBe("transient");
    expect(result.httpStatus).toBe(0);
    expect(result.error).toContain("Transport failure");
  });

  // A timeout is ambiguous: the carrier may still deliver. The caller must
  // not be able to mistake it for a clean rejection and drop the message.
  it("classifies an abort as transient", async () => {
    mockFetch.mockRejectedValue(
      Object.assign(new Error("The operation was aborted"), {
        name: "TimeoutError",
      }),
    );
    expect((await sendSms("0911234567", "hello")).outcome).toBe("transient");
  });
});

describe("sendSms — never throws", () => {
  it("skips when unconfigured", async () => {
    delete process.env.SMSETHIOPIA_API_KEY;
    const result = await sendSms("0911234567", "hello");

    expect(result.sent).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.error).toContain("not configured");
    expect(mockFetch).not.toHaveBeenCalled();
    process.env.SMSETHIOPIA_API_KEY = "test-key-for-unit-tests";
  });

  it("survives an unparseable success body", async () => {
    mockFetch.mockResolvedValue(reply(200, "<html>not json</html>"));
    const result = await sendSms("0911234567", "hello");
    expect(result.outcome).toBe("accepted");
  });

  it("survives a body that throws on read", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => {
        throw new Error("stream closed");
      },
    });
    expect((await sendSms("0911234567", "hello")).outcome).toBe("accepted");
  });
});

describe("sendSms — size guard", () => {
  it(`rejects a body over ${MAX_SEGMENTS_PER_MESSAGE} segments before calling the provider`, async () => {
    const result = await sendSms("0911234567", "a".repeat(1200));

    expect(result.outcome).toBe("rejected");
    expect(result.error).toContain("limit is 5");
    // Rejecting locally costs nothing and keeps a paste accident from
    // becoming a 10-segment bill.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("allows a body at exactly the limit", async () => {
    mockFetch.mockResolvedValue(reply(200, ACCEPTED));
    expect((await sendSms("0911234567", "a".repeat(5 * 153))).outcome).toBe(
      "accepted",
    );
  });
});