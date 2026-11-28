#!/usr/bin/env node
/**
 * security/scripts/run-all.mjs
 *
 * Orchestrates the security program for one target.
 *
 *   node security/scripts/run-all.mjs --target https://staging.example.com --active
 *   node security/scripts/run-all.mjs --target https://www.asellaorganic.com        (passive only)
 *
 * Options:
 *   --target <url>       Target base URL (or set SECURITY_TARGET)
 *   --active             Enable active testing (refused on production hosts)
 *   --allow-writes       Enable tests that create orders, uploads, and races
 *   --only <list>        Comma-separated suite ids to run
 *   --skip <list>        Comma-separated suite ids to skip
 *   --static             Also run the static/dependency/secret analysis
 *   --fail-on <level>    critical | high | medium | low | info
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  loadConfig,
  isProductionHost,
  SECURITY_ROOT,
} from "./lib/config.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const SUITES = [
  { id: "preflight", script: "preflight.mjs", active: false, always: true },
  { id: "passive", script: "passive-headers.mjs", active: false, always: true },
  { id: "auth", script: "auth-matrix.mjs", active: true },
  { id: "jwt", script: "jwt-probes.mjs", active: true },
  { id: "telegram", script: "telegram-initdata.mjs", active: true },
  { id: "orders", script: "order-logic.mjs", active: true },
  { id: "uploads", script: "upload-probes.mjs", active: true },
  { id: "exposure", script: "exposure-probes.mjs", active: true },
  { id: "static", script: "static-scan.mjs", active: false },
];

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function main() {
  const config = loadConfig({ requireTarget: true });
  const only = parseList(config.args.only);
  const skip = parseList(config.args.skip);
  const wantStatic = config.args.static === true || config.args.static === "true";

  let selected = SUITES.filter((suite) => {
    if (only.length) return only.includes(suite.id);
    if (skip.includes(suite.id)) return false;
    if (suite.id === "static") return wantStatic;
    if (suite.active && config.mode !== "active") return false;
    return true;
  });

  if (config.mode !== "active") {
    selected = selected.filter((suite) => !suite.active);
  }

  if (isProductionHost(new URL(config.target).hostname) && config.mode === "active") {
    console.error(
      "\n[security] Refusing to run active tests against a production host.\n" +
        "           Production is passive-only. Point --target at staging.\n"
    );
    process.exit(3);
  }

  console.log("");
  console.log("╔════════════════════════════════════════════════════════════════════╗");
  console.log("║  Asella Organic — Security Program                                ║");
  console.log("╚════════════════════════════════════════════════════════════════════╝");
  console.log(` Target   : ${config.target}`);
  console.log(` Mode     : ${config.mode}`);
  console.log(` Writes   : ${config.allowWrites ? "ENABLED" : "disabled"}`);
  console.log(` Suites   : ${selected.map((s) => s.id).join(", ")}`);
  console.log(` Reports  : ${config.reportDir}`);
  console.log("");

  const results = [];

  for (const suite of selected) {
    const scriptPath = path.join(HERE, suite.script);
    const args = [scriptPath];

    if (suite.id !== "static") {
      args.push("--target", config.target);
      args.push("--fail-on", config.failOn);
      if (config.apiTarget) args.push("--api-target", config.apiTarget);
      if (config.args.out) args.push("--out", config.args.out);
      if (config.args.rps) args.push("--rps", String(config.args.rps));
      if (config.args.timeout) args.push("--timeout", String(config.args.timeout));
      if (config.mode === "active") args.push("--active");
      if (config.allowWrites) args.push("--allow-writes");
    } else {
      args.push("--fail-on", config.failOn);
    }

    console.log(`── ${suite.id} ${"─".repeat(Math.max(0, 60 - suite.id.length))}`);

    const child = spawnSync(process.execPath, args, {
      stdio: "inherit",
      cwd: SECURITY_ROOT,
      env: process.env,
    });

    const exitCode = child.status ?? 1;

    if (suite.id === "preflight" && exitCode !== 0) {
      console.error("\n[security] Preflight failed. Stopping the run.\n");
      process.exit(exitCode);
    }

    results.push({ id: suite.id, exitCode });
  }

  // ── Combined summary ─────────────────────────────────────────────────────
  const summaryRows = [];
  let totalChecks = 0;
  let totalPass = 0;
  let totalFail = 0;
  let totalWarn = 0;
  let totalSkip = 0;
  let highest = null;

  const order = { info: 1, low: 2, medium: 3, high: 4, critical: 5 };

  for (const suite of selected) {
    const slug =
      suite.id === "preflight"
        ? "preflight"
        : suite.id === "passive"
          ? "passive-headers"
          : suite.id === "auth"
            ? "auth-matrix"
            : suite.id === "jwt"
              ? "jwt-probes"
              : suite.id === "telegram"
                ? "telegram-initdata"
                : suite.id === "orders"
                  ? "order-logic"
                  : suite.id === "uploads"
                    ? "upload-probes"
                    : suite.id === "exposure"
                      ? "exposure-probes"
                      : "static-scan";

    const reportPath = path.join(config.reportDir, `latest-${slug}.json`);
    if (!fs.existsSync(reportPath)) {
      summaryRows.push({ suite: suite.id, checks: "-", pass: "-", fail: "-", warn: "-", skip: "-", status: "no report" });
      continue;
    }

    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const counts = report.summary?.counts || {};
    const suiteTotal = report.summary?.total ?? 0;
    totalChecks += suiteTotal;
    totalPass += counts.pass || 0;
    totalFail += counts.fail || 0;
    totalWarn += counts.warn || 0;
    totalSkip += counts.skip || 0;

    for (const [severity, count] of Object.entries(report.summary?.failuresBySeverity || {})) {
      if (count > 0 && (!highest || order[severity] > order[highest])) highest = severity;
    }

    summaryRows.push({
      suite: suite.id,
      checks: suiteTotal,
      pass: counts.pass || 0,
      fail: counts.fail || 0,
      warn: counts.warn || 0,
      skip: counts.skip || 0,
      status: suite.id === "static" ? (results.find((r) => r.id === suite.id)?.exitCode === 0 ? "pass" : "fail") : "done",
    });
  }

  console.log("");
  console.log("SUMMARY");
  console.log("─".repeat(60));
  console.log(
    `${"suite".padEnd(12)} ${"checks".padStart(7)} ${"pass".padStart(6)} ${"fail".padStart(6)} ${"warn".padStart(6)} ${"skip".padStart(6)}`
  );
  for (const row of summaryRows) {
    console.log(
      `${row.suite.padEnd(12)} ${String(row.checks).padStart(7)} ${String(row.pass).padStart(6)} ${String(row.fail).padStart(6)} ${String(row.warn).padStart(6)} ${String(row.skip).padStart(6)}`
    );
  }
  console.log("─".repeat(60));
  console.log(
    `${"ALL".padEnd(12)} ${String(totalChecks).padStart(7)} ${String(totalPass).padStart(6)} ${String(totalFail).padStart(6)} ${String(totalWarn).padStart(6)} ${String(totalSkip).padStart(6)}`
  );
  if (highest) console.log(`Highest failed severity: ${highest}`);
  console.log(`Reports: ${config.reportDir}`);
  console.log("");

  const anyFailed = results.some((r) => r.exitCode !== 0);
  process.exit(anyFailed ? 1 : 0);
}

try {
  main();
} catch (error) {
  console.error("\n[security] run failed:", error.message);
  process.exit(2);
}
