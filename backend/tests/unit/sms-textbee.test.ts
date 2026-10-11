/**
 * backend/tests/unit/sms-textbee.test.ts
 * TextBee transport contract and provider selection.
 *
 * Same technique as sms-lib.test.ts: globalThis.fetch is swapped BEFORE the
 * module under test ever makes a call. These tests must never reach the real
 * provider — that would text real Ethiopian numbers out of a real handset
 * and cost real airtime.
 *
 * The facade reads process.env on every send rather than capturing it at
 * import, so setting the environment in beforeEach is enough to switch
 * transports without a module reset.
 */

import { jest } from "@jest/globals";

const mockFetch = jest.fn() as unknown as jest.MockedFunction<
  (...args: any[]) => any
>;
let originalFetch: typeof globalThis.fetch;

/** Every variable these tests touch, snapshotted so none leaks to the suite. */
const ENV_KEYS = [
  "SMS_PROVIDER",
  "SMSETHIOPIA_API_KEY",
  "TEXTBEE_API_KEY",
  "TEXTBEE_DEVICE_ID",
  "TEXTBEE_BASE_URL",
] as const;

const originalEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) originalEnv[key] = process.env[key];

beforeAll(() => {
  originalFetch = globalThis.fetch;
  (globalThis as any).fetch = mockFetch;
});

afterAll(() => {
  (globalThis as any).fetch = originalFetch;
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

beforeEach(() => {
  mockFetch.mockReset();
  process.env.SMS_PROVIDER = "textbee";
  process.env.TEXTBEE_API_KEY = "test-textbee-key";
  process.env.TEXTBEE_DEVICE_ID = "device-123";
  delete process.env.TEXTBEE_BASE_URL;
});

const {
  sendSms,
  isSmsConfigured,
  activeSmsProviderId,
  MAX_SEGMENTS_PER_MESSAGE,
} = await import("../../src/lib/sms.js");

/** Build a fetch Response-like object with a readable body. */
const reply = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});

const ACCEPTED = { success: true, data: [] };

describe("provider selection", () => {
  it("routes to textbee when SMS_PROVIDER says so", () => {
    expect(activeSmsProviderId()).toBe("textbee");
  });

  // An existing deployment sets no new variables and must keep behaving
  // exactly as it did before the split.
  it("defaults to smsethiopia when SMS_PROVIDER is unset", () => {
    delete process.env.SMS_PROVIDER;
    expect(activeSmsProviderId()).toBe("smsethiopia");
  });

  it("falls back to smsethiopia on an unrecognised value rather than throwing", () => {
    // This is read on every send. A typo in a staging .env must not take the
    // dispatcher down from inside a queue tick.
    process.env.SMS_PROVIDER = "textbee-dev";
    expect(activeSmsProviderId()).toBe("smsethiopia");
  });

  it("is case and whitespace insensitive", () => {
    process.env.SMS_PROVIDER = "  TextBee ";
    expect(activeSmsProviderId()).toBe("textbee");
  });
});

describe("isSmsConfigured", () => {
  it("is true when both the key and the device id are present", () => {
    expect(isSmsConfigured()).toBe(true);
  });

  // A key without a device has nothing to send from, and reporting
  // "configured" would start a dispatcher whose every send fails.
  it("is false when the device id is missing", () => {
    delete process.env.TEXTBEE_DEVICE_ID;
    expect(isSmsConfigured()).toBe(false);
  });

  it("is false when the API key is missing", () => {
    delete process.env.TEXTBEE_API_KEY;
    expect(isSmsConfigured()).toBe(false);
  });
});

describe("sendSms — request shape", () => {
  it("POSTs to the device send-sms endpoint with the x-api-key header", async () => {
    mockFetch.mockResolvedValue(reply(200, ACCEPTED));

    await sendSms("0911234567", "Order confirmed");

    const [url, init] = mockFetch.mock.calls[0] as [string, any];
    expect(url).toBe(
      "https://api.textbee.dev/api/v1/gateway/devices/device-123/send-sms",
    );
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("test-textbee-key");
    // No documented Bearer or query-string auth variant.
    expect(init.headers.Authorization).toBeUndefined();
  });

  // The one place the two providers genuinely differ. The facade normalizes
  // to 251XXXXXXXXX; TextBee requires the plus back.
  it("adds the leading plus TextBee requires", async () => {
    mockFetch.mockResolvedValue(reply(200, ACCEPTED));
    await sendSms("0911234567", "hello");

    const init = mockFetch.mock.calls[0][1] as any;
    expect(JSON.parse(init.body).recipients).toEqual(["+251911234567"]);
  });

  it("normalizes a local number and a spaced international one identically", async () => {
    for (const input of ["+251 911 234 567", "251911234567", "0911234567"]) {
      mockFetch.mockReset();
      mockFetch.mockResolvedValue(reply(200, ACCEPTED));
      await sendSms(input, "hello");
      const init = mockFetch.mock.calls[0][1] as any;
      expect(JSON.parse(init.body).recipients).toEqual(["+251911234567"]);
    }
  });

  // TextBee will fan one message out to many numbers in a single call. We
  // refuse to, because the queue accounts for cost per recipient, enforces
  // per-recipient opt-out, and writes one sms_messages row per person. A
  // fan-out would collapse all of that into one opaque result.
  it("sends to exactly one recipient per call", async () => {
    mockFetch.mockResolvedValue(reply(200, ACCEPTED));
    await sendSms("0911234567", "hello");

    const init = mockFetch.mock.calls[0][1] as any;
    const body = JSON.parse(init.body);
    expect(body.recipients).toHaveLength(1);
    expect(body.message).toBe("hello");
  });

  it("honours TEXTBEE_BASE_URL for a self-hosted deployment", async () => {
    process.env.TEXTBEE_BASE_URL = "https://sms.example.com/";
    mockFetch.mockResolvedValue(reply(200, ACCEPTED));

    await sendSms("0911234567", "hello");

    // Trailing slash must not produce a double slash in the path.
    const [url] = mockFetch.mock.calls[0] as [string, any];
    expect(url).toBe(
      "https://sms.example.com/api/v1/gateway/devices/device-123/send-sms",
    );
  });

  it("url-encodes a device id containing unusual characters", async () => {
    process.env.TEXTBEE_DEVICE_ID = "device/123";
    mockFetch.mockResolvedValue(reply(200, ACCEPTED));

    await sendSms("0911234567", "hello");

    const [url] = mockFetch.mock.calls[0] as [string, any];
    expect(url).toContain("device%2F123");
  });
});

describe("sendSms — accepted", () => {
  it("reports accepted on { success: true }", async () => {
    mockFetch.mockResolvedValue(reply(200, ACCEPTED));
    const result = await sendSms("0911234567", "hello");

    expect(result.sent).toBe(true);
    expect(result.outcome).toBe("accepted");
    expect(result.httpStatus).toBe(200);
  });

  // A proxy serving an HTML page with a 200 is far likelier than a
  // successful send that carries no body at all.
  it("treats a 200 with an empty body as accepted", async () => {
    mockFetch.mockResolvedValue(reply(200, ""));
    expect((await sendSms("0911234567", "hello")).outcome).toBe("accepted");
  });

  it("treats an unparseable 200 body as accepted", async () => {
    mockFetch.mockResolvedValue(reply(200, "<html>not json</html>"));
    expect((await sendSms("0911234567", "hello")).outcome).toBe("accepted");
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

  // TextBee issues no per-message id, so provider_ref stays NULL — exactly
  // as it already does for SMSEthiopia. Nothing may invent one.
  it("does not fabricate a provider reference", async () => {
    mockFetch.mockResolvedValue(reply(200, ACCEPTED));
    const result = await sendSms("0911234567", "hello");
    expect(result.providerRef).toBeUndefined();
  });

  it("records the segment count and encoding for billing", async () => {
    mockFetch.mockResolvedValue(reply(200, ACCEPTED));
    const result = await sendSms("0911234567", "a".repeat(200));

    expect(result.segmentCount).toBe(2);
    expect(result.encoding).toBe("GSM-7");
  });
});

describe("sendSms — rejections must not be retried", () => {
  it("reports rejected when a 200 body carries success:false", async () => {
    mockFetch.mockResolvedValue(
      reply(200, { success: false, message: "Device is offline" }),
    );
    const result = await sendSms("0911234567", "hello");

    expect(result.sent).toBe(false);
    expect(result.outcome).toBe("rejected");
    expect(result.error).toContain("Device is offline");
  });

  // A wrong key and an unregistered device are both permanent until someone
  // edits the environment. Retrying them every cycle only fills the log.
  it("classifies 401 as rejected", async () => {
    mockFetch.mockResolvedValue(reply(401, { message: "Invalid api key" }));
    expect((await sendSms("0911234567", "hello")).outcome).toBe("rejected");
  });

  it("classifies 403 as rejected", async () => {
    mockFetch.mockResolvedValue(reply(403, { message: "Forbidden" }));
    expect((await sendSms("0911234567", "hello")).outcome).toBe("rejected");
  });

  it("classifies 404 — device never registered — as rejected", async () => {
    mockFetch.mockResolvedValue(reply(404, { message: "Device not found" }));
    const result = await sendSms("0911234567", "hello");

    expect(result.outcome).toBe("rejected");
    expect(result.error).toContain("404");
    expect(result.error).toContain("Device not found");
  });

  it("classifies 400 as rejected", async () => {
    mockFetch.mockResolvedValue(reply(400, { message: "Bad recipient" }));
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

  it("skips without calling the provider when textbee is unconfigured", async () => {
    delete process.env.TEXTBEE_DEVICE_ID;
    const result = await sendSms("0911234567", "hello");

    expect(result.sent).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.error).toContain("not configured");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("sendSms — transient failures must be retried", () => {
  it("classifies 429 rate limiting as transient", async () => {
    mockFetch.mockResolvedValue(reply(429, { message: "Too many requests" }));
    expect((await sendSms("0911234567", "hello")).outcome).toBe("transient");
  });

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

  it("classifies a network failure as transient with status 0", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await sendSms("0911234567", "hello");

    expect(result.outcome).toBe("transient");
    expect(result.httpStatus).toBe(0);
    expect(result.error).toContain("Transport failure");
  });

  // Genuinely ambiguous: the handset may well have sent it. It must stay
  // retryable so the queue cannot mistake a slow phone for a rejection and
  // silently drop a customer's order confirmation.
  it("classifies a timeout as transient", async () => {
    mockFetch.mockRejectedValue(
      Object.assign(new Error("The operation was aborted"), {
        name: "TimeoutError",
      }),
    );
    expect((await sendSms("0911234567", "hello")).outcome).toBe("transient");
  });
});

describe("sendSms — provider-independent guards", () => {
  // These live in the facade and must behave identically on both providers.
  it("rejects an unnormalizable number without calling the provider", async () => {
    const result = await sendSms("not-a-number", "hello");

    expect(result.outcome).toBe("rejected");
    expect(result.error).toMatch(/Invalid Ethiopian mobile number/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // A handset has no per-message price, but the customer's data allowance is
  // not free and a 10-segment paste is unreadable either way.
  it(`rejects a body over ${MAX_SEGMENTS_PER_MESSAGE} segments before calling the provider`, async () => {
    const result = await sendSms("0911234567", "a".repeat(1200));

    expect(result.outcome).toBe("rejected");
    expect(result.error).toContain("limit is 5");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("allows a body at exactly the limit", async () => {
    mockFetch.mockResolvedValue(reply(200, ACCEPTED));
    expect(
      (await sendSms("0911234567", "a".repeat(5 * 153))).outcome,
    ).toBe("accepted");
  });

  // Amharic forces UCS-2, so the same content bills as roughly double.
  it("bills Ethiopic copy as UNICODE", async () => {
    mockFetch.mockResolvedValue(reply(200, ACCEPTED));
    const result = await sendSms("0911234567", "እንደምን አደርክህ");

    expect(result.encoding).toBe("UNICODE");
    expect(result.segmentCount).toBe(1);
  });
});