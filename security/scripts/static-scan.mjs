#!/usr/bin/env node
/**
 * security/scripts/static-scan.mjs
 *
 * Supply-chain and static analysis runner. No target required — this works on
 * the source tree.
 *
 * Runs, when the tool is installed:
 *   - npm audit (production and full) for backend and frontend
 *   - gitleaks for secrets in the working tree and git history
 *   - semgrep with the project ruleset plus p/security-audit
 *   - trivy filesystem scan for vulnerabilities, secrets, and IaC misconfig
 *
 * Always runs (no external tools needed):
 *   - focused source checks for the issues this codebase has already surfaced
 *
 * Usage:
 *   node security/scripts/static-scan.mjs
 *   node security/scripts/static-scan.mjs --fail-on medium
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadConfig, REPO_ROOT, SECURITY_ROOT } from "./lib/config.mjs";
import { createSuite } from "./lib/report.mjs";

const IS_WINDOWS = process.platform === "win32";

/**
 * npm cannot be spawned directly on Windows: the entry point is a .cmd shim,
 * and Node refuses to run .cmd files without a shell. Running npm's own
 * JavaScript entry point through the current node binary avoids that and
 * removes the shell-quoting hazard entirely.
 */
function resolveNpmInvocation() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(path.dirname(process.execPath), "..", "node_modules", "npm", "bin", "npm-cli.js"),
    "/usr/local/lib/node_modules/npm/bin/npm-cli.js",
    "/usr/lib/node_modules/npm/bin/npm-cli.js",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { command: process.execPath, prefixArgs: [candidate] };
    }
  }

  // Last resort: the shell shim. Only used for `--version`.
  return { command: IS_WINDOWS ? "npm.cmd" : "npm", prefixArgs: [], shell: true };
}

const NPM = resolveNpmInvocation();

function run(command, args, options = {}) {
  try {
    const isNpm = command === "npm";
    return spawnSync(
      isNpm ? NPM.command : command,
      isNpm ? [...NPM.prefixArgs, ...args] : args,
      {
        cwd: options.cwd || REPO_ROOT,
        encoding: "utf8",
        shell: isNpm ? Boolean(NPM.shell) : false,
        maxBuffer: 32 * 1024 * 1024,
        timeout: options.timeout || 300_000,
        env: { ...process.env, ...(options.env || {}) },
      }
    );
  } catch (error) {
    return { status: -1, stdout: "", stderr: error.message };
  }
}

function toolVersion(command) {
  const result = run(command, ["--version"], { timeout: 20_000 });
  if (result.status !== 0) return null;
  return `${result.stdout || result.stderr}`.trim().split(/\r?\n/)[0];
}

function readSource(relativePath) {
  const file = path.join(REPO_ROOT, relativePath);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8");
}

/** Deterministic checks for patterns this codebase has already surfaced. */
function sourceChecks(suite) {
  const checks = [
    {
      id: "ASE-SC-01",
      title: "No blanket role bypass in the authorization guard",
      severity: "critical",
      files: ["backend/src/middleware/auth.ts"],
      pattern:
        /req\.user\.role\s*===?\s*["']tech_support["']\s*\)\s*\{[\s\S]{0,160}?next\(\)/,
      remediation:
        "Remove the unconditional tech_support bypass. List the role explicitly on each route that needs it.",
    },
    {
      id: "ASE-SC-02",
      title: "JWT secret has no built-in default",
      severity: "critical",
      files: ["backend/src/config/env.ts"],
      pattern: /JWT_SECRET\s*:\s*z\.string\([^)]*\)[^;]*\.default\(/,
      remediation:
        "Remove the default and refuse to start when JWT_SECRET is unset. Rotate any environment that relied on it.",
    },
    {
      id: "ASE-SC-03",
      title: "Rate limiting does not key on a client-supplied header",
      severity: "medium",
      files: ["backend/src/middleware/rateLimit.ts"],
      pattern: /headers\[["']x-forwarded-for["']\]/i,
      remediation:
        "Use req.ip with a correctly configured trust proxy, or strip the client header at the edge.",
    },
    {
      id: "ASE-SC-04",
      title: "Order unit price is not accepted from the client",
      severity: "critical",
      files: ["backend/src/schemas/index.ts", "backend/src/lib/orderItems.ts"],
      pattern: /unit_price\s*:\s*z\.coerce\.number\(\)\.min\(\s*0\b/,
      remediation:
        "Remove unit_price from the request schema and resolve the price from the catalog inside the transaction.",
    },
    {
      id: "ASE-SC-05",
      title: "Raw database error messages are not returned to clients",
      severity: "medium",
      files: ["backend/src/routes/telegram.ts"],
      pattern:
        /res\.status\(500\)\.json\(\{\s*success:\s*false,\s*error:\s*(err|error)\.message/,
      remediation: "Return a generic message and log the detail server-side.",
    },
    {
      id: "ASE-SC-06",
      title: "CORS does not trust tunnel hostnames",
      severity: "medium",
      files: ["backend/src/lib/origins.ts", "backend/src/app.ts", "backend/src/config/env.ts"],
      pattern: /trycloudflare|ngrok-free|ngrok/i,
      remediation:
        "Remove wildcard tunnel origins. Add exact staging origins to ALLOWED_ORIGINS instead.",
    },
    {
      id: "ASE-SC-07",
      title: "Idempotency keys are scoped to a principal",
      severity: "medium",
      result: "warn",
      files: ["backend/src/middleware/idempotency.ts"],
      pattern: /user_id[^;]{0,80}IS NULL/i,
      remediation:
        "Scope idempotency keys to the authenticated user, or to a client-generated nonce for anonymous routes.",
    },
  ];

  for (const check of checks) {
    const hits = [];
    for (const relativePath of check.files) {
      const source = readSource(relativePath);
      if (!source) continue;

      // Patterns span lines, so they are matched against the whole file and
      // then mapped back to a line number.
      const flags = check.pattern.flags.includes("g")
        ? check.pattern.flags
        : `${check.pattern.flags}g`;
      const regex = new RegExp(check.pattern.source, flags);
      const lines = source.split(/\r?\n/);

      let match;
      while ((match = regex.exec(source)) !== null) {
        if (match[0].length === 0) {
          regex.lastIndex += 1;
          continue;
        }
        const lineNumber = source.slice(0, match.index).split(/\r?\n/).length;
        hits.push({
          file: relativePath,
          line: lineNumber,
          text: (lines[lineNumber - 1] || "").trim().slice(0, 160),
        });
        if (hits.length >= 12) break;
      }
    }

    if (hits.length && check.result === "warn") {
      suite.warn(
        check.id,
        check.title,
        check.severity,
        hits,
        check.remediation,
        ["SECURITY_REVIEW.md"]
      );
    } else if (hits.length) {
      suite.fail(
        check.id,
        check.title,
        check.severity,
        hits,
        check.remediation,
        ["SECURITY_REVIEW.md"]
      );
    } else {
      suite.pass(check.id, check.title, "info");
    }
  }
}

function auditWorkspace(suite, workspace, id) {
  const cwd = workspace === "root" ? REPO_ROOT : path.join(REPO_ROOT, workspace);
  if (!fs.existsSync(path.join(cwd, "package.json"))) {
    suite.skip(id, `npm audit (${workspace})`, "high", "No package.json found.");
    return;
  }

  const result = run("npm", ["audit", "--omit=dev", "--json"], { cwd, timeout: 180_000 });
  if (!result.stdout || result.stdout.trim() === "") {
    suite.warn(
      id,
      `npm audit (${workspace})`,
      "medium",
      result.stderr?.slice(0, 300) || "npm audit produced no output (offline?)",
      "Run npm audit with network access."
    );
    return;
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    suite.warn(id, `npm audit (${workspace})`, "medium", "Could not parse npm audit output.");
    return;
  }

  const metadata = report.metadata?.vulnerabilities || {};
  const high = metadata.high || 0;
  const critical = metadata.critical || 0;

  const details = [];
  for (const [name, item] of Object.entries(report.vulnerabilities || {})) {
    if (!["high", "critical"].includes(item.severity)) continue;
    details.push({
      package: name,
      severity: item.severity,
      direct: item.isDirect,
      via: (item.via || []).map((v) =>
        typeof v === "string" ? v : `${v.title} (${v.range})`
      ),
      fixAvailable: item.fixAvailable,
    });
  }

  if (critical > 0 || high > 0) {
    suite.fail(
      id,
      `npm audit (${workspace}) has no high or critical vulnerabilities`,
      critical > 0 ? "critical" : "high",
      { counts: metadata, details },
      "Upgrade the affected packages. Prefer an explicit version over a caret range.",
      ["WSTG-IDT-01"]
    );
  } else {
    suite.pass(id, `npm audit (${workspace}) has no high or critical vulnerabilities`, "info", metadata);
  }
}

function gitleaks(suite) {
  const version = toolVersion("gitleaks");
  if (!version) {
    suite.skip(
      "ASE-SC-10",
      "gitleaks finds no secrets",
      "critical",
      "gitleaks is not installed. Install it: https://github.com/gitleaks/gitleaks"
    );
    return;
  }

  const reportPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "asella-sec-")),
    "gitleaks.json"
  );

  const result = run(
    "gitleaks",
    [
      "detect",
      "--source",
      REPO_ROOT,
      "--config",
      path.join(SECURITY_ROOT, "scanners", "gitleaks.toml"),
      "--report-format",
      "json",
      "--report-path",
      reportPath,
      "--redact",
      "--no-banner",
    ],
    { timeout: 300_000 }
  );

  let findings = [];
  if (fs.existsSync(reportPath)) {
    try {
      findings = JSON.parse(fs.readFileSync(reportPath, "utf8")) || [];
    } catch {
      findings = [];
    }
  }

  if (findings.length) {
    suite.fail(
      "ASE-SC-10",
      "gitleaks finds no secrets",
      "critical",
      findings.map((f) => ({
        rule: f.RuleID,
        file: f.File,
        line: f.StartLine,
        commit: f.Commit,
      })),
      "Revoke and rotate every exposed credential, then remove it from the tree and the git history.",
      ["WSTG-CRYP-02"]
    );
  } else {
    suite.pass("ASE-SC-10", "gitleaks finds no secrets", "info", version);
  }
}

function semgrep(suite) {
  const version = toolVersion("semgrep");
  if (!version) {
    suite.skip(
      "ASE-SC-11",
      "semgrep finds no insecure patterns",
      "high",
      "semgrep is not installed. Install it: pip install semgrep"
    );
    return;
  }

  const reportPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "asella-sec-")),
    "semgrep.json"
  );

  const result = run(
    "semgrep",
    [
      "--config",
      path.join(SECURITY_ROOT, "scanners", "semgrep", "asella.yml"),
      "--config",
      "p/security-audit",
      "--json",
      "--output",
      reportPath,
      "--quiet",
      path.join(REPO_ROOT, "backend", "src"),
    ],
    { timeout: 600_000 }
  );

  if (!fs.existsSync(reportPath)) {
    suite.warn(
      "ASE-SC-11",
      "semgrep finds no insecure patterns",
      "medium",
      result.stderr?.slice(0, 400) || "semgrep produced no report",
      "The p/security-audit ruleset needs network access the first time it runs."
    );
    return;
  }

  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch {
    suite.warn("ASE-SC-11", "semgrep finds no insecure patterns", "medium", "Could not parse semgrep output.");
    return;
  }

  const results = report.results || [];
  const highSeverity = results.filter((r) =>
    ["ERROR", "WARNING"].includes(r.extra?.severity)
  );

  if (highSeverity.length) {
    suite.fail(
      "ASE-SC-11",
      "semgrep finds no insecure patterns",
      "medium",
      highSeverity.slice(0, 25).map((r) => ({
        rule: r.check_id,
        file: r.path,
        line: r.start?.line,
        message: r.extra?.message,
      })),
      "Review each match. Fix confirmed issues and add nosemgrep with a reason where the finding is a false positive.",
      ["WSTG-CODE-01"]
    );
  } else {
    suite.pass("ASE-SC-11", "semgrep finds no insecure patterns", "info", {
      version,
      findings: results.length,
    });
  }
}

function trivy(suite) {
  const version = toolVersion("trivy");
  if (!version) {
    suite.skip(
      "ASE-SC-12",
      "trivy finds no known vulnerable or misconfigured components",
      "medium",
      "trivy is not installed. Install it: https://aquasecurity.github.io/trivy/"
    );
    return;
  }

  const reportPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "asella-sec-")),
    "trivy.json"
  );

  const result = run(
    "trivy",
    [
      "fs",
      "--scanners",
      "vuln,secret,misconfig",
      "--severity",
      "HIGH,CRITICAL",
      "--format",
      "json",
      "--output",
      reportPath,
      "--skip-dirs",
      "node_modules,dist,coverage,playwright-report,security/reports",
      REPO_ROOT,
    ],
    { timeout: 600_000 }
  );

  if (!fs.existsSync(reportPath)) {
    suite.warn(
      "ASE-SC-12",
      "trivy finds no known vulnerable or misconfigured components",
      "medium",
      result.stderr?.slice(0, 400) || "trivy produced no report",
      "The trivy database needs network access the first time it runs."
    );
    return;
  }

  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch {
    suite.warn("ASE-SC-12", "trivy finds no known vulnerable components", "medium", "Could not parse trivy output.");
    return;
  }

  const findings = [];
  for (const resultItem of report.Results || []) {
    for (const vulnerability of resultItem.Vulnerabilities || []) {
      if (!["HIGH", "CRITICAL"].includes(vulnerability.Severity)) continue;
      findings.push({
        target: resultItem.Target,
        id: vulnerability.VulnerabilityID,
        severity: vulnerability.Severity,
        fixed: vulnerability.FixedVersion || null,
      });
    }
    for (const secret of resultItem.Secrets || []) {
      findings.push({ target: resultItem.Target, id: secret.RuleID, severity: "HIGH" });
    }
    for (const misconfig of resultItem.Misconfigurations || []) {
      if (!["HIGH", "CRITICAL"].includes(misconfig.Severity)) continue;
      findings.push({ target: resultItem.Target, id: misconfig.ID, severity: misconfig.Severity });
    }
  }

  if (findings.length) {
    suite.fail(
      "ASE-SC-12",
      "trivy finds no known vulnerable or misconfigured components",
      "high",
      findings.slice(0, 30),
      "Upgrade or patch the affected components and fix the misconfigurations."
    );
  } else {
    suite.pass("ASE-SC-12", "trivy finds no known vulnerable or misconfigured components", "info", version);
  }
}

function main() {
  const config = loadConfig({ requireTarget: false });

  const suite = createSuite({
    id: "static-scan",
    name: "Static, dependency, and secret analysis",
    mode: "static",
    target: null,
    description: "Source tree analysis — no target required",
  });

  sourceChecks(suite);
  auditWorkspace(suite, "backend", "ASE-SC-08");
  auditWorkspace(suite, "frontend", "ASE-SC-09");
  gitleaks(suite);
  semgrep(suite);
  trivy(suite);

  suite.finish(config);
}

main();
