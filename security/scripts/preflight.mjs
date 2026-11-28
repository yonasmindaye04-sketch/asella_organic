#!/usr/bin/env node
/**
 * security/scripts/preflight.mjs
 *
 * Verifies that a security run is safe and technically possible before any
 * scanner or probe starts.
 *
 * Usage:
 *   node security/scripts/preflight.mjs --target https://staging.example.com
 *   node security/scripts/preflight.mjs --target https://staging.example.com --active
 */

import {
  loadConfig,
  assertActiveAllowed,
  configuredRoles,
  isProductionHost,
  writesAllowed,
  UsageError,
  SafetyError,
} from "./lib/config.mjs";
import { createHttpClient, header } from "./lib/http.mjs";
import { inspectTls } from "./lib/tls.mjs";
import { createSuite } from "./lib/report.mjs";

async function main() {
  const config = loadConfig({ requireTarget: true });
  const suite = createSuite({
    id: "preflight",
    name: "Preflight and safety checks",
    mode: config.mode,
    target: config.target,
    description: "Target classification, connectivity, and test prerequisites",
  });

  suite.pass(
    "ASE-PRE-01",
    "Target is a valid http(s) URL",
    "info",
    config.target
  );

  suite.pass(
    "ASE-PRE-02",
    "Target classified",
    "info",
    {
      hostname: config.targetUrl.hostname,
      production: config.isProduction,
      mode: config.mode,
      writes: writesAllowed(config) ? "enabled" : "disabled",
    }
  );

  if (config.isProduction && config.mode === "active") {
    suite.fail(
      "ASE-PRE-03",
      "Active testing refused against production",
      "critical",
      `${config.targetUrl.hostname} is a production host. Active scans must run on staging.`,
      "Point SECURITY_TARGET at a staging clone. Production is passive-only."
    );
  } else if (config.mode === "active") {
    try {
      assertActiveAllowed(config);
      suite.pass(
        "ASE-PRE-03",
        "Active testing is permitted for this target",
        "info",
        "Target is non-production."
      );
    } catch (error) {
      suite.fail(
        "ASE-PRE-03",
        "Active testing guard rejected the run",
        "critical",
        error.message
      );
    }
  } else {
    suite.skip(
      "ASE-PRE-03",
      "Active testing guard",
      "info",
      "Passive mode. No active requests will be sent."
    );
  }

  if (config.targetUrl.protocol !== "https:") {
    const local =
      config.targetUrl.hostname === "localhost" ||
      config.targetUrl.hostname === "127.0.0.1" ||
      config.targetUrl.hostname === "::1";
    suite.add({
      id: "ASE-PRE-04",
      title: "Target uses HTTPS",
      severity: local ? "info" : "high",
      status: local ? "pass" : "warn",
      evidence: local
        ? "Plain HTTP is acceptable for a local test instance."
        : `Target is ${config.targetUrl.protocol}// — traffic and cookies are unencrypted.`,
      remediation: local
        ? null
        : "Use an HTTPS staging URL. If TLS terminates at a proxy, target the proxy.",
    });
  } else {
    suite.pass("ASE-PRE-04", "Target uses HTTPS", "info");
  }

  const client = createHttpClient(config);
  const apiClient = config.apiTarget
    ? createHttpClient({ ...config, target: config.apiTarget })
    : client;

  const health = await apiClient.get("/api/health", { origin: false });
  if (health.error) {
    suite.fail(
      "ASE-PRE-05",
      "API health endpoint reachable",
      "critical",
      health.error,
      "Confirm the target is running, DNS resolves, and the network allows access."
    );
  } else if (health.status === 200 || health.status === 503) {
    const body = health.json || {};
    suite.add({
      id: "ASE-PRE-05",
      title: "API health endpoint reachable",
      severity: "info",
      status: health.status === 200 ? "pass" : "warn",
      evidence: {
        status: health.status,
        db: body.db,
        telegram: body.telegram,
        ms: health.ms,
      },
      remediation:
        health.status === 503
          ? "The service reports an unhealthy dependency. Fix db/telegram before interpreting other results."
          : null,
    });
  } else {
    suite.warn(
      "ASE-PRE-05",
      "API health endpoint reachable",
      "medium",
      `Unexpected status ${health.status} from /api/health`,
      "Verify the API is mounted at /api and the deployment is complete."
    );
  }

  const v1 = await apiClient.get("/api/v1/health", { origin: false });
  if (v1.status === 200 || v1.status === 503) {
    suite.pass(
      "ASE-PRE-06",
      "Versioned API health endpoint reachable",
      "info",
      { status: v1.status, api: v1.json?.api ?? null }
    );
  } else {
    suite.warn(
      "ASE-PRE-06",
      "Versioned API health endpoint reachable",
      "low",
      `GET /api/v1/health returned ${v1.status || v1.error}`,
      "Confirm the /api/v1 alias is mounted."
    );
  }

  if (config.targetUrl.protocol === "https:") {
    const tlsResult = await inspectTls(config.targetUrl.hostname, {
      timeoutMs: config.timeoutMs,
    });
    if (!tlsResult.ok) {
      suite.fail(
        "ASE-PRE-07",
        "TLS handshake succeeds",
        "high",
        tlsResult.error,
        "Check the certificate chain and TLS configuration at the edge."
      );
    } else {
      suite.add({
        id: "ASE-PRE-07",
        title: "TLS handshake succeeds",
        severity: "info",
        status: tlsResult.authorized ? "pass" : "warn",
        evidence: {
          protocol: tlsResult.protocol,
          cipher: tlsResult.cipher?.name,
          authorized: tlsResult.authorized,
          authorizationError: tlsResult.authorizationError,
          identityError: tlsResult.identityError,
          expires: tlsResult.certificate?.validTo,
          daysRemaining: tlsResult.certificate?.daysRemaining,
        },
        remediation: tlsResult.authorized
          ? null
          : "The certificate did not validate. Confirm the chain and hostname.",
      });
    }
  } else {
    suite.skip("ASE-PRE-07", "TLS handshake", "info", "Target is not HTTPS.");
  }

  const roles = configuredRoles(config);
  if (roles.length === 0) {
    suite.warn(
      "ASE-PRE-08",
      "Role credentials configured",
      "medium",
      "No SECURITY_<ROLE>_USER / SECURITY_<ROLE>_PASS pairs found. Authorization tests will be skipped.",
      "Add test accounts for admin, manager, employee, store_manager, call_center, delivery, affiliate, vendor, and tech_support in security/.env."
    );
  } else {
    suite.pass(
      "ASE-PRE-08",
      "Role credentials configured",
      "info",
      `Configured roles: ${roles.join(", ")}`
    );
  }

  if (config.mode === "active" && !writesAllowed(config)) {
    suite.warn(
      "ASE-PRE-09",
      "Write-capable tests enabled",
      "info",
      "Active mode is on but --allow-writes is off. Order, upload, and race tests will be skipped.",
      "Add --allow-writes on a disposable staging database when you want full business-logic coverage."
    );
  } else {
    suite.pass(
      "ASE-PRE-09",
      "Write-capable tests",
      "info",
      writesAllowed(config)
        ? "Enabled. Test records will be created on the target."
        : "Passive mode — no writes."
    );
  }

  try {
    const fs = await import("node:fs");
    fs.mkdirSync(config.reportDir, { recursive: true });
    const probe = `${config.reportDir}/.write-probe`;
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    suite.pass(
      "ASE-PRE-10",
      "Report directory is writable",
      "info",
      config.reportDir
    );
  } catch (error) {
    suite.fail(
      "ASE-PRE-10",
      "Report directory is writable",
      "medium",
      error.message,
      "Fix SECURITY_REPORT_DIR permissions or choose another --out directory."
    );
  }

  const serverHeader = header(health, "server");
  const poweredBy = header(health, "x-powered-by");
  if (serverHeader || poweredBy) {
    suite.warn(
      "ASE-PRE-11",
      "Origin technology disclosure",
      "low",
      { server: serverHeader, xPoweredBy: poweredBy },
      "Remove or normalise Server and X-Powered-By at the edge/origin.",
      ["WSTG-INFO-02"]
    );
  } else {
    suite.pass(
      "ASE-PRE-11",
      "Origin technology disclosure",
      "info",
      "No Server or X-Powered-By header on /api/health."
    );
  }

  if (isProductionHost(config.targetUrl.hostname)) {
    suite.add({
      id: "ASE-PRE-12",
      title: "Production target: passive checks only",
      severity: "info",
      status: "pass",
      evidence:
        "This run may inspect headers, TLS, and public metadata, but must not send credentials or mutate state.",
    });
  } else {
    suite.pass(
      "ASE-PRE-12",
      "Non-production target",
      "info",
      "Active and write-capable tests are available with the appropriate flags."
    );
  }

  const summary = suite.finish(config);
  if (summary.failuresBySeverity.critical > 0) process.exitCode = 2;
}

main().catch((error) => {
  if (error instanceof UsageError || error instanceof SafetyError) {
    console.error(`\n[security] ${error.message}\n`);
    process.exit(error.exitCode || 2);
  }
  console.error("\n[security] preflight failed:", error);
  process.exit(1);
});
