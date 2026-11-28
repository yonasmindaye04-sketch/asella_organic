/**
 * security/scripts/lib/config.mjs
 *
 * Configuration and safety guards for the Asella Organic security suite.
 *
 * Design rules:
 *   - No third-party dependencies. Node 20+ built-ins only.
 *   - Passive checks may run against production.
 *   - Active checks may never run against production.
 *   - State-changing checks additionally require --allow-writes.
 *   - Every script prints exactly what it will do before it does it.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const SECURITY_ROOT = path.resolve(HERE, "..", "..");
export const REPO_ROOT = path.resolve(SECURITY_ROOT, "..");

/** Hosts that are always considered production, including subdomains. */
const PRODUCTION_DOMAINS = ["asellaorganic.com"];

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
    this.exitCode = 2;
  }
}

export class SafetyError extends Error {
  constructor(message) {
    super(message);
    this.name = "SafetyError";
    this.exitCode = 3;
  }
}

function parseDotEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;

  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function parseArgv(argv) {
  const out = { _: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      out._.push(token);
      continue;
    }

    const body = token.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      out[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }

    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[body] = next;
      i += 1;
    } else {
      out[body] = true;
    }
  }

  return out;
}

export function isProductionHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  return PRODUCTION_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );
}

export function normalizeTarget(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    throw new UsageError(
      "No target supplied.\n" +
        "  Set SECURITY_TARGET or pass --target https://staging.example.com"
    );
  }

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  let url;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new UsageError(`Target is not a valid URL: ${value}`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new UsageError(`Target must be http(s), got ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new UsageError("Target must not contain embedded credentials.");
  }

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";

  return url.toString().replace(/\/$/, "");
}

export function loadConfig(options = {}) {
  const { requireTarget = true } = options;

  const fileEnv = {
    ...parseDotEnv(path.join(SECURITY_ROOT, ".env")),
    ...parseDotEnv(path.join(REPO_ROOT, ".env")),
  };
  const env = { ...fileEnv, ...process.env };
  const args = parseArgv(process.argv.slice(2));

  const rawTarget = args.target || env.SECURITY_TARGET;
  const target = requireTarget ? normalizeTarget(rawTarget) : null;

  // The storefront and the API are usually different hosts. When they are,
  // point the API checks at the API base URL instead of the storefront.
  const rawApiTarget = args["api-target"] || env.SECURITY_API_TARGET || null;
  const apiTarget = rawApiTarget ? normalizeTarget(rawApiTarget) : null;

  const activeRequested =
    args.active === true ||
    String(args.active).toLowerCase() === "true" ||
    env.SECURITY_ALLOW_ACTIVE === "1";

  const allowWrites =
    args["allow-writes"] === true ||
    String(args["allow-writes"]).toLowerCase() === "true" ||
    env.SECURITY_ALLOW_WRITES === "1";

  const rps = Number(args.rps || env.SECURITY_RPS || 5);
  const timeoutMs = Number(args.timeout || env.SECURITY_TIMEOUT_MS || 15_000);

  return {
    env,
    args,
    target,
    targetUrl: target ? new URL(target) : null,
    apiTarget,
    apiTargetUrl: apiTarget ? new URL(apiTarget) : null,
    isProduction: target ? isProductionHost(new URL(target).hostname) : false,
    isProductionApi: apiTarget ? isProductionHost(new URL(apiTarget).hostname) : false,
    mode: activeRequested ? "active" : "passive",
    allowWrites,
    rps: Number.isFinite(rps) && rps > 0 ? rps : 5,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15_000,
    failOn: String(args["fail-on"] || env.SECURITY_FAIL_ON || "high").toLowerCase(),
    strict:
      args.strict === true ||
      String(args.strict).toLowerCase() === "true" ||
      env.SECURITY_STRICT === "1",
    reportDir: path.resolve(
      args.out || env.SECURITY_REPORT_DIR || path.join(SECURITY_ROOT, "reports")
    ),
    quiet: args.quiet === true || env.SECURITY_QUIET === "1",
  };
}

/**
 * Active checks are allowed only on a non-production host.
 * Call this before any request that is more than a passive GET.
 */
export function assertActiveAllowed(config) {
  if (config.mode !== "active") {
    throw new UsageError(
      "This suite performs active testing and is disabled by default.\n" +
        "  Re-run with --active (or set SECURITY_ALLOW_ACTIVE=1).\n" +
        "  Active testing is refused against production hosts."
    );
  }

  if (config.isProduction || config.isProductionApi) {
    const host = config.isProduction
      ? config.targetUrl.hostname
      : config.apiTargetUrl.hostname;
    throw new SafetyError(
      `Refusing active testing against production host: ${host}\n` +
        "  Active scans belong on a staging clone. See security/README.md."
    );
  }
}

/** Returns false when the caller may not perform state-changing checks. */
export function writesAllowed(config) {
  return config.allowWrites === true;
}

export function credentialsFor(config, role) {
  const key = String(role).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const username =
    config.env[`SECURITY_${key}_USER`] ||
    config.env[`SECURITY_${key}_USERNAME`] ||
    null;
  const password = config.env[`SECURITY_${key}_PASS`] || null;
  return username && password ? { username, password } : null;
}

export function configuredRoles(config) {
  const roles = [
    "admin",
    "manager",
    "employee",
    "store_manager",
    "call_center",
    "delivery",
    "affiliate",
    "vendor",
    "tech_support",
  ];
  return roles.filter((role) => credentialsFor(config, role) !== null);
}

export function timestampSlug(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}
