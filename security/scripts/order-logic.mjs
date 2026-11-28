#!/usr/bin/env node
/**
 * security/scripts/order-logic.mjs
 *
 * Order business-logic tests: pricing integrity, validation, idempotency,
 * concurrency, and public tracking exposure.
 *
 * Active: requires --active and a non-production target.
 * Creates test orders: requires --allow-writes.
 *
 * Usage:
 *   node security/scripts/order-logic.mjs --target https://staging.example.com --active --allow-writes
 */

import crypto from "node:crypto";
import {
  loadConfig,
  assertActiveAllowed,
  writesAllowed,
  credentialsFor,
  UsageError,
  SafetyError,
} from "./lib/config.mjs";
import { createHttpClient, parseJsonBody } from "./lib/http.mjs";
import { createSuite } from "./lib/report.mjs";

let ipCounter = 0;
function rotatingIp() {
  ipCounter += 1;
  const pool = ipCounter % 2 === 0 ? "198.51.100" : "203.0.113";
  return `${pool}.${(ipCounter % 250) + 2}`;
}

function marker() {
  return `SEC-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function randomPhone() {
  return `+2519${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;
}

async function main() {
  const config = loadConfig({ requireTarget: true });
  assertActiveAllowed(config);

  const suite = createSuite({
    id: "order-logic",
    name: "Order business logic and concurrency",
    mode: "active",
    target: config.target,
    description: "Pricing integrity, validation, idempotency, and race conditions",
  });

  const client = createHttpClient(config);
  const canWrite = writesAllowed(config);

  // ── Catalog baseline ─────────────────────────────────────────────────────
  const catalog = await client.get("/api/products?limit=20", { origin: false });
  const products = Array.isArray(catalog.json?.data) ? catalog.json.data : [];

  if (products.length === 0) {
    suite.fail(
      "ASE-BUSL-00",
      "Public catalog returns products",
      "high",
      { status: catalog.status, body: catalog.json?.error },
      "The business-logic tests need at least one product in the staging catalog."
    );
    suite.finish(config);
    return;
  }

  const product = products.find(
    (p) => Number(p.price) > 0 && Number(p.inventory_quantity ?? 0) > 0
  ) || products.find((p) => Number(p.price) > 0);

  suite.pass("ASE-BUSL-00", "Public catalog returns products", "info", {
    count: products.length,
    chosen: { id: product?.id, name: product?.name, price: product?.price },
  });

  // ── Public catalog hygiene ───────────────────────────────────────────────
  const sample = products[0] || {};
  const sensitiveFields = ["unit_cost", "low_stock_threshold"].filter(
    (field) => field in sample
  );
  if (sensitiveFields.length) {
    suite.fail(
      "ASE-BUSL-01",
      "Public catalog does not expose cost fields",
      "medium",
      sensitiveFields,
      "Remove unit_cost and low_stock_threshold from the public product projection.",
      ["SECURITY_REVIEW.md I"]
    );
  } else {
    suite.pass("ASE-BUSL-01", "Public catalog does not expose cost fields", "info");
  }

  if ("inventory_quantity" in sample) {
    suite.warn(
      "ASE-BUSL-02",
      "Public catalog does not expose inventory levels",
      "medium",
      { fields: ["inventory_quantity"], sample: sample.inventory_quantity },
      "Expose a coarse availability flag instead of exact counts, or gate the field.",
      ["SECURITY_REVIEW.md I"]
    );
  } else {
    suite.pass("ASE-BUSL-02", "Public catalog does not expose inventory levels", "info");
  }

  const archived = await client.get("/api/products?active=false&limit=20", {
    origin: false,
  });
  const archivedProducts = Array.isArray(archived.json?.data) ? archived.json.data : [];
  if (archivedProducts.length > 0) {
    suite.fail(
      "ASE-BUSL-03",
      "Archived products are not enumerable without authentication",
      "medium",
      { count: archivedProducts.length, sample: archivedProducts[0]?.name },
      "Ignore the active query parameter for anonymous callers and require a role for archived listings.",
      ["WSTG-ATHZ-01", "SECURITY_REVIEW.md I"]
    );
  } else {
    suite.pass(
      "ASE-BUSL-03",
      "Archived products are not enumerable without authentication",
      "info"
    );
  }

  // ── Read-only checks that do not write ───────────────────────────────────
  const anonymousDetail = await client.get(
    "/api/orders/00000000-0000-0000-0000-000000000000",
    { origin: false }
  );
  if ([401, 403].includes(anonymousDetail.status)) {
    suite.pass(
      "ASE-BUSL-04",
      "Order detail requires authentication",
      "info",
      anonymousDetail.status
    );
  } else {
    suite.fail(
      "ASE-BUSL-04",
      "Order detail requires authentication",
      "critical",
      { status: anonymousDetail.status },
      "Add authenticate() to GET /api/orders/:id.",
      ["WSTG-ATHZ-01"]
    );
  }

  if (!canWrite) {
    suite.skip(
      "ASE-BUSL-10",
      "Order write tests (pricing, validation, idempotency, races)",
      "critical",
      "Requires --allow-writes. The target keeps its data untouched."
    );
    suite.finish(config);
    return;
  }

  // ── Helpers for order creation ───────────────────────────────────────────
  const run = marker();

  function orderBody(overrides = {}) {
    return {
      customer_name: `Security Probe ${run}`.slice(0, 100),
      phone: randomPhone(),
      city: "Addis Ababa",
      location: `Security Test ${run}`,
      source: "other",
      order_type: "delivery",
      notes: `security-suite ${run}`,
      items: [
        {
          product_id: product.id,
          name: product.name,
          package_size: product.package_size || "Standard",
          quantity: 1,
          unit_price: Number(product.price),
        },
      ],
      ...overrides,
    };
  }

  async function createOrder(body, extraHeaders = {}) {
    return client.post("/api/orders", body, {
      headers: { "x-forwarded-for": rotatingIp(), ...extraHeaders },
    });
  }

  // ── Baseline: catalog price is honoured ──────────────────────────────────
  const baseline = await createOrder(orderBody());
  const baselineTotal = Number(baseline.json?.data?.total);
  const expectedTotal = Number(product.price);

  if (baseline.status === 201 && Math.abs(baselineTotal - expectedTotal) < 0.01) {
    suite.pass(
      "ASE-BUSL-10",
      "Order total matches the catalog price",
      "info",
      { orderId: baseline.json?.data?.id, total: baselineTotal, expected: expectedTotal }
    );
  } else {
    suite.fail(
      "ASE-BUSL-10",
      "Order total matches the catalog price",
      "medium",
      { status: baseline.status, total: baselineTotal, expected: expectedTotal },
      "Resolve the unit price from the catalog on the server.",
      ["SECURITY_REVIEW.md C"]
    );
  }

  // ── Price tampering ──────────────────────────────────────────────────────
  const tamperedPrice = Number(product.price) / 100;
  const tampered = await createOrder(
    orderBody({
      items: [
        {
          product_id: product.id,
          name: product.name,
          package_size: product.package_size || "Standard",
          quantity: 1,
          unit_price: tamperedPrice,
        },
      ],
    })
  );
  const tamperedTotal = Number(tampered.json?.data?.total);

  if (tampered.status === 201 && tamperedTotal < expectedTotal) {
    suite.fail(
      "ASE-BUSL-11",
      "Client cannot set the order unit price",
      "critical",
      {
        orderId: parseJsonBody(tampered).value?.data?.id,
        submittedUnitPrice: tamperedPrice,
        catalogPrice: expectedTotal,
        acceptedTotal: tamperedTotal,
        note: "The order total followed the client-supplied unit_price.",
      },
      "Ignore client unit_price and resolve it from products.price inside the order transaction. This also protects affiliate commission calculations.",
      ["SECURITY_REVIEW.md C", "CWE-472"]
    );
  } else if (tampered.status === 201) {
    suite.pass(
      "ASE-BUSL-11",
      "Client cannot set the order unit price",
      "info",
      { total: tamperedTotal, catalogPrice: expectedTotal }
    );
  } else {
    suite.warn(
      "ASE-BUSL-11",
      "Client cannot set the order unit price",
      "medium",
      { status: tampered.status, error: tampered.json?.error },
      "The request was rejected. Confirm the order flow still works for customers."
    );
  }

  // ── Input validation ─────────────────────────────────────────────────────
  const negativePrice = await createOrder(
    orderBody({
      items: [
        {
          product_id: product.id,
          name: product.name,
          package_size: product.package_size || "Standard",
          quantity: 1,
          unit_price: -100,
        },
      ],
    })
  );
  if ([400, 422].includes(negativePrice.status)) {
    suite.pass(
      "ASE-BUSL-12",
      "Negative unit price is rejected",
      "info",
      negativePrice.status
    );
  } else {
    suite.fail(
      "ASE-BUSL-12",
      "Negative unit price is rejected",
      "high",
      { status: negativePrice.status, total: negativePrice.json?.data?.total },
      "Keep z.coerce.number().min(0) on unit_price and reject negatives server-side.",
      ["WSTG-INPV-05"]
    );
  }

  const badQuantity = await createOrder(
    orderBody({
      items: [
        {
          product_id: product.id,
          name: product.name,
          package_size: product.package_size || "Standard",
          quantity: 0,
          unit_price: Number(product.price),
        },
      ],
    })
  );
  if ([400, 422].includes(badQuantity.status)) {
    suite.pass("ASE-BUSL-13", "Non-positive quantity is rejected", "info", badQuantity.status);
  } else {
    suite.fail(
      "ASE-BUSL-13",
      "Non-positive quantity is rejected",
      "high",
      { status: badQuantity.status },
      "Reject quantities that are not positive integers.",
      ["WSTG-INPV-05"]
    );
  }

  const unknownProduct = await createOrder(
    orderBody({
      items: [
        {
          product_id: "00000000-0000-0000-0000-000000000000",
          name: "Ghost Product",
          package_size: "Standard",
          quantity: 1,
          unit_price: 1,
        },
      ],
    })
  );
  if ([400, 404, 422].includes(unknownProduct.status)) {
    suite.pass(
      "ASE-BUSL-14",
      "Unknown product ids are rejected",
      "info",
      unknownProduct.status
    );
  } else {
    suite.fail(
      "ASE-BUSL-14",
      "Unknown product ids are rejected",
      "medium",
      { status: unknownProduct.status },
      "Resolve every line against the catalog and reject unknown product ids.",
      ["SECURITY_REVIEW.md C"]
    );
  }

  const totalInjection = await createOrder(orderBody({ total: 1 }));
  const injectedTotal = Number(totalInjection.json?.data?.total);
  if (
    totalInjection.status === 201 &&
    Math.abs(injectedTotal - expectedTotal) < 0.01
  ) {
    suite.pass(
      "ASE-BUSL-15",
      "Client-supplied total is ignored",
      "info",
      { total: injectedTotal }
    );
  } else if (totalInjection.status === 201) {
    suite.fail(
      "ASE-BUSL-15",
      "Client-supplied total is ignored",
      "high",
      { submitted: 1, accepted: injectedTotal },
      "Compute the total on the server from resolved catalog prices.",
      ["CWE-472"]
    );
  } else {
    suite.warn(
      "ASE-BUSL-15",
      "Client-supplied total is ignored",
      "low",
      { status: totalInjection.status },
      "The request was rejected; confirm the order flow still works."
    );
  }

  // ── Idempotency ──────────────────────────────────────────────────────────
  const idemKey = `security-idem-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const idemBody = orderBody();
  const first = await createOrder(idemBody, { "Idempotency-Key": idemKey });
  const second = await createOrder(idemBody, { "Idempotency-Key": idemKey });

  // The replayed body may be double-encoded, so it is normalised before the
  // order ids are compared.
  const firstParsed = parseJsonBody(first);
  const secondParsed = parseJsonBody(second);
  const firstId = firstParsed.value?.data?.id ?? null;
  const secondId = secondParsed.value?.data?.id ?? null;
  const wasReplayed = second.headers["idempotency-replay"] === "true";

  if (
    first.status === 201 &&
    second.status === 201 &&
    firstId &&
    firstId === secondId
  ) {
    suite.pass(
      "ASE-BUSL-16",
      "Repeated Idempotency-Key does not create a second order",
      "info",
      { orderId: firstId, replay: wasReplayed }
    );
  } else if (second.status === 409) {
    suite.pass(
      "ASE-BUSL-16",
      "Repeated Idempotency-Key does not create a second order",
      "info",
      { firstStatus: first.status, secondStatus: second.status }
    );
  } else {
    suite.fail(
      "ASE-BUSL-16",
      "Repeated Idempotency-Key does not create a second order",
      "medium",
      {
        firstStatus: first.status,
        firstId,
        secondStatus: second.status,
        secondId,
        replay: wasReplayed,
        note: wasReplayed
          ? "The response was a replay but did not carry the original order id."
          : "The second request created a separate order.",
      },
      "Return the cached response for the same key and payload.",
      ["CWE-294"]
    );
  }

  // ── Replay body fidelity ─────────────────────────────────────────────────
  // The idempotency middleware caches the response body. If the cached value
  // is a string that contains JSON, the replay returns a JSON *string* rather
  // than the response object, and clients cannot read the payload.
  if (wasReplayed) {
    if (secondParsed.doubleEncoded) {
      suite.fail(
        "ASE-BUSL-05",
        "Idempotency replay returns the original response body",
        "medium",
        {
          status: second.status,
          note: "The replayed body was double-encoded: the client received a JSON string instead of the response object.",
          rawPrefix: (second.text || "").slice(0, 120),
        },
        "Capture the response object before res.json serialises it. In backend/src/middleware/idempotency.ts the res.send wrapper overwrites the body captured by the res.json wrapper with the already-serialised string, so JSON.stringify double-encodes the stored body.",
        ["CWE-294", "backend/src/middleware/idempotency.ts"]
      );
    } else {
      suite.pass(
        "ASE-BUSL-05",
        "Idempotency replay returns the original response body",
        "info",
        { status: second.status }
      );
    }
  } else {
    suite.skip(
      "ASE-BUSL-05",
      "Idempotency replay returns the original response body",
      "medium",
      "No replay was observed, so the cached body could not be inspected."
    );
  }

  const conflictBody = orderBody({ city: "Addis Ababa B" });
  const conflict = await createOrder(conflictBody, { "Idempotency-Key": idemKey });
  if (conflict.status === 409) {
    suite.pass(
      "ASE-BUSL-17",
      "Reusing an Idempotency-Key with a different payload is rejected",
      "info",
      conflict.status
    );
  } else {
    suite.fail(
      "ASE-BUSL-17",
      "Reusing an Idempotency-Key with a different payload is rejected",
      "medium",
      { status: conflict.status, orderId: conflict.json?.data?.id },
      "Return 409 Conflict when the key is reused with a different request hash.",
      ["CWE-294"]
    );
  }

  // Cross-client collision: the middleware runs before authentication, so keys
  // are stored with user_id NULL and are global.
  const sharedKey = `security-shared-${Date.now()}`;
  const sharedBody = orderBody();
  const clientA = await createOrder(sharedBody, { "Idempotency-Key": sharedKey });
  const clientB = await createOrder(sharedBody, { "Idempotency-Key": sharedKey });

  const aId = parseJsonBody(clientA).value?.data?.id ?? null;
  const bParsed = parseJsonBody(clientB);
  const bId = bParsed.value?.data?.id ?? null;
  const bReplayed = clientB.headers["idempotency-replay"] === "true";

  if (bReplayed && aId && bId === aId) {
    // The second client received the first client's cached order instead of
    // creating its own. The key namespace is global, so one client's key can
    // replay — or, with a different payload, block — another client's order.
    suite.fail(
      "ASE-BUSL-18",
      "Idempotency keys are scoped to the requesting client",
      "medium",
      {
        firstOrderId: aId,
        secondOrderId: bId,
        replayHeader: clientB.headers["idempotency-replay"],
        note: "A second client reusing the key received the first client's cached order instead of creating its own.",
      },
      "Scope idempotency keys to the authenticated user, or to a client-generated nonce for anonymous routes.",
      ["CWE-294", "SECURITY_REVIEW.md L"]
    );
  } else if (clientB.status === 409) {
    suite.fail(
      "ASE-BUSL-18",
      "Idempotency keys are scoped to the requesting client",
      "medium",
      {
        firstStatus: clientA.status,
        secondStatus: clientB.status,
        note: "A second client was rejected with 409 by the first client's key, so the key namespace is global.",
      },
      "Scope idempotency keys to the authenticated user, or to a client-generated nonce for anonymous routes.",
      ["CWE-294", "SECURITY_REVIEW.md L"]
    );
  } else {
    suite.pass(
      "ASE-BUSL-18",
      "Idempotency keys are scoped to the requesting client",
      "info",
      {
        firstOrderId: aId,
        secondOrderId: bId,
        secondStatus: clientB.status,
      }
    );
  }

  // ── Concurrency: identical simultaneous requests ─────────────────────────
  // ── Concurrency: identical simultaneous requests ─────────────────────────
  // The race is intermittent, so several rounds are run. A single clean round
  // proves nothing when a later round would have caught it.
  const RACE_ROUNDS = 3;
  const raceRounds = [];

  for (let round = 1; round <= RACE_ROUNDS; round += 1) {
    const raceKey = `security-race-${Date.now()}-${round}`;
    const raceBody = orderBody();
    const raceResults = await Promise.all(
      Array.from({ length: 8 }, () =>
        createOrder(raceBody, { "Idempotency-Key": raceKey })
      )
    );

    // Replayed bodies may be double-encoded, so they are normalised before
    // the order ids are compared.
    const raceIds = new Set(
      raceResults
        .filter((r) => r.status === 201)
        .map((r) => parseJsonBody(r).value?.data?.id)
        .filter(Boolean)
    );

    raceRounds.push({
      round,
      responses: raceResults.map((r) => r.status),
      distinctOrderIds: raceIds.size,
    });
  }

  const duplicated = raceRounds.filter((r) => r.distinctOrderIds > 1);

  if (duplicated.length === 0 && raceRounds.some((r) => r.distinctOrderIds >= 1)) {
    suite.pass(
      "ASE-BUSL-19",
      "Concurrent identical requests create one order",
      "info",
      { rounds: raceRounds }
    );
  } else {
    suite.fail(
      "ASE-BUSL-19",
      "Concurrent identical requests create one order",
      "high",
      {
        rounds: raceRounds,
        duplicatedRounds: duplicated.length,
        note: "The idempotency check is not atomic, so parallel retries created duplicate orders.",
      },
      "Reserve the key with an atomic insert (UNIQUE index) before running the handler.",
      ["CWE-362", "CWE-294"]
    );
  }

  // ── Public tracking exposure ─────────────────────────────────────────────
  const trackOrderId = parseJsonBody(baseline).value?.data?.id;
  if (trackOrderId) {
    const track = await client.get(`/api/orders/track/${trackOrderId}`, { origin: false });
    const body = track.json?.data || track.json || {};
    const leakedFields = ["phone", "location", "notes", "customer_name"].filter(
      (field) => field in body && body[field]
    );

    if (leakedFields.length) {
      suite.fail(
        "ASE-BUSL-20",
        "Public order tracking does not expose customer contact details",
        "medium",
        { orderId: trackOrderId, leakedFields, sample: leakedFields.slice(0, 2) },
        "Return only status, order type, and a coarse delivery estimate from the public tracking endpoint. Require a matching phone or an order token for details.",
        ["SECURITY_REVIEW.md J", "CWE-200"]
      );
    } else {
      suite.pass(
        "ASE-BUSL-20",
        "Public order tracking does not expose customer contact details",
        "info",
        { orderId: trackOrderId, fields: Object.keys(body) }
      );
    }
  }

  // ── Receipt path smuggling in notes ──────────────────────────────────────
  const smuggleBody = orderBody({
    notes: `receipt: /api/receipts/receipt-aaaaaaaaaaaaaaaaaaaaaaaa-1.png\nsecurity-suite ${run}`,
  });
  const smuggle = await createOrder(smuggleBody);
  if (smuggle.status === 201) {
    const track = await client.get(`/api/orders/track/${parseJsonBody(smuggle).value?.data?.id}`, {
      origin: false,
    });
    const notes = track.json?.data?.notes || "";
    if (String(notes).includes("receipt:")) {
      suite.fail(
        "ASE-BUSL-21",
        "Receipt paths are stripped from public order notes",
        "medium",
        { notes: String(notes).slice(0, 200) },
        "Keep the receipt: line filter applied to the public tracking response.",
        ["CWE-200"]
      );
    } else {
      suite.pass(
        "ASE-BUSL-21",
        "Receipt paths are stripped from public order notes",
        "info",
        notes
      );
    }
  }

  // ── Order id entropy ─────────────────────────────────────────────────────
  if (trackOrderId) {
    const suffix = String(trackOrderId).split("-").pop() || "";

    // The alphabet has to be detected from the suffix itself. A hex string
    // that happens to contain a digit is still base 16 — treating it as
    // base 10 understates the entropy by a quarter.
    const alphabetSize = /^[0-9a-f]+$/i.test(suffix)
      ? 16
      : /^[0-9]+$/.test(suffix)
        ? 10
        : /^[0-9a-z]+$/i.test(suffix)
          ? 36
          : 62;
    const entropy = Math.log2(alphabetSize) * suffix.length;

    if (suffix.length < 8 || entropy < 32) {
      suite.warn(
        "ASE-BUSL-22",
        "Order ids have enough unguessable entropy",
        "medium",
        { orderId: trackOrderId, suffix, alphabetSize, approxBits: Math.round(entropy) },
        "Use a longer random suffix or a UUID so public tracking cannot be enumerated.",
        ["CWE-330"]
      );
    } else {
      suite.pass(
        "ASE-BUSL-22",
        "Order ids have enough unguessable entropy",
        "info",
        { orderId: trackOrderId, suffix, alphabetSize, approxBits: Math.round(entropy) }
      );
    }
  }

  // ── Oversell risk ────────────────────────────────────────────────────────
  const stock = Number(product.inventory_quantity ?? 0);
  if (stock > 0) {
    const oversell = await createOrder(
      orderBody({
        items: [
          {
            product_id: product.id,
            name: product.name,
            package_size: product.package_size || "Standard",
            quantity: stock + 1000,
            unit_price: Number(product.price),
          },
        ],
      })
    );
    if ([400, 409, 422].includes(oversell.status)) {
      suite.pass("ASE-BUSL-23", "Orders above available stock are rejected", "info", oversell.status);
    } else {
      suite.warn(
        "ASE-BUSL-23",
        "Orders above available stock are rejected",
        "medium",
        {
          status: oversell.status,
          requested: stock + 1000,
          available: stock,
          note: "Stock is not checked at order time, so overselling is possible until fulfilment.",
        },
        "Reserve stock in the order transaction or validate quantity against available stock at order time."
      );
    }
  } else {
    suite.skip(
      "ASE-BUSL-23",
      "Orders above available stock are rejected",
      "medium",
      "No stock information for the chosen product."
    );
  }

  // ── Concurrent status transition (admin) ─────────────────────────────────
  const adminCreds = credentialsFor(config, "admin") || credentialsFor(config, "manager");
  if (adminCreds && trackOrderId) {
    const staffClient = createHttpClient(config);
    const staffLogin = await staffClient.login(adminCreds.username, adminCreds.password, {
      headers: { "x-forwarded-for": rotatingIp() },
    });

    if (staffLogin.token) {
      const raceOrder = await createOrder(orderBody());
      if (raceOrder.status === 201) {
        const raceOrderId = parseJsonBody(raceOrder).value?.data?.id;
        const transitions = await Promise.all([
          staffClient.patch(
            `/api/orders/${raceOrderId}/status`,
            { status: "Delivered" },
            { token: staffLogin.token, headers: { "x-forwarded-for": rotatingIp() } }
          ),
          staffClient.patch(
            `/api/orders/${raceOrderId}/status`,
            { status: "Delivered" },
            { token: staffLogin.token, headers: { "x-forwarded-for": rotatingIp() } }
          ),
        ]);

        const successes = transitions.filter((t) => t.status >= 200 && t.status < 300);
        if (successes.length > 1) {
          suite.fail(
            "ASE-BUSL-24",
            "Concurrent status transitions are applied once",
            "high",
            {
              orderId: raceOrderId,
              statuses: transitions.map((t) => t.status),
              note: "Two simultaneous Delivered transitions were both accepted. Inventory deduction and the affiliate commission trigger may have run twice.",
            },
            "Lock the order row (SELECT ... FOR UPDATE) or use a conditional update (UPDATE ... WHERE status = ?) so the transition applies once.",
            ["CWE-362", "SECURITY_REVIEW.md"]
          );
        } else {
          suite.pass(
            "ASE-BUSL-24",
            "Concurrent status transitions are applied once",
            "info",
            { orderId: raceOrderId, statuses: transitions.map((t) => t.status) }
          );
        }

        // Put the order back to a neutral state for the staging team.
        await staffClient.patch(
          `/api/orders/${raceOrderId}/status`,
          { status: "Cancelled" },
          { token: staffLogin.token, headers: { "x-forwarded-for": rotatingIp() } }
        );
      }
    } else {
      suite.skip(
        "ASE-BUSL-24",
        "Concurrent status transitions are applied once",
        "high",
        "Staff login failed."
      );
    }
  } else {
    suite.skip(
      "ASE-BUSL-24",
      "Concurrent status transitions are applied once",
      "high",
      "No admin or manager credentials configured."
    );
  }

  suite.finish(config);
}

main().catch((error) => {
  if (error instanceof UsageError || error instanceof SafetyError) {
    console.error(`\n[security] ${error.message}\n`);
    process.exit(error.exitCode || 2);
  }
  console.error("\n[security] order logic tests failed:", error);
  process.exit(1);
});
