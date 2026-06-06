/**
 * backend/tests/unit/security.test.ts
 * Asella Organic — Security Library Unit Tests
 *
 * Tests every exported function from src/lib/security.ts:
 *   sanitizeInput, sanitizeObject, verifyTelegramWebhook,
 *   generateResetToken, verifyResetToken, randomId
 *
 * No DB, no network — pure unit tests. Run with:
 *   npx jest tests/unit/security.test.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import crypto from "crypto";
import {
  sanitizeInput,
  sanitizeObject,
  verifyTelegramWebhook,
  generateResetToken,
  verifyResetToken,
  randomId,
} from "../../src/lib/security.js";

// ── Env setup ─────────────────────────────────────────────────────────────

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.JWT_SECRET              = "test-jwt-secret-at-least-32-chars-long!";
  process.env.TELEGRAM_WEBHOOK_SECRET = "my-telegram-secret";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// ═══════════════════════════════════════════════════════════════════════════
// sanitizeInput
// ═══════════════════════════════════════════════════════════════════════════

describe("sanitizeInput", () => {
  it("strips script tags from input", () => {
    const input = '<script>alert("xss")</script>Hello';
    expect(sanitizeInput(input)).toBe("Hello");
  });

  it("strips HTML tags, leaving only text content", () => {
    expect(sanitizeInput("<b>bold</b> text")).toBe("bold text");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeInput("  hello world  ")).toBe("hello world");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeInput("")).toBe("");
  });

  it("returns empty string when a non-string is passed (type guard)", () => {
    // The signature says string but guard covers runtime misuse
    expect(sanitizeInput(123 as any)).toBe("");
    expect(sanitizeInput(null as any)).toBe("");
    expect(sanitizeInput(undefined as any)).toBe("");
  });

  it("leaves plain text unchanged", () => {
    expect(sanitizeInput("Asella Organic Order #123")).toBe("Asella Organic Order #123");
  });

  it("strips event handler attributes", () => {
    const input = '<img src="x" onerror="alert(1)" />';
    expect(sanitizeInput(input)).toBe("");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// sanitizeObject
// ═══════════════════════════════════════════════════════════════════════════

describe("sanitizeObject", () => {
  it("sanitizes top-level string values", () => {
    const obj = { name: "<b>Yonas</b>", city: "Addis" };
    const result = sanitizeObject(obj);
    expect(result.name).toBe("Yonas");
    expect(result.city).toBe("Addis");
  });

  it("passes through non-string primitives unchanged", () => {
    const obj = { qty: 5, active: true, price: 99.9 };
    const result = sanitizeObject(obj);
    expect(result.qty).toBe(5);
    expect(result.active).toBe(true);
    expect(result.price).toBe(99.9);
  });

  it("recursively sanitizes nested objects", () => {
    const obj = { address: { street: "<script>bad</script>Bole", city: "Addis" } };
    const result = sanitizeObject(obj);
    expect((result.address as any).street).toBe("Bole");
    expect((result.address as any).city).toBe("Addis");
  });

  it("sanitizes string elements inside arrays", () => {
    const obj = { tags: ["<b>organic</b>", "herbs", "<em>fresh</em>"] };
    const result = sanitizeObject(obj);
    expect(result.tags).toEqual(["organic", "herbs", "fresh"]);
  });

  it("recursively sanitizes objects inside arrays", () => {
    const obj = {
      items: [
        { name: "<script>evil</script>Moringa", qty: 2 },
        { name: "Turmeric", qty: 1 },
      ],
    };
    const result = sanitizeObject(obj);
    expect((result.items as any[])[0].name).toBe("Moringa");
    expect((result.items as any[])[1].name).toBe("Turmeric");
  });

  it("passes through non-string, non-object array elements unchanged", () => {
    const obj = { ids: [1, 2, 3] };
    const result = sanitizeObject(obj);
    expect(result.ids).toEqual([1, 2, 3]);
  });

  it("does not mutate the original object", () => {
    const original = { name: "<b>test</b>" };
    const copy = { ...original };
    sanitizeObject(original);
    expect(original.name).toBe(copy.name);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// verifyTelegramWebhook
// ═══════════════════════════════════════════════════════════════════════════

describe("verifyTelegramWebhook", () => {
  it("returns true when header matches the env secret", () => {
    expect(verifyTelegramWebhook("my-telegram-secret")).toBe(true);
  });

  it("returns false when header does not match", () => {
    expect(verifyTelegramWebhook("wrong-secret")).toBe(false);
  });

  it("returns false when header is undefined", () => {
    expect(verifyTelegramWebhook(undefined)).toBe(false);
  });

  it("returns false when header is empty string", () => {
    expect(verifyTelegramWebhook("")).toBe(false);
  });

  it("returns false when TELEGRAM_WEBHOOK_SECRET env var is missing", () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect(verifyTelegramWebhook("my-telegram-secret")).toBe(false);
  });

  it("returns false when lengths differ (length mismatch short-circuit)", () => {
    // Provides extra coverage of the length guard before timingSafeEqual
    expect(verifyTelegramWebhook("short")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// generateResetToken / verifyResetToken
// ═══════════════════════════════════════════════════════════════════════════

describe("generateResetToken + verifyResetToken", () => {
  it("round-trips: verifyResetToken returns the same userId that was encoded", () => {
    const userId = "user-uuid-1234";
    const token  = generateResetToken(userId);
    expect(verifyResetToken(token)).toBe(userId);
  });

  it("generates tokens with two dot-separated segments (base64url.signature)", () => {
    const token = generateResetToken("abc");
    const parts = token.split(".");
    expect(parts).toHaveLength(2);
    const [b64Part, sigPart] = parts;
    expect(b64Part).toBeDefined();
    expect(sigPart).toBeDefined();
    expect(b64Part!.length).toBeGreaterThan(0);
    expect(sigPart!.length).toBeGreaterThan(0);
  });

  it("throws 'Malformed token' when token has no dot separator", () => {
    expect(() => verifyResetToken("nodothere")).toThrow("Malformed token");
  });

  it("throws 'Malformed token' when signature segment is missing", () => {
    expect(() => verifyResetToken("onlyone.")).toThrow();
  });

  it("throws 'Invalid signature' when signature is tampered", () => {
    const token  = generateResetToken("user-123");
    const parts  = token.split(".");
    const b64    = parts[0];
    const realSig = parts[1] ?? "";
    // Flip a single character in the real signature so the bytes are
    // the same length but the HMAC is wrong. The implementation uses
    // crypto.timingSafeEqual() which requires equal-length buffers —
    // a shorter or longer badSig would throw "Input buffers must have
    // the same byte length" instead of "Invalid signature".
    const flipped = (realSig[0] === "A" ? "B" : "A") + realSig.slice(1);
    expect(() => verifyResetToken(`${b64}.${flipped}`)).toThrow("Invalid signature");
  });

  it("throws 'Token expired' for a token whose exp is in the past", () => {
    // Manually craft an expired payload with the correct signature
    const secret  = process.env.JWT_SECRET!;
    const payload = { userId: "u1", exp: Date.now() - 1_000, nonce: "abc" };
    const b64     = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig     = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
    expect(() => verifyResetToken(`${b64}.${sig}`)).toThrow("Token expired");
  });

  it("throws when JWT_SECRET env var is missing at generation time", () => {
    delete process.env.JWT_SECRET;
    expect(() => generateResetToken("user-xyz")).toThrow("JWT_SECRET");
  });

  it("throws when JWT_SECRET env var is missing at verification time", () => {
    const token = generateResetToken("user-xyz");
    delete process.env.JWT_SECRET;
    expect(() => verifyResetToken(token)).toThrow("JWT_SECRET");
  });

  it("generates a different token each call (nonce randomness)", () => {
    const t1 = generateResetToken("same-user");
    const t2 = generateResetToken("same-user");
    expect(t1).not.toBe(t2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// randomId
// ═══════════════════════════════════════════════════════════════════════════

describe("randomId", () => {
  it("returns a non-empty uppercase string", () => {
    const id = randomId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
    expect(id).toBe(id.toUpperCase());
  });

  it("is URL-safe (no +, /, or = characters from standard base64)", () => {
    for (let i = 0; i < 50; i++) {
      const id = randomId();
      expect(id).not.toMatch(/[+/=]/);
    }
  });

  it("generates unique IDs across calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => randomId()));
    expect(ids.size).toBe(100);
  });

  it("accepts a custom byte-length argument", () => {
    // 4 bytes → base64url → ~6 chars; 16 bytes → ~22 chars
    const short = randomId(4);
    const long  = randomId(16);
    expect(short.length).toBeLessThan(long.length);
  });
});