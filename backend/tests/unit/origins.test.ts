/**
 * backend/tests/unit/origins.test.ts
 * Asella Organic — CORS / CSRF origin allowlist regression tests (ASE-2026-011)
 *
 * The allowlist used to contain a wildcard pattern that trusted ANY host
 * under *.trycloudflare.com, *.ngrok.io, *.ngrok-free.app, *.run.app,
 * *.google.com and *.googleusercontent.com outside production.
 *
 * Those suffixes are free to claim — a Cloudflare quick tunnel, an ngrok
 * tunnel or a Cloud Run service all hand out a hostname in one of them — and
 * this list is not only the CORS allowlist: it is also the CSRF Origin
 * check. So the wildcard made the Origin gate a pattern match over
 * hostnames an attacker controls.
 *
 * The allowlist is now explicit: a hostname has to be named.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { jest } from "@jest/globals";

const ORIGINAL_ENV = { ...process.env };

/**
 * Load src/lib/origins.ts with a specific environment.
 *
 * The module reads process.env once, at import time, so each case needs a
 * fresh module instance.
 */
async function loadOrigins(env: Record<string, string | undefined>) {
  jest.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import("../../src/lib/origins.js");
}

beforeEach(() => {
  delete process.env.PREVIEW_ORIGINS;
  delete process.env.TELEGRAM_MINIAPP_URL;
  delete process.env.ALLOWED_ORIGINS;
  process.env.NODE_ENV = "development";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("origin allowlist outside production", () => {
  it("does not trust an arbitrary Cloudflare quick tunnel", async () => {
    const { isAllowedOrigin } = await loadOrigins({});
    expect(isAllowedOrigin("https://someone-elses-tunnel.trycloudflare.com")).toBe(false);
  });

  it("does not trust an arbitrary ngrok tunnel", async () => {
    const { isAllowedOrigin } = await loadOrigins({});
    expect(isAllowedOrigin("https://abcd-1234.ngrok.io")).toBe(false);
    expect(isAllowedOrigin("https://abcd-1234.ngrok-free.app")).toBe(false);
  });

  it("does not trust an arbitrary Cloud Run service", async () => {
    const { isAllowedOrigin } = await loadOrigins({});
    expect(isAllowedOrigin("https://attacker-project-abc.run.app")).toBe(false);
  });

  it("does not trust an arbitrary googleusercontent host", async () => {
    const { isAllowedOrigin } = await loadOrigins({});
    expect(isAllowedOrigin("https://attacker.googleusercontent.com")).toBe(false);
  });

  it("trusts the localhost development origins", async () => {
    const { isAllowedOrigin } = await loadOrigins({});
    expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedOrigin("http://localhost:3001")).toBe(true);
  });

  it("trusts a preview origin the operator named", async () => {
    const { isAllowedOrigin } = await loadOrigins({
      PREVIEW_ORIGINS: "https://my-tunnel.trycloudflare.com,https://x.ngrok.io",
    });
    expect(isAllowedOrigin("https://my-tunnel.trycloudflare.com")).toBe(true);
    expect(isAllowedOrigin("https://x.ngrok.io")).toBe(true);
    // ...but only that one, not the whole suffix.
    expect(isAllowedOrigin("https://other-tunnel.trycloudflare.com")).toBe(false);
    expect(isAllowedOrigin("https://y.ngrok.io")).toBe(false);
  });

  it("accepts a preview origin written with a path", async () => {
    const { isAllowedOrigin } = await loadOrigins({
      PREVIEW_ORIGINS: "https://my-tunnel.trycloudflare.com/telegram-store",
    });
    // The origin is what a browser sends in the Origin header.
    expect(isAllowedOrigin("https://my-tunnel.trycloudflare.com")).toBe(true);
  });

  it("trusts the origin of TELEGRAM_MINIAPP_URL", async () => {
    const { isAllowedOrigin } = await loadOrigins({
      TELEGRAM_MINIAPP_URL: "https://my-tunnel.trycloudflare.com/telegram-store",
    });
    expect(isAllowedOrigin("https://my-tunnel.trycloudflare.com")).toBe(true);
  });
});

describe("origin allowlist in production", () => {
  it("trusts only ALLOWED_ORIGINS", async () => {
    const { isAllowedOrigin } = await loadOrigins({
      NODE_ENV:                 "production",
      ALLOWED_ORIGINS:         "https://www.asellaorganic.com",
      TELEGRAM_MINIAPP_URL:    "https://my-tunnel.trycloudflare.com/telegram-store",
      PREVIEW_ORIGINS:         "https://my-tunnel.trycloudflare.com",
    });
    expect(isAllowedOrigin("https://www.asellaorganic.com")).toBe(true);
    // Neither the tunnel, nor the preview list, nor a wildcard suffix.
    expect(isAllowedOrigin("https://my-tunnel.trycloudflare.com")).toBe(false);
    expect(isAllowedOrigin("https://attacker.ngrok.io")).toBe(false);
    expect(isAllowedOrigin("https://attacker-project-abc.run.app")).toBe(false);
    // ...and not a development origin either.
    expect(isAllowedOrigin("http://localhost:5173")).toBe(false);
  });

  it("does not let the localhost development pattern apply", async () => {
    const { isAllowedOrigin } = await loadOrigins({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://www.asellaorganic.com",
    });
    expect(isAllowedOrigin("http://192.168.1.20:5173")).toBe(false);
    expect(isAllowedOrigin("http://127.0.0.1:5173")).toBe(false);
  });
});
