#!/usr/bin/env node
/**
 * security/scripts/jwt-probes.mjs
 *
 * JWT and session hardening probes:
 *   - alg=none and signature tampering
 *   - expired tokens
 *   - known default secret acceptance
 *   - logout revocation
 *   - refresh-token replay
 *   - claim hygiene and lifetime
 *
 * Active: requires --active and a non-production target.
 *
 * Usage:
 *   node security/scripts/jwt-probes.mjs --target https://staging.example.com --active
 */

import crypto from "node:crypto";
import {
  loadConfig,
  assertActiveAllowed,
  credentialsFor,
  configuredRoles,
  UsageError,
  SafetyError,
} from "./lib/config.mjs";
import { createHttpClient, decodeJwt } from "./lib/http.mjs";
import { createSuite } from "./lib/report.mjs";

const KNOWN_DEFAULT_SECRETS = [
  "asella-organic-preview-jwt-secret-key-2026-secure",
  "asella-organic-secret-key-change-in-production",
];

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

function signHs256(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}

function unsignedToken(payload) {
  const header = { alg: "none", typ: "JWT" };
  return `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}.`;
}

function tamperSignature(token) {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[2]) return token;
  const first = parts[2][0] === "A" ? "B" : "A";
  parts[2] = first + parts[2].slice(1);
  return parts.join(".");
}

function testIp(seed) {
  return `198.51.100.${seed % 250 + 2}`;
}

async function main() {
  const config = loadConfig({ requireTarget: true });
  assertActiveAllowed(config);

  const suite = createSuite({
    id: "jwt-probes",
    name: "JWT and session hardening",
    mode: "active",
    target: config.target,
    description: "Forgery, revocation, replay, and claim hygiene",
  });

  const roles = configuredRoles(config);
  const preferredRole = ["employee", "manager", "admin"].find((r) => roles.includes(r)) || roles[0];
  const creds = preferredRole ? credentialsFor(config, preferredRole) : null;

  let token = config.env.SECURITY_TOKEN || null;
  let client = createHttpClient(config);
  let loginResponse = null;
  let refreshToken = null;

  if (!token && creds) {
    const login = await client.login(creds.username, creds.password, {
      headers: { "x-forwarded-for": testIp(31) },
    });
    token = login.token;
    refreshToken = login.refreshToken;
    loginResponse = login.response;
  }

  if (!token) {
    suite.skip(
      "ASE-SESS-10",
      "JWT probes",
      "high",
      "No SECURITY_TOKEN and no usable role credentials. Set SECURITY_TOKEN or SECURITY_ADMIN_USER/PASS."
    );
    suite.finish(config);
    return;
  }

  const decoded = decodeJwt(token);
  if (!decoded?.header || !decoded?.payload) {
    suite.fail(
      "ASE-SESS-10",
      "Access token is a well-formed JWT",
      "high",
      token.slice(0, 40),
      "The access token should be a three-part JWT with a decodable header and payload."
    );
    suite.finish(config);
    return;
  }

  const header = decoded.header;
  const payload = decoded.payload;
  const now = Math.floor(Date.now() / 1000);

  suite.pass("ASE-SESS-10", "Access token is a well-formed JWT", "info", {
    alg: header.alg,
    typ: header.typ,
    claims: Object.keys(payload),
  });

  // ── Probe baseline ────────────────────────────────────────────────────────
  // Every forgery result below is only meaningful if a *valid* token is
  // accepted in exactly the same request shape. Without this control, an
  // endpoint that ignores the Authorization header — or a client that leaks
  // the session cookie — would make every forgery look "rejected".
  const baselineResponse = await client.get("/api/auth/me", {
    token,
    useCookies: false,
    headers: { "x-forwarded-for": testIp(40) },
  });

  const baselineOk = baselineResponse.status === 200;
  if (baselineOk) {
    suite.pass(
      "ASE-SESS-09",
      "Bearer-only authentication works (probe baseline)",
      "info",
      { status: baselineResponse.status }
    );
  } else {
    suite.fail(
      "ASE-SESS-09",
      "Bearer-only authentication works (probe baseline)",
      "high",
      {
        status: baselineResponse.status,
        error: baselineResponse.json?.error || baselineResponse.text?.slice(0, 200),
        note:
          "A valid token was not accepted without cookies, so the forgery results below are unreliable.",
      },
      "Confirm /api/auth/me accepts a Bearer token. If the endpoint only accepts cookies, point the probes at an endpoint that validates the Authorization header.",
      ["WSTG-SESS-01"]
    );
  }

  /**
   * Records a forgery probe. When the baseline is broken the probe is skipped
   * rather than passed, because a rejection caused by an unrelated failure
   * would be a false negative.
   */
  function recordForgery(id, title, severity, response, remediation, refs = []) {
    if (!baselineOk) {
      suite.skip(id, title, severity, "Probe baseline invalid — see ASE-SESS-09.");
      return;
    }
    if (response.status === 200) {
      suite.fail(id, title, severity, { status: response.status }, remediation, refs);
    } else {
      suite.pass(id, title, "info", response.status);
    }
  }

  // ── Algorithm ────────────────────────────────────────────────────────────
  if (String(header.alg).toLowerCase() === "none") {
    suite.fail(
      "ASE-SESS-11",
      "Access token uses a signed algorithm",
      "critical",
      { alg: header.alg },
      "Reject alg=none. Pin the expected algorithm in jwt.verify.",
      ["WSTG-SESS-01", "CWE-347"]
    );
  } else {
    suite.pass("ASE-SESS-11", "Access token uses a signed algorithm", "info", header.alg);
  }

  // ── alg=none forgery ─────────────────────────────────────────────────────
  const forgedNone = unsignedToken({
    ...payload,
    role: "admin",
    exp: now + 3600,
    iat: now,
    jti: crypto.randomBytes(16).toString("hex"),
  });
  const noneResponse = await client.get("/api/auth/me", {
    token: forgedNone,
    // No cookies: the app authenticates from the access_token cookie first
    // and falls back to the Bearer header. Replaying the login cookie would
    // authenticate the request regardless of the forged token and mask the
    // result. These probes must be Bearer-only.
    useCookies: false,
    headers: { "x-forwarded-for": testIp(41) },
  });

  recordForgery(
    "ASE-SESS-12",
    "alg=none tokens are rejected",
    "critical",
    noneResponse,
    "jwt.verify must reject unsigned tokens. Pin algorithms: ['HS256'].",
    ["WSTG-SESS-01", "CWE-347"]
  );

  // ── Signature tampering ──────────────────────────────────────────────────
  const tampered = tamperSignature(token);
  const tamperedResponse = await client.get("/api/auth/me", {
    token: tampered,
    useCookies: false,
    headers: { "x-forwarded-for": testIp(42) },
  });

  recordForgery(
    "ASE-SESS-13",
    "Tampered signatures are rejected",
    "critical",
    tamperedResponse,
    "Verify the signature with a constant-time comparison and the configured secret.",
    ["WSTG-SESS-01", "CWE-347"]
  );

  // ── Expiry ───────────────────────────────────────────────────────────────
  if (!payload.exp) {
    suite.fail(
      "ASE-SESS-14",
      "Access token has an expiry",
      "high",
      { claims: Object.keys(payload) },
      "Always set exp. The current issuer uses 1h; keep it short.",
      ["WSTG-SESS-01"]
    );
  } else {
    const lifetime = payload.exp - (payload.iat || now);
    if (lifetime > 3600) {
      suite.warn(
        "ASE-SESS-14",
        "Access token lifetime is at most one hour",
        "medium",
        { lifetimeSeconds: lifetime, exp: new Date(payload.exp * 1000).toISOString() },
        "Shorten access tokens and rely on refresh tokens for continuity.",
        ["WSTG-SESS-01"]
      );
    } else {
      suite.pass("ASE-SESS-14", "Access token lifetime is at most one hour", "info", {
        lifetimeSeconds: lifetime,
      });
    }
  }

  // ── Expired token, if the tester supplied the secret ─────────────────────
  const secret = config.env.JWT_SECRET;
  if (secret) {
    // Control: a token signed with the same secret but a valid expiry must be
    // accepted. Without this, a token signed with the *wrong* secret would be
    // rejected too, and the probe would report a false PASS.
    const control = signHs256(
      { ...payload, exp: now + 3600, iat: now },
      secret
    );
    const controlResponse = await client.get("/api/auth/me", {
      token: control,
      useCookies: false,
      headers: { "x-forwarded-for": testIp(42) },
    });

    if (controlResponse.status !== 200) {
      suite.skip(
        "ASE-SESS-15",
        "Expired tokens are rejected",
        "critical",
        `The configured JWT_SECRET does not match this server (control token got ${controlResponse.status}). Set JWT_SECRET to the server's value to enable this probe.`
      );
    } else {
      const expired = signHs256(
        { ...payload, exp: now - 3600, iat: now - 7200 },
        secret
      );
      const expiredResponse = await client.get("/api/auth/me", {
        token: expired,
        useCookies: false,
        headers: { "x-forwarded-for": testIp(43) },
      });

      recordForgery(
        "ASE-SESS-15",
        "Expired tokens are rejected",
        "critical",
        expiredResponse,
        "jwt.verify should reject exp in the past. Do not disable expiry checks.",
        ["WSTG-SESS-01", "CWE-613"]
      );
    }
  } else {
    suite.skip(
      "ASE-SESS-15",
      "Expired tokens are rejected",
      "high",
      "Set JWT_SECRET in the environment to mint an expired token for this test."
    );
  }

  // ── Known default secret ─────────────────────────────────────────────────
  const defaultTestEnabled =
    config.env.SECURITY_TEST_DEFAULT_SECRET === "1" ||
    config.args["test-default-secret"] === true;

  if (!defaultTestEnabled) {
    suite.skip(
      "ASE-SESS-16",
      "Known default JWT secret is rejected",
      "critical",
      "Set SECURITY_TEST_DEFAULT_SECRET=1 to attempt a token signed with the repository's fallback secret."
    );
  } else {
    // Prefer the admin identity so a successful forgery proves privilege,
    // not just token acceptance.
    let targetPayload = { ...payload };
    let adminToken = null;
    const adminCreds = credentialsFor(config, "admin");
    if (adminCreds) {
      const adminClient = createHttpClient(config);
      const adminLogin = await adminClient.login(adminCreds.username, adminCreds.password, {
        headers: { "x-forwarded-for": testIp(44) },
      });
      adminToken = adminLogin.token;
      const adminDecoded = decodeJwt(adminLogin.token);
      if (adminDecoded?.payload?.id) targetPayload = { ...adminDecoded.payload };
    }

    // This probe targets an admin-only route, so it needs its own control: a
    // genuine admin token must reach that route. Otherwise a 403 on the
    // forged token could just be the role guard, not the signature check.
    const controlResponse = adminToken
      ? await client.get("/api/staff?limit=1", {
          token: adminToken,
          useCookies: false,
          headers: { "x-forwarded-for": testIp(45) },
        })
      : null;

    const controlOk = controlResponse?.status === 200;

    if (!controlOk) {
      suite.skip(
        "ASE-SESS-16",
        "Known default JWT secret is rejected",
        "critical",
        controlResponse
          ? `Could not establish a control: a genuine admin token got ${controlResponse.status} from /api/staff.`
          : "No admin credentials, so the admin-only route could not be controlled."
      );
    } else {
      const acceptedSecrets = [];
      for (const candidate of KNOWN_DEFAULT_SECRETS) {
        const forged = signHs256(
          {
            ...targetPayload,
            role: "admin",
            exp: now + 3600,
            iat: now,
            jti: crypto.randomBytes(16).toString("hex"),
          },
          candidate
        );

        const response = await client.get("/api/staff?limit=1", {
          token: forged,
          useCookies: false,
          headers: { "x-forwarded-for": testIp(46) },
        });

        if (response.status === 200) {
          acceptedSecrets.push(candidate);
          break;
        }
      }

      if (acceptedSecrets.length) {
        suite.fail(
          "ASE-SESS-16",
          "Known default JWT secret is rejected",
          "critical",
          {
            acceptedSecretPrefix: `${acceptedSecrets[0].slice(0, 12)}…`,
            note: "A token signed with the repository fallback secret was accepted. Rotate JWT_SECRET immediately and remove the default.",
          },
          "Require JWT_SECRET with no default, fail startup when it is missing, and rotate all sessions.",
          ["CWE-798", "CWE-321", "config/env.ts:27"]
        );
      } else {
        suite.pass(
          "ASE-SESS-16",
          "Known default JWT secret is rejected",
          "info",
          "Neither repository fallback secret was accepted."
        );
      }
    }
  }

  // ── Logout revocation ────────────────────────────────────────────────────
  if (creds) {
    const logoutClient = createHttpClient(config);
    const login = await logoutClient.login(creds.username, creds.password, {
      headers: { "x-forwarded-for": testIp(46) },
    });

    if (login.token) {
      const logout = await logoutClient.post("/api/auth/logout", {}, {
        token: login.token,
        headers: { "x-forwarded-for": testIp(47) },
      });

      const reuse = await logoutClient.get("/api/auth/me", {
        token: login.token,
        // Bearer-only, so this measures token revocation rather than whether
        // the browser cookie was cleared.
        useCookies: false,
        headers: { "x-forwarded-for": testIp(48) },
      });

      if (reuse.status === 200) {
        suite.fail(
          "ASE-SESS-17",
          "Logout revokes the access token",
          "medium",
          {
            logoutStatus: logout.status,
            reuseStatus: reuse.status,
            note: "The access token still worked after logout.",
          },
          "Insert the token jti into session_blocklist on logout and check it in authenticate().",
          ["WSTG-SESS-06", "CWE-613"]
        );
      } else {
        suite.pass(
          "ASE-SESS-17",
          "Logout revokes the access token",
          "info",
          { logoutStatus: logout.status, reuseStatus: reuse.status }
        );
      }
    }
  } else {
    suite.skip("ASE-SESS-17", "Logout revokes the access token", "medium", "No credentials.");
  }

  // ── Refresh token replay ─────────────────────────────────────────────────
  if (refreshToken) {
    const refreshClient = createHttpClient(config);
    const first = await refreshClient.post(
      "/api/auth/refresh",
      { refreshToken },
      { headers: { "x-forwarded-for": testIp(49) } }
    );
    const second = await refreshClient.post(
      "/api/auth/refresh",
      { refreshToken },
      { headers: { "x-forwarded-for": testIp(50) } }
    );

    if (first.status === 200 && second.status === 200) {
      suite.warn(
        "ASE-SESS-18",
        "Refresh tokens are single-use",
        "medium",
        {
          firstStatus: first.status,
          secondStatus: second.status,
          note: "The same refresh token was accepted twice.",
        },
        "Rotate refresh tokens on use and revoke the previous token. Detect reuse and revoke the family.",
        ["WSTG-SESS-06", "CWE-384"]
      );
    } else {
      suite.pass("ASE-SESS-18", "Refresh tokens are single-use", "info", {
        firstStatus: first.status,
        secondStatus: second.status,
      });
    }
  } else {
    suite.skip("ASE-SESS-18", "Refresh tokens are single-use", "medium", "No refresh token captured.");
  }

  // ── Refresh token is not an access token ─────────────────────────────────
  if (refreshToken) {
    const response = await client.get("/api/auth/me", {
      token: refreshToken,
      useCookies: false,
      headers: { "x-forwarded-for": testIp(51) },
    });

    recordForgery(
      "ASE-SESS-19",
      "Refresh token is not accepted as an access token",
      "critical",
      response,
      "Keep refresh tokens opaque and resolve them only at /api/auth/refresh.",
      ["WSTG-SESS-01"]
    );
  }

  // ── Claim hygiene ────────────────────────────────────────────────────────
  const sensitiveKeys = Object.keys(payload).filter((key) =>
    /password|secret|hash|token|otp|totp/i.test(key)
  );
  if (sensitiveKeys.length) {
    suite.fail(
      "ASE-SESS-20",
      "Access token contains no secrets",
      "high",
      sensitiveKeys,
      "Never put password hashes, TOTP secrets, or refresh tokens in a JWT.",
      ["WSTG-SESS-01", "CWE-522"]
    );
  } else {
    suite.pass("ASE-SESS-20", "Access token contains no secrets", "info", Object.keys(payload));
  }

  const missingClaims = ["iss", "aud"].filter((claim) => !(claim in payload));
  if (missingClaims.length) {
    suite.warn(
      "ASE-SESS-21",
      "Access token carries issuer and audience claims",
      "low",
      { missing: missingClaims },
      "Add iss/aud at issue time and verify both in authenticate().",
      ["WSTG-SESS-01"]
    );
  } else {
    suite.pass("ASE-SESS-21", "Access token carries issuer and audience claims", "info");
  }

  // ── Login response cache ─────────────────────────────────────────────────
  if (loginResponse) {
    const cacheControl = String(loginResponse.headers["cache-control"] || "").toLowerCase();
    if (!cacheControl.includes("no-store")) {
      suite.warn(
        "ASE-SESS-22",
        "Login response is marked no-store",
        "medium",
        { cacheControl: cacheControl || "(missing)" },
        "Add Cache-Control: no-store to /api/auth/login and /api/auth/refresh.",
        ["WSTG-SESS-01"]
      );
    } else {
      suite.pass("ASE-SESS-22", "Login response is marked no-store", "info", cacheControl);
    }
  }

  suite.finish(config);
}

main().catch((error) => {
  if (error instanceof UsageError || error instanceof SafetyError) {
    console.error(`\n[security] ${error.message}\n`);
    process.exit(error.exitCode || 2);
  }
  console.error("\n[security] JWT probes failed:", error);
  process.exit(1);
});
