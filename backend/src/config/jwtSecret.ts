/**
 * src/config/jwtSecret.ts
 * Asella Organic — JWT Signing Key Resolution & Rotation (ASE-2026-003)
 *
 * Single source of truth for the HMAC signing key used by jsonwebtoken.
 * Before this module the key lived in two places:
 *
 *   1. `src/config/env.ts` — as a zod field with a PUBLISHED DEFAULT
 *      (`asella-organic-preview-jwt-secret-key-2026-secure`). An operator
 *      who simply forgot to set JWT_SECRET got a secret that is in the
 *      public git history — meaning anyone could mint an admin token.
 *   2. `src/middleware/auth.ts` and `src/lib/security.ts` — each read
 *      `process.env.JWT_SECRET` independently, so a rotation could not be
 *      expressed at all: the verifier and the issuer could disagree.
 *
 * This module fixes both:
 *
 *   • There is NO default. If the key is missing or shorter than 32
 *     characters the caller gets a `JwtSecretConfigError` — never a
 *     fallback value. `src/config/env.ts` turns that error into a fatal
 *     boot failure (exit code 78).
 *   • Rotation is a first-class concept. `JWT_SECRET` is what new tokens
 *     are signed with; `JWT_SECRET_PREVIOUS` — when set — is ALSO accepted
 *     for verification, so a secret can be rotated without logging
 *     everybody out. Verification falls back ONLY on a signature mismatch;
 *     an expired token is never rescued by the previous key, because `exp`
 *     is an absolute deadline rather than a function of the signing key.
 *
 * Nothing here reads the environment at import time. Resolution happens
 * per call so that a long-lived process picks up a rotated key and so
 * that tests can drive it explicitly.
 */

import jwt from "jsonwebtoken";

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * Minimum key length for HS256.
 *
 * HMAC-SHA256 has a 256-bit output, so a key shorter than the hash output
 * cannot be considered full strength: the effective security is bounded by
 * the key length. 32 bytes matches the digest width.
 */
export const JWT_SECRET_MIN_LENGTH = 32;

// ── Errors ──────────────────────────────────────────────────────────────────

export type JwtSecretFaultCode =
  | "missing"
  | "too_short"
  | "previous_too_short";

export interface JwtSecretFault {
  /** Which variable is at fault. */
  field: "JWT_SECRET" | "JWT_SECRET_PREVIOUS";
  /** Machine-readable reason. */
  code: JwtSecretFaultCode;
  /** Operator-facing explanation. */
  message: string;
}

/**
 * Thrown when the signing key cannot be used. Deliberately distinct from a
 * generic Error so the boot path can single it out for a fatal exit while
 * every other configuration problem keeps its existing "warn and use the
 * schema default" behaviour.
 */
export class JwtSecretConfigError extends Error {
  readonly fault: JwtSecretFault;

  constructor(fault: JwtSecretFault) {
    super(`${fault.field} ${fault.message}`);
    this.name = "JwtSecretConfigError";
    this.fault = fault;
  }
}

// ── Resolution ─────────────────────────────────────────────────────────────

export interface ResolvedJwtSecrets {
  /** The active key. New tokens are always signed with this. */
  secret: string;
  /** The previous key, when a rotation is in progress. */
  previous?: string;
}

/**
 * Resolve the signing key(s) from an environment-shaped record.
 *
 * Throws `JwtSecretConfigError` when the key is absent or too short. It
 * never returns a default — that behaviour is the vulnerability.
 *
 * Values are trimmed: operators paste secrets out of password managers
 * and a single trailing newline would otherwise silently become part of
 * the key, producing an HMAC key one byte longer than the intended one
 * and a stream of spurious "invalid signature" failures.
 */
export function resolveJwtSecrets(
  source: NodeJS.ProcessEnv = process.env,
): ResolvedJwtSecrets {
  const raw = source.JWT_SECRET;

  if (raw === undefined || raw.trim() === "") {
    throw new JwtSecretConfigError({
      field: "JWT_SECRET",
      code: "missing",
      message: "is not set",
    });
  }

  const secret = raw.trim();

  if (secret.length < JWT_SECRET_MIN_LENGTH) {
    throw new JwtSecretConfigError({
      field: "JWT_SECRET",
      code: "too_short",
      message: `must be at least ${JWT_SECRET_MIN_LENGTH} characters (got ${secret.length})`,
    });
  }

  const resolved: ResolvedJwtSecrets = { secret };

  const rawPrevious = source.JWT_SECRET_PREVIOUS;
  if (rawPrevious !== undefined && rawPrevious.trim() !== "") {
    const previous = rawPrevious.trim();
    if (previous.length < JWT_SECRET_MIN_LENGTH) {
      throw new JwtSecretConfigError({
        field: "JWT_SECRET_PREVIOUS",
        code: "previous_too_short",
        message: `must be at least ${JWT_SECRET_MIN_LENGTH} characters when set (got ${previous.length})`,
      });
    }
    resolved.previous = previous;
  }

  return resolved;
}

/**
 * The active signing key.
 *
 * Throws `JwtSecretConfigError` when the key is unusable. Callers that run
 * after boot (every request path) therefore fail closed rather than
 * silently signing with something weaker.
 */
export function getJwtSecret(): string {
  return resolveJwtSecrets().secret;
}

/**
 * The previous signing key during a rotation window, if any.
 */
export function getPreviousJwtSecret(): string | undefined {
  return resolveJwtSecrets().previous;
}

/**
 * Sign a token with the active key.
 *
 * Always uses the CURRENT key — never the previous one — so a rotation
 * window has a well-defined end: after `JWT_SECRET_PREVIOUS` is dropped,
 * no new token can be signed with the retired key.
 */
export function signJwt(
  payload: object,
  options: jwt.SignOptions = {},
): string {
  return jwt.sign(payload, getJwtSecret(), options);
}

/**
 * Verify a token, accepting the previous key during a rotation window.
 *
 * Fall-back rules:
 *   • The current key is tried first.
 *   • `TokenExpiredError` is re-thrown immediately. `exp` is an absolute
 *     deadline; accepting a stale key would extend a session's life
 *     beyond what the issuer intended.
 *   • Any other failure (bad signature, malformed token) causes one retry
 *     against `JWT_SECRET_PREVIOUS`.
 *   • If both fail, the PRIMARY error is thrown so the surfaced message
 *     is the same one the caller would have seen before rotation existed.
 *     We deliberately do not distinguish "wrong current key" from "wrong
 *     previous key" — that would be a token oracle.
 */
export function verifyJwt<T = jwt.JwtPayload>(
  token: string,
  source: NodeJS.ProcessEnv = process.env,
): T {
  const { secret, previous } = resolveJwtSecrets(source);

  try {
    return jwt.verify(token, secret) as T;
  } catch (primaryErr) {
    if (
      primaryErr instanceof jwt.TokenExpiredError ||
      (primaryErr as { name?: string })?.name === "TokenExpiredError"
    ) {
      throw primaryErr;
    }

    if (previous && previous !== secret) {
      try {
        return jwt.verify(token, previous) as T;
      } catch (previousErr) {
        // An expired token is still a rejection — but it is a more accurate
        // diagnosis than "invalid signature" (jsonwebtoken checks the
        // signature before the expiry claim, so the primary attempt
        // against the CURRENT key reports a signature mismatch for a
        // token that was genuinely signed with the retired key).
        if (
          previousErr instanceof jwt.TokenExpiredError ||
          (previousErr as { name?: string })?.name === "TokenExpiredError"
        ) {
          throw previousErr;
        }
        // fall through to the primary error
      }
    }

    throw primaryErr;
  }
}

// ── Operator-facing messaging ──────────────────────────────────────────────

/**
 * The remediation text printed when the boot guard trips.
 *
 * Kept in this module (rather than inline in env.ts) so the message and
 * the resolution rules cannot drift apart.
 */
export function formatJwtSecretFatalMessage(fault: JwtSecretFault): string {
  const lines = [
    "",
    "[env] FATAL: " + fault.field + " " + fault.message + ".",
    "",
    "      The application refuses to start without a usable signing key:",
    "      a missing or shared key means anyone can forge an admin token.",
    "",
    "      Remediation:",
  ];

  if (fault.field === "JWT_SECRET") {
    lines.push("        Set JWT_SECRET in your environment or .env file.");
  } else {
    lines.push(
      "        Either unset JWT_SECRET_PREVIOUS or replace it with a key of",
      `        at least ${JWT_SECRET_MIN_LENGTH} characters.`,
    );
  }

  lines.push(
    "",
    "      Generate a fresh key with:",
    "        node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
    "",
    "      To rotate without invalidating sessions, set BOTH:",
    "        JWT_SECRET=<new key>              # what new tokens will use",
    "        JWT_SECRET_PREVIOUS=<old key>     # accepts tokens minted before the rotation",
    "      After the longest access-token TTL (default: 1h), drop JWT_SECRET_PREVIOUS.",
    "",
  );

  return lines.join("\n");
}
