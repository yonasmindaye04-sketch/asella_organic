/**
 * backend/tests/unit/middleware.test.ts
 * Asella Organic — Middleware + Logger Unit Tests
 *
 * Covers three untested modules:
 *   • src/middleware/validate.ts  — XSS sanitize → Zod parse → 422 shape
 *   • src/middleware/requestId.ts — UUID generation, header passthrough
 *   • src/lib/logger.ts           — JSON output, Error handling, no-requestId fallback
 *
 * No DB, no network. Run with:
 *   npx jest tests/unit/middleware.test.ts
 */

import { jest } from "@jest/globals";
import { z }    from "zod";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Import modules under test ────────────────────────────────────────────

import { validate }   from "../../src/middleware/validate.js";
import { requestId }  from "../../src/middleware/requestId.js";
import { createLogger, logger } from "../../src/lib/logger.js";

// ─── Minimal Express mock helpers ─────────────────────────────────────────

type MockRes = {
  status:    jest.Mock;
  json:      jest.Mock;
  setHeader: jest.Mock;
};

function makeRes(): MockRes {
  const res: MockRes = {
    status:    jest.fn(),
    json:      jest.fn(),
    setHeader: jest.fn(),
  };
  // Chain: res.status(x) returns res so .json() works
  res.status.mockReturnValue(res);
  return res;
}

// ═══════════════════════════════════════════════════════════════════════════
// validate middleware
// ═══════════════════════════════════════════════════════════════════════════

describe("validate middleware", () => {
  const TestSchema = z.object({
    name:  z.string().min(2),
    email: z.string().email(),
    qty:   z.number().int().positive(),
  });

  it("calls next() and replaces req.body with parsed data on valid input", () => {
    const req  = { body: { name: "Yonas", email: "y@example.com", qty: 3 }, headers: {} };
    const res  = makeRes();
    const next = jest.fn();

    validate(TestSchema)(req as any, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toEqual({ name: "Yonas", email: "y@example.com", qty: 3 });
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 422 with field-level errors on invalid input", () => {
    const req  = { body: { name: "Y", email: "not-an-email", qty: -1 }, headers: {} };
    const res  = makeRes();
    const next = jest.fn();

    validate(TestSchema)(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error:   "Validation failed",
        details: expect.objectContaining({ name: expect.any(Array) }),
      })
    );
  });

  it("strips XSS from string fields before Zod validation", () => {
    const req  = { body: { name: "<b>Yonas</b>", email: "y@example.com", qty: 1 }, headers: {} };
    const res  = makeRes();
    const next = jest.fn();

    validate(TestSchema)(req as any, res as any, next);

    // "Yonas" (sanitized from "<b>Yonas</b>") passes the min(2) check
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.name).toBe("Yonas");
  });

  it("rejects XSS payload that becomes empty after sanitization", () => {
    // "<script>x</script>" sanitizes to "" which fails min(2)
    const req  = { body: { name: "<script>x</script>", email: "y@example.com", qty: 1 }, headers: {} };
    const res  = makeRes();
    const next = jest.fn();

    validate(TestSchema)(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it("handles non-object body gracefully (does not throw)", () => {
    // Edge case: body is a string or null (malformed content-type)
    const req  = { body: null, headers: {} };
    const res  = makeRes();
    const next = jest.fn();

    expect(() =>
      validate(TestSchema)(req as any, res as any, next)
    ).not.toThrow();

    // null body fails Zod → 422
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it("response shape always contains success:false on error", () => {
    const req  = { body: {}, headers: {} };
    const res  = makeRes();
    const next = jest.fn();

    validate(TestSchema)(req as any, res as any, next);

    const jsonMock = res.json as unknown as jest.MockedFunction<(...args: any[]) => any>;
    const calls = jsonMock.mock.calls;
    const jsonArg = calls[0]?.[0] as { success: boolean; details: unknown } | undefined;
    expect(jsonArg).toBeDefined();
    expect(jsonArg!.success).toBe(false);
    expect(typeof jsonArg!.details).toBe("object");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// requestId middleware
// ═══════════════════════════════════════════════════════════════════════════

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("requestId middleware", () => {
  it("assigns a UUID to req.requestId when no header is present", () => {
    const req  = { headers: {} } as any;
    const res  = makeRes();
    const next = jest.fn();

    requestId(req, res as any, next);

    expect(req.requestId).toMatch(UUID_RE);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("echoes req.requestId back in the x-request-id response header", () => {
    const req  = { headers: {} } as any;
    const res  = makeRes();
    const next = jest.fn();

    requestId(req, res as any, next);

    expect(res.setHeader).toHaveBeenCalledWith("x-request-id", req.requestId);
  });

  it("reuses the caller's x-request-id header when it is a non-empty string ≤ 128 chars", () => {
    const CALLER_ID = "my-trace-id-12345";
    const req  = { headers: { "x-request-id": CALLER_ID } } as any;
    const res  = makeRes();
    const next = jest.fn();

    requestId(req, res as any, next);

    expect(req.requestId).toBe(CALLER_ID);
    expect(res.setHeader).toHaveBeenCalledWith("x-request-id", CALLER_ID);
  });

  it("ignores the caller's header and generates a UUID when it is too long (> 128 chars)", () => {
    const LONG_ID = "x".repeat(129);
    const req  = { headers: { "x-request-id": LONG_ID } } as any;
    const res  = makeRes();
    const next = jest.fn();

    requestId(req, res as any, next);

    // Should NOT reuse the overly long header
    expect(req.requestId).not.toBe(LONG_ID);
    expect(req.requestId).toMatch(UUID_RE);
  });

  it("ignores an empty string x-request-id header", () => {
    const req  = { headers: { "x-request-id": "" } } as any;
    const res  = makeRes();
    const next = jest.fn();

    requestId(req, res as any, next);

    expect(req.requestId).toMatch(UUID_RE);
  });

  it("generates different IDs for concurrent requests (uniqueness check)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const req  = { headers: {} } as any;
      requestId(req, makeRes() as any, jest.fn());
      ids.add(req.requestId);
    }
    expect(ids.size).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// logger (createLogger + standalone logger)
// ═══════════════════════════════════════════════════════════════════════════

describe("createLogger", () => {
  let consoleSpy:      ReturnType<typeof jest.spyOn>;
  let consoleWarnSpy:  ReturnType<typeof jest.spyOn>;
  let consoleErrorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    consoleSpy      = jest.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy  = jest.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  function parseLastLog(spy: ReturnType<typeof jest.spyOn>): Record<string, unknown> {
    const calls = spy.mock.calls as unknown[][];
    const last = calls[calls.length - 1];
    const raw = last?.[0] as string;
    return JSON.parse(raw);
  }

  it("emits JSON with ts, level, requestId, and msg fields", () => {
    const req = { requestId: "req-abc-123" } as any;
    const log = createLogger(req);
    log.info("Test message");

    const entry = parseLastLog(consoleSpy);
    expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.level).toBe("INFO");
    expect(entry.requestId).toBe("req-abc-123");
    expect(entry.msg).toBe("Test message");
  });

  it("falls back to 'no-request-id' when req.requestId is undefined", () => {
    const req = {} as any;  // no requestId property
    const log = createLogger(req);
    log.info("Fallback test");

    const entry = parseLastLog(consoleSpy);
    expect(entry.requestId).toBe("no-request-id");
  });

  it("spreads meta object into the log entry", () => {
    const req = { requestId: "r1" } as any;
    const log = createLogger(req);
    log.info("With meta", { orderId: "ord-99", amount: 250 });

    const entry = parseLastLog(consoleSpy);
    expect(entry.orderId).toBe("ord-99");
    expect(entry.amount).toBe(250);
  });

  it("log.warn uses console.warn", () => {
    const req = { requestId: "r1" } as any;
    createLogger(req).warn("Warning message");
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    const entry = parseLastLog(consoleWarnSpy);
    expect(entry.level).toBe("WARN");
  });

  it("log.error uses console.error", () => {
    const req = { requestId: "r1" } as any;
    createLogger(req).error("Error occurred");
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const entry = parseLastLog(consoleErrorSpy);
    expect(entry.level).toBe("ERROR");
  });

  it("log.error with an Error instance spreads message and stack", () => {
    const req = { requestId: "r2" } as any;
    const err = new Error("Something broke");
    createLogger(req).error("DB failed", err);

    const entry = parseLastLog(consoleErrorSpy);
    expect(entry.error).toBe("Something broke");
    expect(typeof entry.stack).toBe("string");
  });

  it("log.error with a plain object spreads the object", () => {
    const req = { requestId: "r3" } as any;
    createLogger(req).error("Custom error", { code: "ECONNREFUSED", host: "db" });

    const entry = parseLastLog(consoleErrorSpy);
    expect(entry.code).toBe("ECONNREFUSED");
    expect(entry.host).toBe("db");
  });

  it("log.error with no second argument still emits valid JSON", () => {
    const req = { requestId: "r4" } as any;
    expect(() => createLogger(req).error("Just a message")).not.toThrow();
    const entry = parseLastLog(consoleErrorSpy);
    expect(entry.msg).toBe("Just a message");
  });

  it("log.debug uses console.log with level DEBUG", () => {
    const req = { requestId: "r5" } as any;
    createLogger(req).debug("Debug info");
    const entry = parseLastLog(consoleSpy);
    expect(entry.level).toBe("DEBUG");
  });
});

describe("standalone logger (system context)", () => {
  let consoleErrorSpy: ReturnType<typeof jest.spyOn>;
  let consoleSpy:      ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    consoleSpy      = jest.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("uses 'system' as the requestId", () => {
    logger.info("Server starting");
    const calls = consoleSpy.mock.calls as unknown[][];
    const raw   = calls[0]?.[0] as string;
    const entry = JSON.parse(raw);
    expect(entry.requestId).toBe("system");
  });

  it("logger.error with an Error instance includes stack", () => {
    const err = new Error("startup failure");
    logger.error("Boot error", err);
    const calls = consoleErrorSpy.mock.calls as unknown[][];
    const raw   = calls[0]?.[0] as string;
    const entry = JSON.parse(raw);
    expect(entry.error).toBe("startup failure");
    expect(typeof entry.stack).toBe("string");
  });
});