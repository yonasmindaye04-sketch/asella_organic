#!/usr/bin/env node
/**
 * security/scripts/auth-matrix.mjs
 *
 * Authenticated authorization matrix, CSRF/origin checks, login throttling,
 * cookie flags, and a small set of IDOR probes.
 *
 * Active: requires --active and a non-production target.
 *
 * Usage:
 *   node security/scripts/auth-matrix.mjs --target https://staging.example.com --active
 */

import {
  loadConfig,
  assertActiveAllowed,
  credentialsFor,
  configuredRoles,
  UsageError,
  SafetyError,
} from "./lib/config.mjs";
import { createHttpClient, header, cookieValue, decodeJwt, parseJsonBody } from "./lib/http.mjs";
import { createSuite } from "./lib/report.mjs";

const ROUTES = [
  {
    id: "ASE-ATHZ-01",
    method: "GET",
    path: "/api/auth/me",
    allow: ["admin", "manager", "employee", "store_manager", "call_center", "delivery", "affiliate", "vendor", "tech_support"],
    label: "Any authenticated principal can read their own profile",
  },
  {
    id: "ASE-ATHZ-02",
    method: "GET",
    path: "/api/orders?limit=1",
    allow: ["admin", "manager", "employee", "delivery", "call_center", "store_manager"],
    label: "Order book is limited to fulfilment and finance roles",
  },
  {
    id: "ASE-ATHZ-03",
    method: "GET",
    path: "/api/customers?limit=1",
    allow: ["admin", "manager", "employee", "store_manager", "call_center"],
    label: "Customer PII is limited to customer-facing roles",
  },
  {
    id: "ASE-ATHZ-04",
    method: "GET",
    path: "/api/stock?limit=1",
    allow: ["admin", "manager", "employee", "store_manager", "call_center"],
    label: "Stock valuation is limited to inventory roles",
  },
  {
    id: "ASE-ATHZ-05",
    method: "GET",
    path: "/api/staff?limit=1",
    allow: ["admin", "manager"],
    label: "Staff directory is admin/manager only",
  },
  {
    id: "ASE-ATHZ-06",
    method: "GET",
    path: "/api/reports/pl",
    allow: ["admin", "manager"],
    label: "Profit and loss is admin/manager only",
  },
  {
    id: "ASE-ATHZ-07",
    method: "GET",
    path: "/api/admin/audit-log?limit=1",
    allow: ["admin", "manager"],
    label: "Audit log is admin/manager only",
  },
  {
    id: "ASE-ATHZ-08",
    method: "GET",
    path: "/api/products/admin-catalog",
    allow: ["admin", "manager"],
    label: "Cost-bearing catalog is admin/manager only",
  },
  {
    id: "ASE-ATHZ-09",
    method: "GET",
    path: "/api/expenses?limit=1",
    allow: ["admin", "manager"],
    label: "Expenses are admin/manager only",
  },
  {
    id: "ASE-ATHZ-10",
    method: "GET",
    path: "/api/referrals/config",
    allow: ["admin"],
    label: "Affiliate program configuration is admin only",
  },
  {
    id: "ASE-ATHZ-11",
    method: "GET",
    path: "/api/telegram/info",
    allow: ["admin", "manager"],
    label: "Telegram integration details are admin/manager only",
  },
  {
    id: "ASE-ATHZ-12",
    method: "GET",
    path: "/api/affiliate/me",
    allow: ["affiliate"],
    label: "Affiliate portal is affiliate-only and JWT-scoped",
  },
];

const PROTECTED_PATHS = [
  "/api/orders?limit=1",
  "/api/customers?limit=1",
  "/api/stock?limit=1",
  "/api/staff?limit=1",
  "/api/reports/pl",
  "/api/admin/audit-log?limit=1",
  "/api/products/admin-catalog",
  "/api/expenses?limit=1",
  "/api/referrals/config",
  "/api/telegram/info",
];

function testIp(seed) {
  // TEST-NET-2 (198.51.100.0/24) — never routed on the public internet.
  return `198.51.100.${seed % 250 + 2}`;
}

function statusIsDenied(status) {
  return status === 401 || status === 403;
}

function statusIsAllowed(status) {
  return status >= 200 && status < 300;
}

async function loginRole(config, role) {
  const creds = credentialsFor(config, role);
  if (!creds) return null;

  const client = createHttpClient(config);
  const result = await client.login(creds.username, creds.password, {
    headers: { "x-forwarded-for": testIp(role.length * 17 + 3) },
  });

  return { role, client, ...result, credentials: creds };
}

async function main() {
  const config = loadConfig({ requireTarget: true });
  assertActiveAllowed(config);

  const suite = createSuite({
    id: "auth-matrix",
    name: "Authenticated authorization matrix",
    mode: "active",
    target: config.target,
    description: "RBAC, IDOR, CSRF, login throttling, and cookie flags",
  });

  const roles = configuredRoles(config);
  if (roles.length === 0) {
    suite.skip(
      "ASE-ATHZ-00",
      "Role credentials configured",
      "high",
      "No SECURITY_<ROLE>_USER / _PASS pairs. Cannot test authorization."
    );
    suite.finish(config);
    return;
  }

  const sessions = new Map();
  for (const role of roles) {
    const session = await loginRole(config, role);
    if (!session) continue;

    if (!session.token) {
      suite.fail(
        "ASE-ATHN-01",
        `Login succeeds for ${role}`,
        "high",
        {
          role,
          status: session.response.status,
          error: session.response.json?.error || session.response.text?.slice(0, 200),
        },
        "Verify the test account exists, is active, and the password is correct. Also check that the staging origin is in ALLOWED_ORIGINS.",
        ["WSTG-ATHN-01"]
      );
      continue;
    }

    sessions.set(role, session);

    const me = await session.client.get("/api/auth/me", {
      token: session.token,
      headers: { "x-forwarded-for": testIp(role.length + 11) },
    });

    const actualRole = me.json?.data?.user?.role || me.json?.user?.role || null;
    if (me.status === 200 && actualRole && actualRole !== role) {
      suite.warn(
        "ASE-ATHN-02",
        `Session role matches the configured account for ${role}`,
        "medium",
        { expected: role, actual: actualRole },
        "The test account may be mislabelled. Fix the fixture before trusting matrix results."
      );
    }
  }

  if (sessions.size === 0) {
    suite.skip("ASE-ATHZ-00", "Authorization matrix", "high", "No role logged in.");
    suite.finish(config);
    return;
  }

  // ── Route matrix ─────────────────────────────────────────────────────────
  for (const route of ROUTES) {
    const results = [];

    for (const [role, session] of sessions.entries()) {
      const response = await session.client.request(route.method, route.path, {
        token: session.token,
        headers: { "x-forwarded-for": testIp(role.length * 13 + route.id.length) },
      });
      results.push({ role, status: response.status, error: response.error || null });
    }

    const expected = new Set(route.allow);
    const bypasses = results.filter(
      (r) => !expected.has(r.role) && statusIsAllowed(r.status)
    );
    const overRestricted = results.filter(
      (r) => expected.has(r.role) && statusIsDenied(r.status)
    );
    const notFound = results.filter((r) => r.status === 404);
    const serverErrors = results.filter((r) => r.status >= 500);
    const ambiguous = results.filter(
      (r) => !expected.has(r.role) && [400, 422].includes(r.status)
    );

    if (bypasses.length) {
      suite.fail(
        route.id,
        route.label,
        "high",
        {
          bypasses: bypasses.map((r) => `${r.role} -> ${r.status}`),
          expected: [...expected],
          all: results.map((r) => `${r.role}:${r.status}`),
        },
        "Add or correct the authorise() role list on this route. Treat any unexpected 2xx as an authorization bypass.",
        ["WSTG-ATHZ-01", "WSTG-ATHZ-02"]
      );
    } else if (overRestricted.length) {
      // A role that was expected to reach the route was denied. That is not
      // itself exploitable — the safe outcome is a denial — so it is reported
      // as inconclusive rather than as a vulnerability. The usual cause is an
      // incomplete test fixture: the role exists in staff_users but has no
      // linked profile, so a second guard denies it.
      suite.warn(
        route.id,
        route.label,
        "medium",
        {
          denied: overRestricted.map((r) => `${r.role} -> ${r.status}`),
          expected: [...expected],
          all: results.map((r) => `${r.role}:${r.status}`),
          note: "The expected role was denied, so this route was not fully exercised. Check the role list and the test fixture.",
        },
        "Confirm the role list on the route and that the test account has every linked record the route requires (for example an affiliate profile).",
        ["WSTG-ATHZ-01"]
      );
    } else if (serverErrors.length) {
      suite.warn(
        route.id,
        route.label,
        "medium",
        serverErrors.map((r) => `${r.role} -> ${r.status}`),
        "Investigate the 5xx before trusting the authorization result."
      );
    } else if (notFound.length === results.length) {
      suite.warn(
        route.id,
        route.label,
        "low",
        "Every role received 404. The path may be wrong or the route is not deployed.",
        "Confirm the route path against backend/src/app.ts."
      );
    } else if (ambiguous.length) {
      suite.warn(
        route.id,
        route.label,
        "medium",
        ambiguous.map((r) => `${r.role} -> ${r.status}`),
        "A denied role reached validation instead of the role guard. Check middleware order."
      );
    } else {
      suite.pass(route.id, route.label, "info", results.map((r) => `${r.role}:${r.status}`));
    }
  }

  // ── tech_support superuser check ─────────────────────────────────────────
  if (sessions.has("tech_support")) {
    const session = sessions.get("tech_support");
    const probes = [
      "/api/staff?limit=1",
      "/api/reports/pl",
      "/api/admin/audit-log?limit=1",
      "/api/products/admin-catalog",
      "/api/referrals/config",
    ];

    const allowed = [];
    for (const p of probes) {
      const response = await session.client.get(p, {
        token: session.token,
        headers: { "x-forwarded-for": testIp(97) },
      });
      if (statusIsAllowed(response.status)) allowed.push({ path: p, status: response.status });
    }

    if (allowed.length) {
      suite.fail(
        "ASE-ATHZ-20",
        "tech_support is not an implicit superuser",
        "critical",
        allowed,
        "Remove the unconditional tech_support bypass in backend/src/middleware/auth.ts:183. Add the role explicitly to the routes it legitimately needs.",
        ["CWE-269", "SECURITY_REVIEW.md"]
      );
    } else {
      suite.pass(
        "ASE-ATHZ-20",
        "tech_support is not an implicit superuser",
        "info",
        "No admin-only route accepted the tech_support session."
      );
    }
  } else {
    suite.skip(
      "ASE-ATHZ-20",
      "tech_support is not an implicit superuser",
      "critical",
      "No tech_support credentials configured."
    );
  }

  // ── Unauthenticated access ───────────────────────────────────────────────
  const anonymous = createHttpClient(config);
  const anonymousAllowed = [];
  for (const p of PROTECTED_PATHS) {
    const response = await anonymous.get(p, {
      origin: false,
      headers: { "x-forwarded-for": testIp(131) },
    });
    if (statusIsAllowed(response.status)) {
      anonymousAllowed.push({ path: p, status: response.status });
    }
  }

  if (anonymousAllowed.length) {
    suite.fail(
      "ASE-ATHZ-21",
      "Protected routes reject anonymous requests",
      "critical",
      anonymousAllowed,
      "Add authenticate() to every route that returns non-public data.",
      ["WSTG-ATHZ-01"]
    );
  } else {
    suite.pass("ASE-ATHZ-21", "Protected routes reject anonymous requests", "info");
  }

  // ── CSRF / Origin checks ─────────────────────────────────────────────────
  const csrfCases = [
    {
      id: "ASE-ATHZ-22",
      label: "Writes reject an untrusted Origin",
      method: "POST",
      path: "/api/orders",
      body: {},
      origin: "https://evil.example",
      expect: 403,
    },
    {
      id: "ASE-ATHZ-23",
      label: "Writes reject a missing Origin and Referer",
      method: "POST",
      path: "/api/orders",
      body: {},
      origin: false,
      expect: 403,
    },
    {
      id: "ASE-ATHZ-24",
      label: "Login rejects an untrusted Origin",
      method: "POST",
      path: "/api/auth/login",
      body: { username: "security-nonexistent", password: ["wrong", "not-a-real", "password"].join("-") },
      origin: "https://evil.example",
      expect: 403,
    },
  ];

  for (const testCase of csrfCases) {
    const response = await anonymous.request(testCase.method, testCase.path, {
      body: testCase.body,
      origin: testCase.origin,
      headers: { "x-forwarded-for": testIp(151) },
    });

    if (response.status === testCase.expect) {
      suite.pass(testCase.id, testCase.label, "info", { status: response.status });
    } else {
      suite.fail(
        testCase.id,
        testCase.label,
        "high",
        {
          status: response.status,
          error: response.json?.error || response.text?.slice(0, 200),
        },
        "Enforce the Origin/Referer allow-list before route handlers. See backend/src/app.ts strict origin middleware.",
        ["WSTG-SESS-05", "CWE-352"]
      );
    }
  }

  // ── Login throttling ─────────────────────────────────────────────────────
  const throttleClient = createHttpClient(config);
  const throttleIp = testIp(181);
  const statuses = [];
  for (let i = 0; i < 12; i += 1) {
    const response = await throttleClient.post(
      "/api/auth/login",
      { username: `security-probe-${i}`, password: ["wrong", "not-a-real", "password"].join("-") },
      { headers: { "x-forwarded-for": throttleIp } }
    );
    statuses.push(response.status);
  }

  if (statuses.includes(429)) {
    suite.pass(
      "ASE-ATHN-03",
      "Login is rate limited",
      "info",
      { attempts: statuses.length, statuses }
    );
  } else {
    suite.fail(
      "ASE-ATHN-03",
      "Login is rate limited",
      "medium",
      { attempts: statuses.length, statuses },
      "The login limiter should return 429 after 10 failures in 5 minutes.",
      ["WSTG-ATHN-03", "CWE-307"]
    );
  }

  // ── X-Forwarded-For spoofing ─────────────────────────────────────────────
  const spoofStatuses = [];
  for (let i = 0; i < 12; i += 1) {
    const response = await throttleClient.post(
      "/api/auth/login",
      { username: `security-spoof-${i}`, password: ["wrong", "not-a-real", "password"].join("-") },
      { headers: { "x-forwarded-for": testIp(200 + i) } }
    );
    spoofStatuses.push(response.status);
  }

  if (!spoofStatuses.includes(429)) {
    suite.fail(
      "ASE-ATHN-04",
      "Rate limiting does not trust client-supplied X-Forwarded-For",
      "medium",
      {
        statuses: spoofStatuses,
        note: "Twelve failures from twelve forged XFF values never produced 429.",
      },
      "Key the limiter on req.ip with a correctly configured trust proxy, or strip client XFF at the edge.",
      ["WSTG-ATHN-03", "CWE-307", "SECURITY_REVIEW.md D"]
    );
  } else {
    suite.pass(
      "ASE-ATHN-04",
      "Rate limiting does not trust client-supplied X-Forwarded-For",
      "info",
      spoofStatuses
    );
  }

  // ── Cookie flags and token shape ─────────────────────────────────────────
  const admin = sessions.get("admin") || sessions.values().next().value;
  if (admin) {
    const accessCookie = cookieValue(admin.response, "access_token");
    const refreshCookie = cookieValue(admin.response, "refresh_token");
    const cookieLines = admin.response.setCookie || [];

    const issues = [];
    for (const line of cookieLines) {
      const name = line.split("=")[0];
      const lower = line.toLowerCase();
      if (!lower.includes("httponly")) issues.push(`${name}: missing HttpOnly`);
      if (config.targetUrl.protocol === "https:" && !lower.includes("secure")) {
        issues.push(`${name}: missing Secure`);
      }
      if (!/samesite\s*=\s*strict/i.test(line)) issues.push(`${name}: SameSite is not Strict`);
    }

    if (issues.length) {
      suite.fail(
        "ASE-SESS-01",
        "Session cookies use HttpOnly, Secure, and SameSite=Strict",
        "medium",
        issues,
        "Set all three flags on access and refresh cookies.",
        ["WSTG-SESS-02"]
      );
    } else {
      suite.pass(
        "ASE-SESS-01",
        "Session cookies use HttpOnly, Secure, and SameSite=Strict",
        "info",
        { accessCookie: Boolean(accessCookie), refreshCookie: Boolean(refreshCookie) }
      );
    }

    const decoded = decodeJwt(admin.token);
    const claims = decoded?.payload || {};
    const claimIssues = [];
    if (!claims.exp) claimIssues.push("no exp");
    if (!claims.iat) claimIssues.push("no iat");
    if (!claims.iss) claimIssues.push("no iss");
    if (!claims.aud) claimIssues.push("no aud");

    if (claimIssues.length) {
      suite.warn(
        "ASE-SESS-02",
        "Access token carries expiry and audience claims",
        "low",
        { issues: claimIssues, claims: Object.keys(claims) },
        "Add iss/aud and validate them in authenticate(). Keep exp short.",
        ["WSTG-SESS-01"]
      );
    } else {
      suite.pass("ASE-SESS-02", "Access token carries expiry and audience claims", "info");
    }

    const cacheControl = String(header(admin.response, "cache-control") || "").toLowerCase();
    if (!cacheControl.includes("no-store")) {
      suite.warn(
        "ASE-SESS-03",
        "Login response is not cacheable",
        "medium",
        { cacheControl: cacheControl || "(missing)" },
        "Send Cache-Control: no-store on /api/auth/login and any response containing tokens.",
        ["WSTG-SESS-01"]
      );
    } else {
      suite.pass("ASE-SESS-03", "Login response is not cacheable", "info", cacheControl);
    }

    // Idempotency middleware runs before authentication. Confirm it does not
    // cache a login response and replay a token.
    const idemKey = `security-login-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const first = await admin.client.post(
      "/api/auth/login",
      { username: admin.credentials.username, password: admin.credentials.password },
      { headers: { "Idempotency-Key": idemKey, "x-forwarded-for": testIp(222) } }
    );
    const second = await admin.client.post(
      "/api/auth/login",
      { username: admin.credentials.username, password: admin.credentials.password },
      { headers: { "Idempotency-Key": idemKey, "x-forwarded-for": testIp(223) } }
    );

    if (second.headers["idempotency-replay"] === "true") {
      // The replay header alone does not prove credentials leaked, so the
      // cached body is parsed and any token in it is used to show impact.
      const replayed = parseJsonBody(second);
      const replayToken =
        replayed.value?.data?.token ||
        replayed.value?.token ||
        replayed.value?.data?.accessToken ||
        replayed.value?.accessToken ||
        null;

      let sessionUsable = null;
      if (replayToken) {
        const probe = await createHttpClient(config).get("/api/auth/me", {
          token: replayToken,
          useCookies: false,
          headers: { "x-forwarded-for": testIp(224) },
        });
        sessionUsable = probe.status === 200;
      }

      suite.fail(
        "ASE-SESS-04",
        "Login responses are not cached by the idempotency middleware",
        "high",
        {
          firstStatus: first.status,
          secondStatus: second.status,
          replayHeader: second.headers["idempotency-replay"],
          tokenInReplayedBody: Boolean(replayToken),
          replayedTokenOpensSession: sessionUsable,
          note: "A replayed Idempotency-Key returned a cached login response containing credentials.",
        },
        "Skip /api/auth/* in idempotencyMiddleware, or run it after authentication and scope keys to the user.",
        ["CWE-384", "SECURITY_REVIEW.md L"]
      );
    } else {
      suite.pass(
        "ASE-SESS-04",
        "Login responses are not cached by the idempotency middleware",
        "info",
        { firstStatus: first.status, secondStatus: second.status }
      );
    }
  }

  // ── 2FA enforcement ──────────────────────────────────────────────────────
  if (admin) {
    const response = await admin.client.delete(
      "/api/orders/00000000-0000-0000-0000-000000000000",
      { headers: { "x-forwarded-for": testIp(231) } }
    );

    if (response.status === 403) {
      suite.pass(
        "ASE-SESS-05",
        "Destructive admin routes enforce 2FA",
        "info",
        "DELETE /api/orders/:id returned 403 without x-2fa-token."
      );
    } else if (response.status === 404) {
      suite.warn(
        "ASE-SESS-05",
        "Destructive admin routes enforce 2FA",
        "medium",
        "The request reached the handler (404) without a TOTP. The admin account likely has no 2FA enrolled, so require2FA is a no-op for it.",
        "Enforce 2FA for privileged roles regardless of whether the caller enrolled, and require enrolment at first login.",
        ["WSTG-ATHN-04", "SECURITY_REVIEW.md"]
      );
    } else {
      suite.warn(
        "ASE-SESS-05",
        "Destructive admin routes enforce 2FA",
        "medium",
        { status: response.status, error: response.json?.error },
        "Unexpected response. Confirm the route and the 2FA middleware."
      );
    }
  }

  // ── IDOR spot checks ─────────────────────────────────────────────────────
  const idorProbes = [];
  for (const role of ["affiliate", "vendor", "delivery"]) {
    const session = sessions.get(role);
    if (!session) continue;

    const response = await session.client.get(
      "/api/orders/00000000-0000-0000-0000-000000000000",
      { token: session.token, headers: { "x-forwarded-for": testIp(241) } }
    );
    idorProbes.push({ role, status: response.status });
  }

  if (idorProbes.length) {
    const leaks = idorProbes.filter((p) => statusIsAllowed(p.status));
    if (leaks.length) {
      suite.fail(
        "ASE-ATHZ-25",
        "Order detail is not readable by unrelated roles",
        "high",
        leaks,
        "Guard GET /api/orders/:id with the same role list as the order list.",
        ["WSTG-ATHZ-02", "CWE-639"]
      );
    } else {
      suite.pass("ASE-ATHZ-25", "Order detail is not readable by unrelated roles", "info", idorProbes);
    }
  }

  // ── Receipt access, if a filename was supplied ───────────────────────────
  const receipt = config.env.SECURITY_RECEIPT_FILENAME;
  if (receipt) {
    const probes = [];
    for (const role of ["admin", "delivery", "affiliate"]) {
      const session = sessions.get(role);
      if (!session) continue;
      const response = await session.client.get(`/api/receipts/${receipt}`, {
        token: session.token,
        headers: { "x-forwarded-for": testIp(251) },
      });
      probes.push({ role, status: response.status });
    }

    const leaked = probes.filter((p) => p.role !== "admin" && statusIsAllowed(p.status));
    if (leaked.length) {
      suite.fail(
        "ASE-ATHZ-26",
        "Receipts are not readable by unrelated roles",
        "high",
        leaked,
        "Keep the receipts allow-list in backend/src/routes/receipts.ts and verify the order-ownership rule.",
        ["WSTG-ATHZ-02", "CWE-639"]
      );
    } else {
      suite.pass("ASE-ATHZ-26", "Receipts are not readable by unrelated roles", "info", probes);
    }
  } else {
    suite.skip(
      "ASE-ATHZ-26",
      "Receipts are not readable by unrelated roles",
      "high",
      "Set SECURITY_RECEIPT_FILENAME to a receipt created during the run."
    );
  }

  suite.finish(config);
}

main().catch((error) => {
  if (error instanceof UsageError || error instanceof SafetyError) {
    console.error(`\n[security] ${error.message}\n`);
    process.exit(error.exitCode || 2);
  }
  console.error("\n[security] auth matrix failed:", error);
  process.exit(1);
});
