/**
 * backend/tests/unit/entity-id.test.ts
 * Asella Organic — Shared entity id validation (lib/ids.ts)
 *
 * Every id-bearing table is `CHAR(36) DEFAULT (UUID())`, but the import writes
 * prefixed ids. A hex-UUID regex rejects any prefix that isn't hex digits:
 *
 *   customers           cu000034-...   FAILS a UUID regex
 *   products            pr000001-...   FAILS
 *   customer_ratings    rat00001-...   FAILS
 *   staff_users         a0000001-...   passes (a and digits are hex)
 *   affiliate_profiles  af000001-...   passes (a and f are hex)
 *
 * That asymmetry is the trap: staff and affiliate ids happened to survive a
 * UUID check, so the copied regexes looked correct there while 404ing every
 * real customer. These cases pin all five formats so a future tightening of
 * the gate cannot silently re-break one of them.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { isEntityId, entityIdParam } from "../../src/lib/ids.js";

describe("isEntityId", () => {
  it("accepts every id format actually present in the database", () => {
    for (const id of [
      "cu000034-0000-0000-0000-000000000034", // customers
      "pr000001-0000-0000-0000-000000000001", // products
      "rat00001-0000-0000-0000-000000000008", // customer_ratings
      "a0000001-0000-0000-0000-000000000001", // staff_users
      "af000001-0000-0000-0000-000000000001", // affiliate_profiles
      "9091c337-c422-11f1-9548-a954a7497a86", // genuine UUID (vendor_orders)
      "cu000001",                             // short / unseparated
      "A1_b2-C3",                             // case + underscore
    ]) {
      expect(isEntityId(id)).toBe(true);
    }
  });

  it("rejects ids that would be unsafe to interpolate or path-traverse", () => {
    for (const bad of [
      "",
      "cu 000034",                             // whitespace
      "cu000034/../admin",                     // path traversal
      "../../etc/passwd",
      "cu000034\\..\\admin",                   // windows traversal
      "' OR 1=1--",                             // quote injection
      "cu000034'; DROP TABLE customers;--",
      "cu%",                                   // LIKE wildcard
      "cu*",
      "a".repeat(65),                          // over the length bound
      "cu\n000034",                            // control char
    ]) {
      expect(isEntityId(bad), `expected ${JSON.stringify(bad)} to be rejected`).toBe(false);
    }
  });

  it("rejects non-string input", () => {
    for (const bad of [null, undefined, 42, {}, [], true, Symbol("x")]) {
      expect(isEntityId(bad)).toBe(false);
    }
  });
});

describe("entityIdParam", () => {
  it("unwraps express array params", () => {
    expect(entityIdParam(["cu000034-0000-0000-0000-000000000034"]))
      .toBe("cu000034-0000-0000-0000-000000000034");
  });

  it("passes through a plain string param", () => {
    expect(entityIdParam("af000001-0000-0000-0000-000000000001"))
      .toBe("af000001-0000-0000-0000-000000000001");
  });

  it("returns null for missing or malformed params", () => {
    expect(entityIdParam(undefined)).toBeNull();
    expect(entityIdParam("")).toBeNull();
    expect(entityIdParam("bad id")).toBeNull();
    expect(entityIdParam(["bad id"])).toBeNull();
    expect(entityIdParam([["nested"]])).toBeNull();
  });
});