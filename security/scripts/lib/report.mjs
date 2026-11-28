/**
 * security/scripts/lib/report.mjs
 *
 * Result collection, console output, and JSON/Markdown report writing.
 * No dependencies.
 */

import fs from "node:fs";
import path from "node:path";
import { timestampSlug } from "./config.mjs";

export const SEVERITY_ORDER = {
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
};

const STATUS_ORDER = ["fail", "error", "warn", "pass", "skip"];
const STATUS_LABEL = {
  pass: "PASS",
  fail: "FAIL",
  warn: "WARN",
  skip: "SKIP",
  error: "ERROR",
};

const COLOR = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[36m",
  magenta: "\x1b[35m",
};

function supportsColor() {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

function paint(text, color) {
  if (!supportsColor()) return text;
  return `${color}${text}${COLOR.reset}`;
}

const STATUS_COLOR = {
  pass: COLOR.green,
  fail: COLOR.red,
  warn: COLOR.yellow,
  skip: COLOR.dim,
  error: COLOR.magenta,
};

export function redact(value) {
  if (value === null || value === undefined) return value;
  let text = typeof value === "string" ? value : safeStringify(value);

  text = text
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "eyJ…[jwt redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi, "Bearer [redacted]")
    .replace(/\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g, "[telegram-bot-token redacted]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[private-key redacted]");

  return text;
}

function safeStringify(value) {
  const seen = new WeakSet();
  return JSON.stringify(
    value,
    (_key, val) => {
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return "[Circular]";
        seen.add(val);
      }
      return val;
    },
    2
  );
}

function truncate(text, max = 1600) {
  const value = String(text ?? "");
  return value.length > max ? `${value.slice(0, max)}… [truncated]` : value;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "suite";
}

export function createSuite({ id, name, mode, target, description = "" }) {
  const checks = [];
  const startedAt = new Date();

  function add(check) {
    const severity = String(check.severity || "info").toLowerCase();
    const status = String(check.status || "info").toLowerCase();

    if (!(severity in SEVERITY_ORDER)) {
      throw new Error(`Invalid severity "${severity}" in check ${check.id}`);
    }
    if (!STATUS_LABEL[status]) {
      throw new Error(`Invalid status "${status}" in check ${check.id}`);
    }
    if (!check.id || !check.title) {
      throw new Error("Every check requires an id and title");
    }

    checks.push({
      id: check.id,
      title: check.title,
      severity,
      status,
      evidence: check.evidence ?? null,
      remediation: check.remediation ?? null,
      refs: check.refs ?? [],
      details: check.details ?? null,
    });
  }

  function pass(id, title, severity, evidence) {
    add({ id, title, severity, status: "pass", evidence });
  }

  function fail(id, title, severity, evidence, remediation, refs = []) {
    add({ id, title, severity, status: "fail", evidence, remediation, refs });
  }

  function warn(id, title, severity, evidence, remediation, refs = []) {
    add({ id, title, severity, status: "warn", evidence, remediation, refs });
  }

  function skip(id, title, severity, reason) {
    add({ id, title, severity, status: "skip", evidence: reason });
  }

  function summary() {
    const counts = { pass: 0, fail: 0, warn: 0, skip: 0, error: 0 };
    const failuresBySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const warningsBySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

    for (const check of checks) {
      counts[check.status] += 1;
      if (check.status === "fail" || check.status === "error") {
        failuresBySeverity[check.severity] += 1;
      }
      if (check.status === "warn") {
        warningsBySeverity[check.severity] += 1;
      }
    }

    return {
      total: checks.length,
      counts,
      failuresBySeverity,
      warningsBySeverity,
      highestFailure: highestSeverity(
        checks.filter((c) => c.status === "fail" || c.status === "error")
      ),
    };
  }

  function highestSeverity(items) {
    let highest = null;
    for (const item of items) {
      if (!highest || SEVERITY_ORDER[item.severity] > SEVERITY_ORDER[highest]) {
        highest = item.severity;
      }
    }
    return highest;
  }

  function printConsole() {
    const s = summary();
    const line = "─".repeat(72);

    console.log("");
    console.log(paint(line, COLOR.dim));
    console.log(paint(` ${name}`, COLOR.bold));
    if (target) console.log(` Target : ${target}`);
    console.log(` Mode   : ${mode}`);
    if (description) console.log(` Scope  : ${description}`);
    console.log(paint(line, COLOR.dim));

    const ordered = [...checks].sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
        SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
        a.id.localeCompare(b.id)
    );

    for (const check of ordered) {
      const label = paint(
        STATUS_LABEL[check.status].padEnd(5),
        STATUS_COLOR[check.status]
      );
      const severity =
        check.status === "pass" || check.status === "skip"
          ? ""
          : paint(` [${check.severity}]`, STATUS_COLOR[check.status]);

      console.log(`${label} ${check.id.padEnd(12)} ${check.title}${severity}`);

      if (check.status !== "pass" && check.evidence) {
        const evidence =
          typeof check.evidence === "string"
            ? check.evidence
            : safeStringify(check.evidence);
        console.log(paint(`       ${truncate(redact(evidence), 900).replace(/\n/g, "\n       ")}`, COLOR.dim));
      }
      if (check.status === "fail" && check.remediation) {
        console.log(`       fix: ${check.remediation}`);
      }
    }

    console.log(paint(line, COLOR.dim));
    const parts = [
      `${s.counts.pass} pass`,
      `${s.counts.fail} fail`,
      `${s.counts.warn} warn`,
      `${s.counts.skip} skip`,
    ];
    if (s.counts.error) parts.push(`${s.counts.error} error`);
    console.log(` ${s.total} checks: ${parts.join(", ")}`);

    const failureText = Object.entries(s.failuresBySeverity)
      .filter(([, count]) => count > 0)
      .map(([severity, count]) => `${count} ${severity}`)
      .join(", ");
    if (failureText) {
      console.log(paint(` Failures: ${failureText}`, COLOR.red));
    } else {
      console.log(paint(" No failed checks.", COLOR.green));
    }
    console.log("");
  }

  function markdown(s) {
    const lines = [];
    lines.push(`# ${name}`);
    lines.push("");
    lines.push(`- **Suite:** \`${id}\``);
    lines.push(`- **Target:** ${target || "n/a"}`);
    lines.push(`- **Mode:** ${mode}`);
    if (description) lines.push(`- **Scope:** ${description}`);
    lines.push(`- **Generated:** ${startedAt.toISOString()}`);
    lines.push("");
    lines.push("## Summary");
    lines.push("");
    lines.push("| Result | Count |");
    lines.push("|---|---:|");
    lines.push(`| Pass | ${s.counts.pass} |`);
    lines.push(`| Fail | ${s.counts.fail} |`);
    lines.push(`| Warn | ${s.counts.warn} |`);
    lines.push(`| Skip | ${s.counts.skip} |`);
    if (s.counts.error) lines.push(`| Error | ${s.counts.error} |`);
    lines.push(`| **Total** | **${s.total}** |`);
    lines.push("");

    const actionable = checks.filter(
      (c) => c.status === "fail" || c.status === "warn" || c.status === "error"
    );
    if (actionable.length) {
      lines.push("## Findings");
      lines.push("");
      for (const check of actionable.sort(
        (a, b) =>
          SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
          a.id.localeCompare(b.id)
      )) {
        lines.push(`### ${check.severity.toUpperCase()} — ${check.title}`);
        lines.push("");
        lines.push(`- **ID:** \`${check.id}\``);
        lines.push(`- **Status:** ${check.status}`);
        if (check.evidence) {
          const evidence =
            typeof check.evidence === "string"
              ? check.evidence
              : safeStringify(check.evidence);
          lines.push(`- **Evidence:**`);
          lines.push("");
          lines.push("```");
          lines.push(truncate(redact(evidence), 4000));
          lines.push("```");
        }
        if (check.remediation) {
          lines.push(`- **Remediation:** ${check.remediation}`);
        }
        if (check.refs?.length) {
          lines.push(`- **References:** ${check.refs.join(", ")}`);
        }
        lines.push("");
      }
    }

    lines.push("## All checks");
    lines.push("");
    lines.push("| ID | Check | Severity | Status |");
    lines.push("|---|---|---|---|");
    for (const check of [...checks].sort((a, b) => a.id.localeCompare(b.id))) {
      lines.push(
        `| \`${check.id}\` | ${escapePipe(check.title)} | ${check.severity} | ${check.status} |`
      );
    }
    lines.push("");
    return lines.join("\n");
  }

  function finish(config) {
    const s = summary();
    if (!config?.quiet) printConsole();

    const dir = config?.reportDir || path.join(process.cwd(), "security", "reports");
    fs.mkdirSync(dir, { recursive: true });

    const slug = slugify(id);
    const stamp = timestampSlug(startedAt);
    const base = `${stamp}-${slug}`;
    const jsonPath = path.join(dir, `${base}.json`);
    const mdPath = path.join(dir, `${base}.md`);

    const payload = {
      schemaVersion: 1,
      suite: id,
      name,
      mode,
      target,
      description,
      generatedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      summary: s,
      checks,
    };

    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
    fs.writeFileSync(mdPath, markdown(s));

    // Stable copies for CI artifact collection and dashboards.
    fs.writeFileSync(path.join(dir, `latest-${slug}.json`), JSON.stringify(payload, null, 2));
    fs.writeFileSync(path.join(dir, `latest-${slug}.md`), markdown(s));

    if (!config?.quiet) {
      console.log(paint(` Report : ${mdPath}`, COLOR.blue));
      console.log(paint(` JSON   : ${jsonPath}`, COLOR.blue));
      console.log("");
    }

    const threshold = SEVERITY_ORDER[config?.failOn] ?? SEVERITY_ORDER.high;
    const failed = checks.filter(
      (c) =>
        (c.status === "fail" || c.status === "error") &&
        SEVERITY_ORDER[c.severity] >= threshold
    );

    if (config?.strict && checks.some((c) => c.status === "fail")) {
      process.exitCode = 1;
    } else if (failed.length > 0) {
      process.exitCode = 1;
    }

    return { ...s, jsonPath, mdPath };
  }

  return {
    id,
    name,
    mode,
    target,
    checks,
    add,
    pass,
    fail,
    warn,
    skip,
    summary,
    finish,
  };
}

function escapePipe(value) {
  return String(value).replace(/\|/g, "\\|");
}
