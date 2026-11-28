#!/usr/bin/env node
/**
 * security/scripts/passive-headers.mjs
 *
 * Passive configuration review: security headers, CSP, CORS, cookies, TLS,
 * SRI, and public metadata. Safe to run against production.
 *
 * Usage:
 *   node security/scripts/passive-headers.mjs --target https://www.asellaorganic.com
 */

import { loadConfig, UsageError, SafetyError } from "./lib/config.mjs";
import { createHttpClient, header } from "./lib/http.mjs";
import { inspectTls } from "./lib/tls.mjs";
import { createSuite } from "./lib/report.mjs";

const HTML_PATHS = ["/", "/tma.html"];
const API_PATHS = ["/api/health", "/api/products?limit=1"];
const OPTIONAL_PATHS = ["/ai-catalog.json", "/robots.txt"];

/** Headers that reveal which stack serves the origin. */
const ORIGIN_DISCLOSURE_HEADERS = [
  "x-powered-by",
  "x-turbo-charged-by",
  "x-aspnet-version",
  "x-generator",
  "x-runtime",
  "x-drupal-cache",
  "x-magento",
  "x-shopify-stage",
];

/** Reverse-proxy Server values that say nothing about the origin. */
const KNOWN_PROXY_SERVERS = new Set([
  "cloudflare",
  "cloudflare-nginx",
  "envoy",
  "vercel",
  "netlify",
  "fly.io",
  "awselb/2.0",
]);

function parseCsp(value) {
  const directives = {};
  for (const part of String(value).split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    directives[tokens[0].toLowerCase()] = tokens.slice(1);
  }
  return directives;
}

function hasToken(values, token) {
  return (values || []).some(
    (value) => String(value).toLowerCase() === token.toLowerCase()
  );
}

function isWildcardSource(value) {
  const source = String(value).toLowerCase();
  if (source === "*" || source === "https:" || source === "http:") return true;
  // Host wildcards: https://*.example.com, https://*, http://*.example.com
  if (/^https?:\/\/\*/.test(source)) return true;
  return false;
}

function sriViolations(html, pagePath) {
  const violations = [];
  const tags = String(html).match(/<(script|link)\b[^>]*>/gi) || [];

  for (const tag of tags) {
    const isScript = /^<script/i.test(tag);
    const isStylesheet =
      /^<link/i.test(tag) && /\brel\s*=\s*["']stylesheet["']/i.test(tag);
    if (!isScript && !isStylesheet) continue;

    const url =
      tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ||
      tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!url || !/^https?:\/\//i.test(url)) continue;
    if (/\bintegrity\s*=/i.test(tag)) continue;
    if (/fonts\.googleapis\.com/i.test(url)) continue; // documented exception
    violations.push({ page: pagePath, url });
  }

  return violations;
}

function suspiciousComments(html, pagePath) {
  const comments = String(html).match(/<!--(?!\[if)[\s\S]*?-->/gi) || [];
  return comments
    .filter((comment) =>
      /\b(todo|fixme|hack|password|passwd|secret|api[_-]?key|token|internal|staging|debug)\b/i.test(
        comment
      )
    )
    .map((comment) => ({
      page: pagePath,
      comment: comment.replace(/\s+/g, " ").slice(0, 200),
    }));
}

function summarisePaths(paths, fn) {
  return paths.map((p) => ({ path: p, value: fn(p) }));
}

async function main() {
  const config = loadConfig({ requireTarget: true });
  const client = createHttpClient(config);

  // The storefront and the API are usually on different hosts. When
  // SECURITY_API_TARGET is set, API paths are checked against it.
  const apiClient = config.apiTarget
    ? createHttpClient({ ...config, target: config.apiTarget })
    : client;

  const suite = createSuite({
    id: "passive-headers",
    name: "Passive headers, CSP, CORS, and TLS",
    mode: "passive",
    target: config.target,
    description: "Read-only review of public responses. Safe on production.",
  });

  const responses = new Map();
  for (const requestPath of HTML_PATHS) {
    responses.set(
      requestPath,
      await client.get(requestPath, { origin: false, redirect: "follow" })
    );
  }
  for (const requestPath of API_PATHS) {
    responses.set(
      requestPath,
      await apiClient.get(requestPath, { origin: false, redirect: "follow" })
    );
  }
  for (const requestPath of OPTIONAL_PATHS) {
    responses.set(
      requestPath,
      await client.get(requestPath, { origin: false, redirect: "follow" })
    );
  }

  const reachableHtml = HTML_PATHS.filter((p) => {
    const r = responses.get(p);
    return r && !r.error && r.status === 200;
  });
  const reachableApi = API_PATHS.filter((p) => {
    const r = responses.get(p);
    return r && !r.error && r.status > 0;
  });

  if (reachableHtml.length === 0) {
    suite.fail(
      "ASE-CFG-01",
      "HTML entry point reachable",
      "critical",
      `None of ${HTML_PATHS.join(", ")} returned 200.`,
      "Confirm the target is serving the storefront and the URL is correct."
    );
  } else {
    suite.pass(
      "ASE-CFG-01",
      "HTML entry point reachable",
      "info",
      `Reachable: ${reachableHtml.join(", ")}`
    );
  }

  // ── HSTS ─────────────────────────────────────────────────────────────────
  const hsts = summarisePaths(reachableHtml, (p) => header(responses.get(p), "strict-transport-security"));
  const hstsMissing = hsts.filter((x) => !x.value);
  const hstsWeak = hsts.filter((x) => {
    if (!x.value) return false;
    const maxAge = Number(x.value.match(/max-age=(\d+)/i)?.[1] || 0);
    return maxAge < 31_536_000;
  });

  if (config.targetUrl.protocol !== "https:") {
    suite.skip("ASE-CFG-02", "HSTS on HTML responses", "high", "Target is not HTTPS.");
  } else if (hstsMissing.length) {
    suite.fail(
      "ASE-CFG-02",
      "HSTS on HTML responses",
      "high",
      hstsMissing,
      "Send Strict-Transport-Security: max-age=31536000; includeSubDomains; preload on every HTTPS response.",
      ["WSTG-CONF-07", "ZAP #7"]
    );
  } else if (hstsWeak.length) {
    suite.warn(
      "ASE-CFG-02",
      "HSTS max-age is at least one year",
      "medium",
      hstsWeak,
      "Raise max-age to 31536000 and add includeSubDomains; preload only after every subdomain is HTTPS.",
      ["WSTG-CONF-07"]
    );
  } else {
    suite.pass(
      "ASE-CFG-02",
      "HSTS on HTML responses",
      "info",
      hsts.map((x) => `${x.path}: ${x.value}`)
    );
  }

  // ── CSP presence and directives ──────────────────────────────────────────
  const cspByPath = summarisePaths(reachableHtml, (p) => header(responses.get(p), "content-security-policy"));
  const cspMissing = cspByPath.filter((x) => !x.value);

  if (cspMissing.length) {
    suite.fail(
      "ASE-CFG-03",
      "Content-Security-Policy present on HTML",
      "high",
      cspMissing.map((x) => x.path),
      "Serve a CSP on every HTML response. See csp-config.js.",
      ["WSTG-CONF-08", "ZAP #1", "ZAP #2"]
    );
  } else {
    suite.pass(
      "ASE-CFG-03",
      "Content-Security-Policy present on HTML",
      "info",
      cspByPath.map((x) => x.path)
    );
  }

  if (cspByPath.some((x) => x.value)) {
    const parsed = cspByPath
      .filter((x) => x.value)
      .map((x) => ({ path: x.path, directives: parseCsp(x.value) }));

    // script-src hardening
    const scriptProblems = [];
    for (const { path, directives } of parsed) {
      const scriptSrc = directives["script-src"] || [];
      if (hasToken(scriptSrc, "'unsafe-inline'")) scriptProblems.push({ path, issue: "unsafe-inline" });
      if (hasToken(scriptSrc, "'unsafe-eval'")) scriptProblems.push({ path, issue: "unsafe-eval" });
      if (scriptSrc.some(isWildcardSource)) scriptProblems.push({ path, issue: "wildcard source" });
    }
    if (scriptProblems.length) {
      suite.fail(
        "ASE-CFG-04",
        "script-src is free of unsafe-inline, unsafe-eval, and wildcards",
        "high",
        scriptProblems,
        "Remove unsafe tokens and wildcard sources from script-src. Move inline code to files.",
        ["WSTG-CONF-08", "ZAP #1", "ZAP #2"]
      );
    } else {
      suite.pass(
        "ASE-CFG-04",
        "script-src is free of unsafe-inline, unsafe-eval, and wildcards",
        "info"
      );
    }

    // style-src hardening
    const styleProblems = [];
    for (const { path, directives } of parsed) {
      const styleSrc = directives["style-src"] || [];
      const styleAttr = directives["style-src-attr"] || [];
      if (hasToken(styleSrc, "'unsafe-inline'")) styleProblems.push({ path, issue: "style-src unsafe-inline" });
      if (styleAttr.some(isWildcardSource)) styleProblems.push({ path, issue: "style-src-attr wildcard" });
      if (styleSrc.some(isWildcardSource)) styleProblems.push({ path, issue: "style-src wildcard" });
    }
    if (styleProblems.length) {
      suite.fail(
        "ASE-CFG-05",
        "style-src is free of unsafe-inline and wildcards",
        "medium",
        styleProblems,
        "Use 'unsafe-hashes' plus SHA-256 hashes for the narrow inline set, or move styles to files.",
        ["WSTG-CONF-08", "ZAP #2"]
      );
    } else {
      suite.pass(
        "ASE-CFG-05",
        "style-src is free of unsafe-inline and wildcards",
        "info"
      );
    }

    // baseline directives
    // This check covers presence and the safe value for the directives that
    // have one. Wildcards are reported by ASE-CFG-07, so they are not
    // counted twice here.
    const baselineProblems = [];
    for (const { path, directives } of parsed) {
      const defaultSrc = directives["default-src"] || [];
      const objectSrc = directives["object-src"] || [];
      const baseUri = directives["base-uri"] || [];
      const frameAncestors = directives["frame-ancestors"] || [];
      const formAction = directives["form-action"] || [];

      if (!hasToken(defaultSrc, "'self'")) baselineProblems.push({ path, issue: "default-src is not 'self'" });
      if (!hasToken(objectSrc, "'none'")) baselineProblems.push({ path, issue: "object-src is not 'none'" });
      if (!hasToken(baseUri, "'self'")) baselineProblems.push({ path, issue: "base-uri is not 'self'" });
      if (frameAncestors.length === 0) baselineProblems.push({ path, issue: "frame-ancestors missing" });
      if (formAction.length === 0) baselineProblems.push({ path, issue: "form-action missing" });
      if (!("upgrade-insecure-requests" in directives)) {
        baselineProblems.push({ path, issue: "upgrade-insecure-requests missing" });
      }
    }
    if (baselineProblems.length) {
      suite.fail(
        "ASE-CFG-06",
        "CSP baseline directives present",
        "medium",
        baselineProblems,
        "Add default-src 'self', object-src 'none', base-uri 'self', frame-ancestors, form-action, and upgrade-insecure-requests.",
        ["WSTG-CONF-08"]
      );
    } else {
      suite.pass("ASE-CFG-06", "CSP baseline directives present", "info");
    }

    // wildcard inventory across all directives
    const wildcards = [];
    for (const { path, directives } of parsed) {
      for (const [directive, values] of Object.entries(directives)) {
        for (const value of values) {
          if (isWildcardSource(value)) wildcards.push({ path, directive, value });
        }
      }
    }
    if (wildcards.length) {
      suite.warn(
        "ASE-CFG-07",
        "CSP contains no scheme or host wildcards",
        "medium",
        wildcards,
        "Replace wildcards with explicit origins so an XSS cannot load attacker-controlled resources.",
        ["ZAP #1"]
      );
    } else {
      suite.pass("ASE-CFG-07", "CSP contains no scheme or host wildcards", "info");
    }
  } else {
    suite.skip("ASE-CFG-04", "script-src hardening", "high", "No CSP to parse.");
    suite.skip("ASE-CFG-05", "style-src hardening", "medium", "No CSP to parse.");
    suite.skip("ASE-CFG-06", "CSP baseline directives", "medium", "No CSP to parse.");
    suite.skip("ASE-CFG-07", "CSP wildcard inventory", "medium", "No CSP to parse.");
  }

  // ── Standard security headers ────────────────────────────────────────────
  const allPaths = [...reachableHtml, ...reachableApi];

  const nosniffMissing = allPaths.filter(
    (p) => String(header(responses.get(p), "x-content-type-options") || "").toLowerCase() !== "nosniff"
  );
  if (nosniffMissing.length) {
    suite.fail(
      "ASE-CFG-08",
      "X-Content-Type-Options: nosniff",
      "medium",
      nosniffMissing,
      "Helmet sets this by default. Find the route or proxy that removes it.",
      ["WSTG-CONF-07", "ZAP #8"]
    );
  } else {
    suite.pass("ASE-CFG-08", "X-Content-Type-Options: nosniff", "info");
  }

  const frameProblems = reachableHtml.filter((p) => {
    const xfo = String(header(responses.get(p), "x-frame-options") || "").toUpperCase();
    const csp = header(responses.get(p), "content-security-policy") || "";
    const hasFrameAncestors = /frame-ancestors/i.test(csp);
    return !hasFrameAncestors && !["DENY", "SAMEORIGIN"].includes(xfo);
  });
  if (frameProblems.length) {
    suite.fail(
      "ASE-CFG-09",
      "Clickjacking protection on HTML",
      "medium",
      frameProblems,
      "Keep frame-ancestors in the CSP and set X-Frame-Options: DENY or SAMEORIGIN as a fallback.",
      ["WSTG-CONF-07"]
    );
  } else {
    suite.pass("ASE-CFG-09", "Clickjacking protection on HTML", "info");
  }

  const referrerMissing = allPaths.filter(
    (p) => !header(responses.get(p), "referrer-policy")
  );
  if (referrerMissing.length) {
    suite.warn(
      "ASE-CFG-10",
      "Referrer-Policy present",
      "low",
      referrerMissing,
      "Set Referrer-Policy: strict-origin-when-cross-origin (or no-referrer).",
      ["WSTG-CONF-07"]
    );
  } else {
    suite.pass("ASE-CFG-10", "Referrer-Policy present", "info");
  }

  const permissionsMissing = allPaths.filter(
    (p) => !header(responses.get(p), "permissions-policy")
  );
  if (permissionsMissing.length) {
    suite.warn(
      "ASE-CFG-11",
      "Permissions-Policy present",
      "low",
      permissionsMissing,
      "Disable unused features explicitly, e.g. camera=(), microphone=(), geolocation=().",
      ["WSTG-CONF-07"]
    );
  } else {
    suite.pass("ASE-CFG-11", "Permissions-Policy present", "info");
  }

  const disclosure = allPaths
    .map((p) => {
      const response = responses.get(p);
      const server = header(response, "server");
      return {
        path: p,
        server: KNOWN_PROXY_SERVERS.has(String(server || "").toLowerCase())
          ? null
          : server,
        poweredBy: header(response, "x-powered-by"),
        originHeaders: Object.fromEntries(
          ORIGIN_DISCLOSURE_HEADERS.map((name) => [name, header(response, name)]).filter(
            ([, value]) => value
          )
        ),
      };
    })
    .filter(
      (x) => x.server || x.poweredBy || Object.keys(x.originHeaders).length > 0
    );
  if (disclosure.length) {
    suite.warn(
      "ASE-CFG-12",
      "No origin technology disclosure",
      "low",
      disclosure,
      "Strip these headers at the origin. A CDN's own Server header is not origin disclosure.",
      ["WSTG-INFO-02"]
    );
  } else {
    suite.pass("ASE-CFG-12", "No origin technology disclosure", "info");
  }

  const coopMissing = reachableHtml.filter(
    (p) => !header(responses.get(p), "cross-origin-opener-policy")
  );
  if (coopMissing.length) {
    suite.warn(
      "ASE-CFG-13",
      "Cross-Origin-Opener-Policy present",
      "low",
      coopMissing,
      "Set Cross-Origin-Opener-Policy: same-origin where the Telegram iframe flow allows it.",
      ["WSTG-CONF-07"]
    );
  } else {
    suite.pass("ASE-CFG-13", "Cross-Origin-Opener-Policy present", "info");
  }

  // ── CORS ─────────────────────────────────────────────────────────────────
  const evilOrigin = "https://evil.example";
  const corsProbes = [];
  for (const p of ["/api/products?limit=1", "/api/health"]) {
    const response = await apiClient.get(p, { origin: evilOrigin });
    corsProbes.push({
      path: p,
      status: response.status,
      allowOrigin: header(response, "access-control-allow-origin"),
      allowCredentials: header(response, "access-control-allow-credentials"),
    });
  }

  const corsFailures = corsProbes.filter((probe) => {
    const acao = String(probe.allowOrigin || "").toLowerCase();
    return acao === "*" || acao === evilOrigin.toLowerCase();
  });
  if (corsFailures.length) {
    suite.fail(
      "ASE-CFG-14",
      "CORS rejects untrusted origins",
      "high",
      corsFailures,
      "Keep an explicit allow-list. Never combine Access-Control-Allow-Origin: * with credentials.",
      ["WSTG-CONF-05", "ZAP #3"]
    );
  } else {
    suite.pass("ASE-CFG-14", "CORS rejects untrusted origins", "info", corsProbes);
  }

  const preflight = await apiClient.request("OPTIONS", "/api/orders", {
    origin: evilOrigin,
    headers: {
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type, authorization",
    },
  });
  const preflightAcao = String(header(preflight, "access-control-allow-origin") || "").toLowerCase();
  if (preflightAcao === "*" || preflightAcao === evilOrigin.toLowerCase()) {
    suite.fail(
      "ASE-CFG-15",
      "CORS preflight rejects untrusted origins",
      "high",
      {
        status: preflight.status,
        allowOrigin: header(preflight, "access-control-allow-origin"),
        allowCredentials: header(preflight, "access-control-allow-credentials"),
      },
      "Return no CORS approval for origins outside ALLOWED_ORIGINS.",
      ["WSTG-CONF-05"]
    );
  } else {
    suite.pass(
      "ASE-CFG-15",
      "CORS preflight rejects untrusted origins",
      "info",
      { status: preflight.status, allowOrigin: header(preflight, "access-control-allow-origin") }
    );
  }

  // ── HTTP → HTTPS redirect ────────────────────────────────────────────────
  if (config.targetUrl.protocol === "https:") {
    const plainUrl = `http://${config.targetUrl.host}/`;
    const plain = await client.get(plainUrl, {
      absolute: true,
      origin: false,
      redirect: "manual",
    });

    if (plain.error) {
      suite.pass(
        "ASE-CFG-16",
        "Plain HTTP does not serve content",
        "info",
        `No HTTP listener reachable: ${plain.error}`
      );
    } else if ([301, 302, 307, 308].includes(plain.status)) {
      const location = String(header(plain, "location") || "");
      if (location.startsWith("https://")) {
        suite.pass(
          "ASE-CFG-16",
          "Plain HTTP redirects to HTTPS",
          "info",
          { status: plain.status, location }
        );
      } else {
        suite.fail(
          "ASE-CFG-16",
          "Plain HTTP redirects to HTTPS",
          "high",
          { status: plain.status, location },
          "Redirect to an https:// URL, not to another host or scheme.",
          ["ZAP #6"]
        );
      }
    } else if (plain.status === 200) {
      suite.fail(
        "ASE-CFG-16",
        "Plain HTTP redirects to HTTPS",
        "high",
        "HTTP returned 200 instead of redirecting.",
        "Force HTTPS at the edge (Cloudflare Always Use HTTPS) and at the origin.",
        ["ZAP #6"]
      );
    } else {
      suite.warn(
        "ASE-CFG-16",
        "Plain HTTP redirects to HTTPS",
        "medium",
        { status: plain.status },
        "Unexpected response on port 80. Confirm the edge behaviour."
      );
    }
  } else {
    suite.skip("ASE-CFG-16", "HTTP to HTTPS redirect", "info", "Target is HTTP.");
  }

  // ── TLS ──────────────────────────────────────────────────────────────────
  const tlsHosts = [config.targetUrl.hostname];
  if (config.apiTargetUrl && config.apiTargetUrl.hostname !== config.targetUrl.hostname) {
    tlsHosts.push(config.apiTargetUrl.hostname);
  }

  if (config.targetUrl.protocol === "https:") {
    const tlsResults = [];
    for (const hostname of tlsHosts) {
      const result = await inspectTls(hostname, { timeoutMs: config.timeoutMs });
      tlsResults.push({ hostname, ...result });
    }

    const problems = [];
    for (const result of tlsResults) {
      if (!result.ok) {
        problems.push({ host: result.hostname, issue: result.error });
        continue;
      }

      const protocol = String(result.protocol || "");
      const days = result.certificate?.daysRemaining;

      if (!result.authorized) {
        problems.push({ host: result.hostname, issue: `certificate not trusted: ${result.authorizationError}` });
      }
      if (result.identityError) {
        problems.push({ host: result.hostname, issue: `identity: ${result.identityError}` });
      }
      if (protocol === "TLSv1" || protocol === "TLSv1.1") {
        problems.push({ host: result.hostname, issue: `weak protocol: ${protocol}` });
      }
      if (typeof days === "number" && days < 14) {
        problems.push({ host: result.hostname, issue: `certificate expires in ${days} days` });
      }
    }

    if (problems.length) {
      suite.fail(
        "ASE-CFG-17",
        "TLS handshake and certificate",
        "high",
        { problems, hosts: tlsResults.map((r) => ({ host: r.hostname, protocol: r.protocol })) },
        "Use TLS 1.2+ with a valid, auto-renewed certificate. Run testssl.sh for the full matrix.",
        ["WSTG-CRYP-01"]
      );
    } else {
      suite.pass(
        "ASE-CFG-17",
        "TLS handshake and certificate",
        "info",
        tlsResults.map((r) => ({
          host: r.hostname,
          protocol: r.protocol,
          cipher: r.cipher?.name,
          alpn: r.alpn,
          expires: r.certificate?.validTo,
          daysRemaining: r.certificate?.daysRemaining,
        }))
      );
    }
  } else {
    suite.skip("ASE-CFG-17", "TLS handshake and certificate", "high", "Target is HTTP.");
  }

  // ── SRI ──────────────────────────────────────────────────────────────────
  const sri = [];
  for (const p of reachableHtml) {
    const html = responses.get(p)?.text || "";
    sri.push(...sriViolations(html, p));
  }
  if (sri.length) {
    suite.warn(
      "ASE-CFG-18",
      "External scripts and styles have SRI",
      "medium",
      sri,
      "Add integrity + crossorigin to third-party script/link tags. Google Fonts CSS is a documented exception.",
      ["ZAP #4", "ZAP #5"]
    );
  } else {
    suite.pass("ASE-CFG-18", "External scripts and styles have SRI", "info");
  }

  // ── Cache-Control on API responses ───────────────────────────────────────
  const cacheProblems = [];
  for (const p of ["/api/health", "/api/products?limit=1"]) {
    const response = responses.get(p);
    if (!response || response.error) continue;
    const cacheControl = String(header(response, "cache-control") || "").toLowerCase();
    if (p === "/api/health" && !cacheControl.includes("no-store")) {
      cacheProblems.push({ path: p, cacheControl: cacheControl || "(missing)" });
    }
  }
  if (cacheProblems.length) {
    suite.warn(
      "ASE-CFG-19",
      "Dynamic API responses are not cacheable",
      "low",
      cacheProblems,
      "Send Cache-Control: no-store on health and authenticated responses.",
      ["WSTG-CONF-07", "ZAP #11"]
    );
  } else {
    suite.pass("ASE-CFG-19", "Dynamic API responses are not cacheable", "info");
  }

  // ── Cookies (passive: only if a response set one) ────────────────────────
  const cookieIssues = [];
  for (const [p, response] of responses.entries()) {
    for (const line of response.setCookie || []) {
      const lower = line.toLowerCase();
      if (!lower.includes("httponly")) cookieIssues.push({ path: p, issue: "missing HttpOnly", cookie: line.split("=")[0] });
      if (config.targetUrl.protocol === "https:" && !lower.includes("secure")) {
        cookieIssues.push({ path: p, issue: "missing Secure", cookie: line.split("=")[0] });
      }
      if (!/samesite\s*=/i.test(line)) cookieIssues.push({ path: p, issue: "missing SameSite", cookie: line.split("=")[0] });
    }
  }
  if (cookieIssues.length) {
    suite.fail(
      "ASE-CFG-20",
      "Cookies use HttpOnly, Secure, and SameSite",
      "medium",
      cookieIssues,
      "Set HttpOnly, Secure, and SameSite=Strict on session cookies.",
      ["WSTG-SESS-02"]
    );
  } else {
    suite.pass("ASE-CFG-20", "Cookies use HttpOnly, Secure, and SameSite", "info", "No cookies set on passive endpoints.");
  }

  // ── HTML comments ────────────────────────────────────────────────────────
  const comments = [];
  for (const p of reachableHtml) {
    comments.push(...suspiciousComments(responses.get(p)?.text || "", p));
  }
  if (comments.length) {
    suite.warn(
      "ASE-CFG-21",
      "No sensitive HTML comments",
      "low",
      comments,
      "Strip build/debug comments from production HTML.",
      ["WSTG-INFO-05", "ZAP #10"]
    );
  } else {
    suite.pass("ASE-CFG-21", "No sensitive HTML comments", "info");
  }

  // ── Public metadata ──────────────────────────────────────────────────────
  const securityTxt = await client.get("/.well-known/security.txt", { origin: false });
  const securityTxtBody = securityTxt.text || "";
  const looksLikeSecurityTxt =
    securityTxt.status === 200 &&
    /^\s*(contact|expires)\s*:/im.test(securityTxtBody) &&
    !/<!doctype html/i.test(securityTxtBody);

  if (looksLikeSecurityTxt) {
    suite.pass(
      "ASE-INF-01",
      "security.txt published",
      "info",
      "/.well-known/security.txt"
    );
  } else {
    suite.warn(
      "ASE-INF-01",
      "security.txt published",
      "info",
      {
        status: securityTxt.status || securityTxt.error,
        note:
          securityTxt.status === 200 && /<!doctype html/i.test(securityTxtBody)
            ? "The path returns the SPA shell, so no security.txt is published."
            : "No security.txt response with Contact and Expires fields.",
      },
      "Publish a security.txt with a monitored Contact and an Expires field."
    );
  }

  const robots = responses.get("/robots.txt");
  if (robots && robots.status === 200) {
    suite.pass(
      "ASE-INF-02",
      "robots.txt reachable",
      "info",
      (robots.text || "").slice(0, 300)
    );
  } else {
    suite.skip("ASE-INF-02", "robots.txt", "info", "Not published.");
  }

  const catalog = responses.get("/ai-catalog.json");
  if (catalog && catalog.status === 200) {
    suite.add({
      id: "ASE-INF-03",
      title: "Agent catalog is intentionally public",
      severity: "info",
      status: "pass",
      evidence: {
        path: "/ai-catalog.json",
        contentType: header(catalog, "content-type"),
        cacheControl: header(catalog, "cache-control"),
      },
    });
  } else {
    suite.skip("ASE-INF-03", "Agent catalog", "info", "Not published or not reachable.");
  }

  suite.finish(config);
}

main().catch((error) => {
  if (error instanceof UsageError || error instanceof SafetyError) {
    console.error(`\n[security] ${error.message}\n`);
    process.exit(error.exitCode || 2);
  }
  console.error("\n[security] passive scan failed:", error);
  process.exit(1);
});
