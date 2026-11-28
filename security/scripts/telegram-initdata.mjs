#!/usr/bin/env node
/**
 * security/scripts/telegram-initdata.mjs
 *
 * Telegram Mini App trust-boundary tests. Verifies that initData is
 * HMAC-checked, freshness-checked, and rejected when missing or tampered.
 *
 * Active: requires --active and a non-production target.
 * Positive-signature cases require TELEGRAM_BOT_TOKEN in security/.env.
 *
 * Usage:
 *   node security/scripts/telegram-initdata.mjs --target https://staging.example.com --active
 */

import crypto from "node:crypto";
import {
  loadConfig,
  assertActiveAllowed,
  writesAllowed,
  UsageError,
  SafetyError,
} from "./lib/config.mjs";
import { createHttpClient } from "./lib/http.mjs";
import { createSuite } from "./lib/report.mjs";

const ENDPOINT = "/api/telegram/validate-init-data";

function buildInitData({ botToken, user, authDate, queryId = "AAHdF6IQAAAAAN0Xoha" }) {
  const params = new URLSearchParams();
  params.set("query_id", queryId);
  params.set("user", JSON.stringify(user));
  if (authDate !== undefined) params.set("auth_date", String(authDate));

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const hash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  params.set("hash", hash);
  return params.toString();
}

function testIp(seed) {
  return `198.51.100.${seed % 250 + 2}`;
}

async function postInitData(client, initData, seed) {
  return client.post(
    ENDPOINT,
    initData === undefined ? {} : { initData },
    { headers: { "x-forwarded-for": testIp(seed) } }
  );
}

async function main() {
  const config = loadConfig({ requireTarget: true });
  assertActiveAllowed(config);

  const suite = createSuite({
    id: "telegram-initdata",
    name: "Telegram Mini App initData boundary",
    mode: "active",
    target: config.target,
    description: "HMAC verification, freshness, and replay handling",
  });

  const client = createHttpClient(config);
  const botToken = config.env.TELEGRAM_BOT_TOKEN || "";
  const user = {
    id: 777000111,
    first_name: "Security",
    last_name: "Probe",
    username: "asella_security_probe",
    language_code: "en",
  };
  const now = Math.floor(Date.now() / 1000);

  // ── Missing and malformed payloads ───────────────────────────────────────
  const missing = await postInitData(client, undefined, 11);
  if (missing.status === 400) {
    suite.pass("ASE-ATHN-20", "Missing initData is rejected", "info", missing.status);
  } else {
    suite.fail(
      "ASE-ATHN-20",
      "Missing initData is rejected",
      "high",
      { status: missing.status, body: missing.json?.error },
      "Require initData on every Mini App endpoint and return 400/401.",
      ["WSTG-ATHN-01"]
    );
  }

  const garbage = await postInitData(client, "not-a-query-string", 12);
  if ([400, 401].includes(garbage.status)) {
    suite.pass("ASE-ATHN-21", "Malformed initData is rejected", "info", garbage.status);
  } else {
    suite.fail(
      "ASE-ATHN-21",
      "Malformed initData is rejected",
      "high",
      { status: garbage.status, body: garbage.json?.error },
      "Reject payloads without a hash before any database work.",
      ["WSTG-ATHN-01"]
    );
  }

  const badHash = `user=${encodeURIComponent(JSON.stringify(user))}&auth_date=${now}&hash=${"a".repeat(64)}`;
  const badHashResponse = await postInitData(client, badHash, 13);
  if ([400, 401].includes(badHashResponse.status)) {
    suite.pass("ASE-ATHN-22", "Invalid HMAC is rejected", "info", badHashResponse.status);
  } else {
    suite.fail(
      "ASE-ATHN-22",
      "Invalid HMAC is rejected",
      "critical",
      { status: badHashResponse.status, body: badHashResponse.json?.error },
      "Verify HMAC-SHA256 before trusting any initData field.",
      ["WSTG-ATHN-01", "CWE-345"]
    );
  }

  // ── Signed payloads ──────────────────────────────────────────────────────
  if (!botToken) {
    suite.skip(
      "ASE-ATHN-23",
      "Signed initData freshness and tamper checks",
      "high",
      "Set TELEGRAM_BOT_TOKEN in security/.env to mint signed payloads."
    );
  } else {
    const valid = buildInitData({ botToken, user, authDate: now });

    const tamperedParams = new URLSearchParams(valid);
    tamperedParams.set("user", JSON.stringify({ ...user, id: 777000222 }));
    const tampered = tamperedParams.toString();
    const tamperedResponse = await postInitData(client, tampered, 14);
    if ([400, 401].includes(tamperedResponse.status)) {
      suite.pass("ASE-ATHN-23", "Tampered user data is rejected", "info", tamperedResponse.status);
    } else {
      suite.fail(
        "ASE-ATHN-23",
        "Tampered user data is rejected",
        "critical",
        { status: tamperedResponse.status },
        "The HMAC must cover every field, including user.",
        ["WSTG-ATHN-01", "CWE-345"]
      );
    }

    const expired = buildInitData({
      botToken,
      user,
      authDate: now - 90_000,
    });
    const expiredResponse = await postInitData(client, expired, 15);
    if ([400, 401].includes(expiredResponse.status)) {
      suite.pass("ASE-ATHN-24", "Expired initData is rejected", "info", expiredResponse.status);
    } else {
      suite.fail(
        "ASE-ATHN-24",
        "Expired initData is rejected",
        "high",
        { status: expiredResponse.status, body: expiredResponse.json?.error },
        "Enforce the 24-hour auth_date window. Reject stale payloads.",
        ["WSTG-ATHN-01", "CWE-613"]
      );
    }

    const future = buildInitData({
      botToken,
      user,
      authDate: now + 3_600,
    });
    const futureResponse = await postInitData(client, future, 16);
    if ([400, 401].includes(futureResponse.status)) {
      suite.pass("ASE-ATHN-25", "Future-dated initData is rejected", "info", futureResponse.status);
    } else {
      suite.fail(
        "ASE-ATHN-25",
        "Future-dated initData is rejected",
        "medium",
        { status: futureResponse.status },
        "Reject auth_date more than five minutes in the future.",
        ["WSTG-ATHN-01"]
      );
    }

    // The known gap: validateTelegramInitData only checks age when auth_date > 0.
    const noDate = buildInitData({ botToken, user, authDate: undefined });
    const noDateResponse = await postInitData(client, noDate, 17);
    if ([400, 401].includes(noDateResponse.status)) {
      suite.pass(
        "ASE-ATHN-26",
        "Signed initData without auth_date is rejected",
        "info",
        noDateResponse.status
      );
    } else {
      suite.fail(
        "ASE-ATHN-26",
        "Signed initData without auth_date is rejected",
        "high",
        {
          status: noDateResponse.status,
          note: "A correctly signed payload with no auth_date was accepted, so it never expires.",
        },
        "Require auth_date in validateTelegramInitData. Treat a missing or non-numeric auth_date as invalid.",
        ["CWE-613", "backend/src/lib/telegram-auth.ts:93"]
      );
    }

    // Valid, fresh initData should work on a read-only endpoint.
    const myOrders = await client.get("/api/telegram/my-orders", {
      headers: {
        "x-telegram-init-data": valid,
        "x-forwarded-for": testIp(18),
      },
      origin: false,
    });
    if (myOrders.status === 200) {
      suite.pass("ASE-ATHN-27", "Valid initData authenticates a Mini App read", "info", myOrders.status);
    } else {
      suite.warn(
        "ASE-ATHN-27",
        "Valid initData authenticates a Mini App read",
        "medium",
        { status: myOrders.status, body: myOrders.json?.error },
        "Confirm the bot token matches the deployment and the endpoint is mounted."
      );
    }

    // Query-string initData must not be accepted (it leaks into access logs).
    const queryResponse = await client.post(
      `${ENDPOINT}?initData=${encodeURIComponent(valid)}`,
      {},
      { headers: { "x-forwarded-for": testIp(19) } }
    );
    if ([400, 401].includes(queryResponse.status)) {
      suite.pass(
        "ASE-ATHN-28",
        "initData in the query string is ignored",
        "info",
        queryResponse.status
      );
    } else {
      suite.fail(
        "ASE-ATHN-28",
        "initData in the query string is ignored",
        "medium",
        { status: queryResponse.status },
        "Read initData only from the body or x-telegram-init-data header.",
        ["CWE-598"]
      );
    }

    // Positive write path is opt-in: /validate-init-data upserts telegram_users.
    if (writesAllowed(config)) {
      const validResponse = await postInitData(client, valid, 20);
      if (validResponse.status === 200) {
        suite.pass(
          "ASE-ATHN-29",
          "Valid initData completes validation",
          "info",
          validResponse.status
        );
      } else {
        suite.warn(
          "ASE-ATHN-29",
          "Valid initData completes validation",
          "medium",
          { status: validResponse.status, body: validResponse.json?.error },
          "Check TELEGRAM_BOT_TOKEN and database connectivity."
        );
      }
    } else {
      suite.skip(
        "ASE-ATHN-29",
        "Valid initData completes validation",
        "info",
        "Skipped because /validate-init-data writes a telegram_users row. Add --allow-writes to enable."
      );
    }
  }

  // ── Other Mini App endpoints reject missing initData ─────────────────────
  const protectedMiniApp = [
    "/api/telegram/my-orders",
    "/api/telegram/profile",
    "/api/telegram/state",
    "/api/telegram/notifications",
  ];
  const leaks = [];
  for (const path of protectedMiniApp) {
    const response = await client.get(path, {
      origin: false,
      headers: { "x-forwarded-for": testIp(21) },
    });
    if (response.status === 200) leaks.push({ path, status: response.status });
  }

  if (leaks.length) {
    suite.fail(
      "ASE-ATHN-30",
      "Mini App endpoints reject missing initData",
      "critical",
      leaks,
      "Call authenticateMiniApp() before reading any customer data.",
      ["WSTG-ATHZ-01"]
    );
  } else {
    suite.pass(
      "ASE-ATHN-30",
      "Mini App endpoints reject missing initData",
      "info",
      protectedMiniApp.length
    );
  }

  // ── Error hygiene ────────────────────────────────────────────────────────
  const probe = await postInitData(client, "user=%7B%7D&hash=deadbeef", 22);
  const bodyText = probe.text || "";
  const leaksSecret =
    (botToken && bodyText.includes(botToken)) ||
    /bot\d+:[A-Za-z0-9_-]{20,}/.test(bodyText) ||
    /\bat\s+.*\.(ts|js):\d+:\d+/.test(bodyText);

  if (leaksSecret) {
    suite.fail(
      "ASE-ATHN-31",
      "initData errors do not leak secrets or stack traces",
      "medium",
      bodyText.slice(0, 300),
      "Return a generic error message. Log details server-side only.",
      ["WSTG-ERRH-01"]
    );
  } else {
    suite.pass(
      "ASE-ATHN-31",
      "initData errors do not leak secrets or stack traces",
      "info",
      probe.status
    );
  }

  suite.finish(config);
}

main().catch((error) => {
  if (error instanceof UsageError || error instanceof SafetyError) {
    console.error(`\n[security] ${error.message}\n`);
    process.exit(error.exitCode || 2);
  }
  console.error("\n[security] Telegram initData probes failed:", error);
  process.exit(1);
});
