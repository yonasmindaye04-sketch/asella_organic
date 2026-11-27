/**
 * backend/tests/unit/jwt-secret.test.ts
 *
 * ASE-2026-003 — unit tests for src/config/jwtSecret.ts.
 *
 * This module is the single source of truth for the HS256 signing key:
 *   • There is NO default. A missing or short key must raise, never
 *     silently fall back to a published value.
 *   • Rotation is explicit: JWT_SECRET signs new tokens,
 *     JWT_SECRET_PREVIOUS is accepted for verification during the window.
 *   • An expired token is never rescued by the previous key.
 *
 * No DB, no network. Pure functions plus jsonwebtoken.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import jwt from "jsonwebtoken";
import {
  JWT_SECRET_MIN_LENGTH,
  JwtSecretConfigError,
  formatJwtSecretFatalMessage,
  getJwtSecret,
  getPreviousJwtSecret,
  resolveJwtSecrets,
  signJwt,
  verifyJwt,
} from "../../src/config/jwtSecret.js";

const GOOD = "current-secret-that-is-at-least-32-chars";
const OLD  = "previous-secret-that-is-at-least-32-chars";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.JWT_SECRET = GOOD;
  delete process.env.JWT_SECRET_PREVIOUS;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// ══════════════════════════════════════════════════════════════════════════
// resolveJwtSecrets
// ══════════════════════════════════════════════════════════════════════════

describe("resolveJwtSecrets", () => {
  it("returns the secret when it is long enough", () => {
    expect(resolveJwtSecrets().secret).toBe(GOOD);
  });

  it("throws when JWT_SECRET is missing", () => {
    delete process.env.JWT_SECRET;
    expect(() => resolveJwtSecrets()).toThrow(JwtSecretConfigError);
  });

  it("throws when JWT_SECRET is an empty string", () => {
    process.env.JWT_SECRET = "";
    expect(() => resolveJwtSecrets()).toThrow(JwtSecretConfigError);
  });

  it("throws when JWT_SECRET is only whitespace", () => {
    process.env.JWT_SECRET = "   \t  ";
    expect(() => resolveJwtSecrets()).toThrow(JwtSecretConfigError);
  });

  it("throws when JWT_SECRET is one character below the minimum", () => {
    process.env.JWT_SECRET = "a".repeat(JWT_SECRET_MIN_LENGTH - 1);
    expect(() => resolveJwtSecrets()).toThrow(/at least 32 characters/);
  });

  it("accepts a secret of exactly the minimum length", () => {
    const exact = "b".repeat(JWT_SECRET_MIN_LENGTH);
    process.env.JWT_SECRET = exact;
    expect(resolveJwtSecrets().secret).toBe(exact);
  });

  it("reports 'missing' as the fault code when unset", () => {
    delete process.env.JWT_SECRET;
    try {
      resolveJwtSecrets();
      throw new Error("expected resolveJwtSecrets to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(JwtSecretConfigError);
      expect((err as JwtSecretConfigError).fault.code).toBe("missing");
      expect((err as JwtSecretConfigError).fault.field).toBe("JWT_SECRET");
    }
  });

  it("reports 'too_short' as the fault code when under the minimum", () => {
    process.env.JWT_SECRET = "short";
    try {
      resolveJwtSecrets();
      throw new Error("expected resolveJwtSecrets to throw");
    } catch (err) {
      expect((err as JwtSecretConfigError).fault.code).toBe("too_short");
    }
  });

  it("trims surrounding whitespace from the secret", () => {
    process.env.JWT_SECRET = `  ${GOOD}\n`;
    expect(resolveJwtSecrets().secret).toBe(GOOD);
  });

  it("trims surrounding whitespace from the previous secret", () => {
    process.env.JWT_SECRET_PREVIOUS = `  ${OLD}\n`;
    expect(resolveJwtSecrets().previous).toBe(OLD);
  });

  it("returns no previous secret when JWT_SECRET_PREVIOUS is unset", () => {
    delete process.env.JWT_SECRET_PREVIOUS;
    expect(resolveJwtSecrets().previous).toBeUndefined();
  });

  it("returns no previous secret when JWT_SECRET_PREVIOUS is empty", () => {
    process.env.JWT_SECRET_PREVIOUS = "";
    expect(resolveJwtSecrets().previous).toBeUndefined();
  });

  it("throws when JWT_SECRET_PREVIOUS is shorter than the minimum", () => {
    process.env.JWT_SECRET_PREVIOUS = "short";
    try {
      resolveJwtSecrets();
      throw new Error("expected resolveJwtSecrets to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(JwtSecretConfigError);
      expect((err as JwtSecretConfigError).fault.code).toBe("previous_too_short");
      expect((err as JwtSecretConfigError).fault.field).toBe("JWT_SECRET_PREVIOUS");
    }
  });

  it("never returns a default when the key is missing", () => {
    delete process.env.JWT_SECRET;
    const anyResult = (() => {
      try { return resolveJwtSecrets(); } catch { return null; }
    })();
    expect(anyResult).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// getJwtSecret / getPreviousJwtSecret
// ══════════════════════════════════════════════════════════════════════════

describe("getJwtSecret", () => {
  it("returns the current secret", () => {
    expect(getJwtSecret()).toBe(GOOD);
  });

  it("throws when the secret is unusable", () => {
    delete process.env.JWT_SECRET;
    expect(() => getJwtSecret()).toThrow(JwtSecretConfigError);
  });
});

describe("getPreviousJwtSecret", () => {
  it("returns undefined outside a rotation window", () => {
    expect(getPreviousJwtSecret()).toBeUndefined();
  });

  it("returns the previous secret during a rotation window", () => {
    process.env.JWT_SECRET_PREVIOUS = OLD;
    expect(getPreviousJwtSecret()).toBe(OLD);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// signJwt / verifyJwt
// ══════════════════════════════════════════════════════════════════════════

describe("signJwt + verifyJwt", () => {
  it("round-trips a payload signed with the current secret", () => {
    const token = signJwt({ id: "user-1", role: "admin" }, { expiresIn: "1h" });
    const payload = verifyJwt<{ id: string; role: string }>(token);
    expect(payload.id).toBe("user-1");
    expect(payload.role).toBe("admin");
  });

  it("always signs with the CURRENT secret, never the previous one", () => {
    process.env.JWT_SECRET_PREVIOUS = OLD;
    const token = signJwt({ id: "user-1" }, { expiresIn: "1h" });
    // Decoding with the previous secret must FAIL — if this passes, a new
    // token minted during the rotation window could still be signed with
    // the retired key after the window closes.
    expect(() => jwt.verify(token, OLD)).toThrow();
    expect(() => jwt.verify(token, GOOD)).not.toThrow();
  });

  it("accepts a token signed under the previous secret during rotation", () => {
    const legacy = jwt.sign({ id: "legacy-user" }, OLD, { expiresIn: "1h" });
    process.env.JWT_SECRET_PREVIOUS = OLD;
    expect(verifyJwt<{ id: string }>(legacy).id).toBe("legacy-user");
  });

  it("rejects a token signed under the previous secret once the window closes", () => {
    const legacy = jwt.sign({ id: "legacy-user" }, OLD, { expiresIn: "1h" });
    delete process.env.JWT_SECRET_PREVIOUS;
    expect(() => verifyJwt(legacy)).toThrow();
  });

  it("rejects a token signed with an unrelated secret", () => {
    const foreign = jwt.sign({ id: "x" }, "totally-different-secret-32-chars!!", { expiresIn: "1h" });
    process.env.JWT_SECRET_PREVIOUS = OLD;
    expect(() => verifyJwt(foreign)).toThrow();
  });

  it("does NOT rescue an expired token with the previous secret", () => {
    // exp is an absolute deadline. Accepting a stale key for an expired
    // token would extend the session beyond the issuer's intent.
    const expired = jwt.sign({ id: "u1" }, OLD, { expiresIn: -60 });
    process.env.JWT_SECRET_PREVIOUS = OLD;
    expect(() => verifyJwt(expired)).toThrow(/jwt expired/i);
  });

  it("reports the primary error when both secrets reject the token", () => {
    const bad = "not-a-jwt";
    process.env.JWT_SECRET_PREVIOUS = OLD;
    expect(() => verifyJwt(bad)).toThrow(jwt.JsonWebTokenError);
  });

  it("throws JwtSecretConfigError when no usable secret is configured", () => {
    delete process.env.JWT_SECRET;
    expect(() => verifyJwt("anything")).toThrow(JwtSecretConfigError);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// formatJwtSecretFatalMessage
// ══════════════════════════════════════════════════════════════════════════

describe("formatJwtSecretFatalMessage", () => {
  it("points the operator at the remediation", () => {
    const msg = formatJwtSecretFatalMessage({
      field: "JWT_SECRET",
      code: "missing",
      message: "is not set",
    });
    expect(msg).toContain("JWT_SECRET");
    expect(msg).toContain("Remediation");
    expect(msg).toContain("Set JWT_SECRET");
    expect(msg).toContain("randomBytes");
  });

  it("explains the rotation procedure", () => {
    const msg = formatJwtSecretFatalMessage({
      field: "JWT_SECRET",
      code: "missing",
      message: "is not set",
    });
    expect(msg).toContain("JWT_SECRET_PREVIOUS");
  });

  it("gives a different remediation for a bad previous secret", () => {
    const msg = formatJwtSecretFatalMessage({
      field: "JWT_SECRET_PREVIOUS",
      code: "previous_too_short",
      message: "must be at least 32 characters when set",
    });
    expect(msg).toContain("unset JWT_SECRET_PREVIOUS");
    expect(msg).not.toContain("Set JWT_SECRET in your environment");
  });

  it("never leaks the secret value into the message", () => {
    const msg = formatJwtSecretFatalMessage({
      field: "JWT_SECRET",
      code: "too_short",
      message: "must be at least 32 characters (got 4)",
    });
    expect(msg).not.toContain("asella-organic-preview");
  });
});
