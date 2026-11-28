#!/usr/bin/env node
/**
 * security/scripts/exposure-probes.mjs
 *
 * Exposure and injection spot checks: sensitive files, debug endpoints,
 * error verbosity, prototype pollution, blind SQL injection timing, HTTP
 * method handling, and host-header handling.
 *
 * Active: requires --active and a non-production target.
 *
 * Usage:
 *   node security/scripts/exposure-probes.mjs --target https://staging.example.com --active
 */

import http from "node:http";
import https from "node:https";
import {
  loadConfig,
  assertActiveAllowed,
  UsageError,
  SafetyError,
} from "./lib/config.mjs";
import { createHttpClient, header } from "./lib/http.mjs";
import { createSuite } from "./lib/report.mjs";

const SENSITIVE_PATHS = [
  { path: "/.env", signature: /(JWT_SECRET|DB_PASSWORD|DATABASE_URL)=/i },
  { path: "/.env.production", signature: /(JWT_SECRET|DB_PASSWORD|VITE_API_URL)=/i },
  { path: "/backend/.env", signature: /(JWT_SECRET|DB_PASSWORD)=/i },
  { path: "/.git/config", signature: /\[core\]|repositoryformatversion/i },
  { path: "/.git/HEAD", signature: /ref:\s*refs\//i },
  { path: "/package.json", signature: /"dependencies"|"workspaces"/i },
  { path: "/backend/package.json", signature: /"dependencies"|"name"\s*:\s*"backend"/i },
  { path: "/tsconfig.json", signature: /"compilerOptions"/i },
  { path: "/db/sql/", signature: /CREATE TABLE|INSERT INTO/i },
  { path: "/private/receipts/", signature: /./i },
  { path: "/server.ts", signature: /import .* from|app\.use/i },
  { path: "/backend/dist/server.js", signature: /import|express/i },
  { path: "/asella-organic-web-afd3fbe2eab3.json", signature: /private_key|client_email/i },
  { path: "/Dockerfile", signature: /FROM |RUN |CMD/i },
  { path: "/docker-compose.yml", signature: /services:|image:/i },
  { path: "/.DS_Store", signature: /./ },
  { path: "/phpinfo.php", signature: /phpinfo\(\)/i },
  { path: "/server-status", signature: /Apache Server Status/i },
  { path: "/actuator/env", signature: /"systemProperties"|"activeProfiles"/i },
  { path: "/api/debug", signature: /./ },
  { path: "/api/docs", signature: /./ },
  { path: "/api/swagger.json", signature: /"openapi"|"swagger"/i },
  { path: "/api/openapi.json", signature: /"openapi"/i },
  { path: "/graphql", signature: /./ },
  { path: "/api/graphql", signature: /./ },
  { path: "/api/seed", signature: /./ },
  { path: "/api/reset", signature: /./ },
];

let ipCounter = 0;
function rotatingIp() {
  ipCounter += 1;
  const pool = ipCounter % 2 === 0 ? "198.51.100" : "203.0.113";
  return `${pool}.${(ipCounter % 250) + 2}`;
}

function looksLikeError(text) {
  return (
    /\bSELECT\b[\s\S]{0,80}\bFROM\b/i.test(text) ||
    /\bmysql\b|mariadb|sqlstate|ER_[A-Z_]+/i.test(text) ||
    /\bat\s+[\w.$<>]+\s*\([\w./\\:-]+:\d+:\d+\)/.test(text) ||
    /\bnode_modules[\\/]/i.test(text) ||
    /at\s+Object\.<anonymous>/.test(text)
  );
}

/**
 * Node's fetch refuses to send TRACE — the Fetch specification forbids the
 * CONNECT, TRACE, and TRACK methods outright. The TRACE probe therefore uses
 * the raw http/https client, which has no such restriction.
 */
function rawTrace(urlString, timeoutMs) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (error) {
      resolve({ status: 0, body: "", error: error.message });
      return;
    }

    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      { method: "TRACE", timeout: timeoutMs },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode, body }));
      }
    );

    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) =>
      resolve({ status: 0, body: "", error: error.message })
    );
    req.end();
  });
}

async function main() {
  const config = loadConfig({ requireTarget: true });
  assertActiveAllowed(config);

  const suite = createSuite({
    id: "exposure-probes",
    name: "Exposure, error handling, and injection spot checks",
    mode: "active",
    target: config.target,
    description: "Sensitive files, debug endpoints, error verbosity, pollution, SQL timing",
  });

  const client = createHttpClient(config);

  // ── Sensitive paths ──────────────────────────────────────────────────────
  // The SPA serves its shell for unknown routes with a 200, so a bare status
  // check would report every probed path as an exposure. The shell is fetched
  // once and used as the reference for "this is just the catch-all".
  const spaShell = await client.get("/this-route-does-not-exist-9f3a", {
    origin: false,
    headers: { "x-forwarded-for": rotatingIp() },
  });
  const spaShellText = spaShell.text || "";

  const shellTitle = (text) => {
    const match = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? match[1].trim() : "";
  };
  const shellTitleValue = shellTitle(spaShellText);

  function isSpaFallback(text) {
    if (!/<!doctype html/i.test(text)) return false;
    // Identical to the shell we were actually served.
    if (spaShellText && text.replace(/\s+/g, " ") === spaShellText.replace(/\s+/g, " ")) {
      return true;
    }
    // Or recognisably the same application shell.
    if (shellTitleValue && shellTitle(text) === shellTitleValue) return true;
    return /<div id="root"|<div id="app"/i.test(text);
  }

  const exposed = [];
  const probed = [];
  for (const target of SENSITIVE_PATHS) {
    const response = await client.get(target.path, {
      origin: false,
      headers: { "x-forwarded-for": rotatingIp() },
    });
    probed.push({ path: target.path, status: response.status });

    if (response.status !== 200) continue;

    const text = response.text || "";

    // The SPA catch-all answering 200 is not an exposed file.
    if (isSpaFallback(text)) continue;

    if (target.signature.test(text)) {
      exposed.push({ path: target.path, status: response.status, sample: text.slice(0, 120) });
    }
  }

  if (exposed.length) {
    suite.fail(
      "ASE-EXPO-01",
      "Sensitive files and debug endpoints are not web reachable",
      "critical",
      exposed,
      "Remove the file from the web root, deny dotfiles at the server, and keep the private directories outside the document root.",
      ["WSTG-CONF-01", "WSTG-INFO-01"]
    );
  } else {
    suite.pass(
      "ASE-EXPO-01",
      "Sensitive files and debug endpoints are not web reachable",
      "info",
      probed
    );
  }

  // ── SPA catch-all behaviour ──────────────────────────────────────────────
  if (spaShell.status === 200 && /<!doctype html/i.test(spaShell.text || "")) {
    suite.warn(
      "ASE-EXPO-02",
      "Unknown routes fall back to the SPA shell",
      "low",
      { status: spaShell.status },
      "Expected for a single-page app. Confirm the fallback never serves API responses."
    );
  } else {
    suite.pass("ASE-EXPO-02", "Unknown routes fall back to the SPA shell", "info", spaShell.status);
  }

  // ── Error verbosity ──────────────────────────────────────────────────────
  const malformed = await client.post(
    "/api/orders",
    '{"customer_name": "broken"',
    {
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": rotatingIp(),
      },
    }
  );
  const malformedText = malformed.text || "";

  if (looksLikeError(malformedText)) {
    suite.fail(
      "ASE-EXPO-03",
      "Malformed JSON produces a generic error",
      "medium",
      malformedText.slice(0, 400),
      "Return a generic 400 message. Log the parse error server-side.",
      ["WSTG-ERRH-01", "CWE-209"]
    );
  } else {
    suite.pass(
      "ASE-EXPO-03",
      "Malformed JSON produces a generic error",
      "info",
      { status: malformed.status, body: malformedText.slice(0, 160) }
    );
  }

  const badLimit = await client.get("/api/products?limit=abc&page=xyz", {
    origin: false,
    headers: { "x-forwarded-for": rotatingIp() },
  });
  if (looksLikeError(badLimit.text || "")) {
    suite.fail(
      "ASE-EXPO-04",
      "Invalid query parameters produce a generic error",
      "medium",
      (badLimit.text || "").slice(0, 400),
      "Coerce and validate query parameters before using them.",
      ["WSTG-ERRH-01", "CWE-209"]
    );
  } else {
    suite.pass(
      "ASE-EXPO-04",
      "Invalid query parameters produce a generic error",
      "info",
      badLimit.status
    );
  }

  // ── Blind SQL injection timing ───────────────────────────────────────────
  const baseline = await client.get("/api/products?search=zzsecuritybaseline", {
    origin: false,
    headers: { "x-forwarded-for": rotatingIp() },
  });
  const sleepPayload = encodeURIComponent("' OR SLEEP(3)-- ");
  const injected = await client.get(`/api/products?search=${sleepPayload}`, {
    origin: false,
    headers: { "x-forwarded-for": rotatingIp() },
  });

  const delta = (injected.ms || 0) - (baseline.ms || 0);
  if (delta > 2500) {
    suite.fail(
      "ASE-EXPO-05",
      "Search input does not trigger time-based SQL injection",
      "critical",
      {
        baselineMs: baseline.ms,
        injectedMs: injected.ms,
        deltaMs: delta,
        payload: "search=' OR SLEEP(3)--",
      },
      "Use parameterised queries only. Never concatenate request values into SQL.",
      ["WSTG-INPV-05", "CWE-89"]
    );
  } else {
    suite.pass(
      "ASE-EXPO-05",
      "Search input does not trigger time-based SQL injection",
      "info",
      { baselineMs: baseline.ms, injectedMs: injected.ms, deltaMs: delta }
    );
  }

  // ── Prototype pollution ──────────────────────────────────────────────────
  // Computed key: a literal `__proto__:` would set the prototype instead of
  // creating an own property, and JSON.stringify would drop it entirely.
  const ppBody = {
    username: "security-probe",
    password: ["wrong", "not-a-real", "password"].join("-"),
    ["__proto__"]: { role: "admin", isAdmin: true },
  };
  const ppLogin = await client.post("/api/auth/login", ppBody, {
    headers: { "x-forwarded-for": rotatingIp() },
  });
  const ppText = ppLogin.text || "";

  if (ppLogin.status === 500 || looksLikeError(ppText) || /"role"\s*:\s*"admin"/i.test(ppText)) {
    suite.fail(
      "ASE-EXPO-06",
      "Prototype pollution in the JSON body is inert",
      "high",
      { status: ppLogin.status, body: ppText.slice(0, 300) },
      "Strip unknown keys before use and never merge request bodies into shared objects.",
      ["WSTG-INPV-08", "CWE-1321"]
    );
  } else {
    suite.pass(
      "ASE-EXPO-06",
      "Prototype pollution in the JSON body is inert",
      "info",
      { status: ppLogin.status }
    );
  }

  const ppQuery = await client.get(
    "/api/products?__proto__[polluted]=yes&constructor[prototype][polluted]=yes",
    { origin: false, headers: { "x-forwarded-for": rotatingIp() } }
  );
  if (/polluted/i.test(ppQuery.text || "")) {
    suite.fail(
      "ASE-EXPO-07",
      "Prototype pollution in the query string is inert",
      "high",
      { status: ppQuery.status },
      "Do not merge parsed query objects into shared state.",
      ["WSTG-INPV-08", "CWE-1321"]
    );
  } else {
    suite.pass(
      "ASE-EXPO-07",
      "Prototype pollution in the query string is inert",
      "info",
      { status: ppQuery.status }
    );
  }

  // ── HTTP method handling ─────────────────────────────────────────────────
  const trace = await rawTrace(`${config.target.replace(/\/+$/, "")}/`, config.timeoutMs);
  if (trace.status === 0) {
    suite.skip(
      "ASE-EXPO-08",
      "TRACE is not enabled",
      "medium",
      `The TRACE probe could not be sent: ${trace.error || "no response"}`
    );
  } else if (trace.status >= 200 && trace.status < 300) {
    // A 2xx is only a problem when the server echoes the request back.
    const echoes = /trace/i.test(trace.body || "");
    if (echoes) {
      suite.fail(
        "ASE-EXPO-08",
        "TRACE is not enabled",
        "medium",
        { status: trace.status, body: (trace.body || "").slice(0, 200) },
        "Disable TRACE at the web server.",
        ["WSTG-CONF-04"]
      );
    } else {
      suite.warn(
        "ASE-EXPO-08",
        "TRACE is not enabled",
        "low",
        { status: trace.status, note: "The server answered TRACE with a 2xx but did not echo the request." },
        "Return 405 for TRACE so intermediaries and clients cannot rely on it."
      );
    }
  } else {
    suite.pass("ASE-EXPO-08", "TRACE is not enabled", "info", trace.status);
  }

  // The Origin header must be sent: the app's CSRF guard rejects non-GET
  // requests without a matching Origin with a 403, which would otherwise be
  // mistaken for a method rejection.
  const putHealth = await client.request("PUT", "/api/health", {
    headers: { "x-forwarded-for": rotatingIp() },
  });
  const putBody = putHealth.text || "";

  if (/CSRF protection/i.test(putBody)) {
    suite.skip(
      "ASE-EXPO-09",
      "Read-only endpoints reject write methods",
      "medium",
      "The request was blocked by the CSRF guard before it reached the route, so the method handling could not be observed."
    );
  } else if ([404, 405, 501, 403].includes(putHealth.status)) {
    suite.pass(
      "ASE-EXPO-09",
      "Read-only endpoints reject write methods",
      "info",
      { status: putHealth.status }
    );
  } else {
    suite.fail(
      "ASE-EXPO-09",
      "Read-only endpoints reject write methods",
      "medium",
      { status: putHealth.status, body: putBody.slice(0, 200) },
      "Only expose the methods each route actually implements.",
      ["WSTG-CONF-04"]
    );
  }

  // ── Host header handling ─────────────────────────────────────────────────
  const evilHost = "evil.example";
  const hostProbe = await client.get("/", {
    origin: false,
    headers: { Host: evilHost, "x-forwarded-for": rotatingIp() },
  });
  const hostText = `${hostProbe.text || ""} ${header(hostProbe, "location") || ""}`;
  if (hostText.includes(evilHost)) {
    suite.fail(
      "ASE-EXPO-10",
      "Host header is not reflected into responses",
      "medium",
      { status: hostProbe.status },
      "Build absolute URLs from an allow-listed host, never from the Host header.",
      ["WSTG-CONF-01", "CWE-644"]
    );
  } else {
    suite.pass("ASE-EXPO-10", "Host header is not reflected into responses", "info");
  }

  const forwardedHost = await client.get("/api/health", {
    origin: false,
    headers: { "X-Forwarded-Host": evilHost, "x-forwarded-for": rotatingIp() },
  });
  if ((forwardedHost.text || "").includes(evilHost)) {
    suite.fail(
      "ASE-EXPO-11",
      "X-Forwarded-Host is not reflected into responses",
      "medium",
      { status: forwardedHost.status },
      "Ignore X-Forwarded-Host unless the proxy is trusted and allow-listed.",
      ["CWE-644"]
    );
  } else {
    suite.pass("ASE-EXPO-11", "X-Forwarded-Host is not reflected into responses", "info");
  }

  // ── Legacy API aliases ───────────────────────────────────────────────────
  const legacy = await client.get("/api/health", { origin: false });
  const versioned = await client.get("/api/v1/health", { origin: false });
  suite.add({
    id: "ASE-EXPO-12",
    title: "Legacy /api and versioned /api/v1 are both mounted",
    severity: "info",
    status: "pass",
    evidence: {
      legacy: legacy.status,
      versioned: versioned.status,
      note: "Keep both aliases only while clients still use them; remove /api when v1 migration completes.",
    },
  });

  // ── Oversized input ──────────────────────────────────────────────────────
  const longValue = "A".repeat(5000);
  const longParam = await client.get(`/api/products?search=${longValue}`, {
    origin: false,
    headers: { "x-forwarded-for": rotatingIp() },
  });
  if (longParam.status < 500) {
    suite.pass("ASE-EXPO-13", "Oversized query parameters are handled", "info", longParam.status);
  } else {
    suite.fail(
      "ASE-EXPO-13",
      "Oversized query parameters are handled",
      "low",
      { status: longParam.status },
      "Truncate or reject oversized parameters before querying."
    );
  }

  suite.finish(config);
}

main().catch((error) => {
  if (error instanceof UsageError || error instanceof SafetyError) {
    console.error(`\n[security] ${error.message}\n`);
    process.exit(error.exitCode || 2);
  }
  console.error("\n[security] exposure probes failed:", error);
  process.exit(1);
});
