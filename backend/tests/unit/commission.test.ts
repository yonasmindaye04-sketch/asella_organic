/**
 * backend/tests/unit/commission.test.ts
 * Asella Organic — Commission Arithmetic (no database required)
 *
 * The percentage/cap/threshold rules are pure functions, so they are asserted
 * in isolation here. This is the file that catches the class of bug where a
 * fixed commission ignored max_commission.
 */

import { calculateCommission, round2, type ResolvedRule } from "../../src/lib/commission.js";

const rule = (over: Partial<ResolvedRule> = {}): ResolvedRule => ({
  commissionType: "percentage",
  commissionValue: 10,
  minOrderAmount: 0,
  maxCommission: null,
  source: "global",
  ruleId: null,
  ...over,
});

describe("round2", () => {
  it("removes floating point noise", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });

  it("is a no-op for already-clean values", () => {
    expect(round2(100)).toBe(100);
    expect(round2(12.34)).toBe(12.34);
  });
});

describe("calculateCommission — percentage", () => {
  it("computes a straightforward percentage", () => {
    expect(calculateCommission(rule(), 1500).amount).toBe(150);
  });

  it("is qualified and reports ok", () => {
    const result = calculateCommission(rule(), 1500);
    expect(result.qualified).toBe(true);
    expect(result.reason).toBe("ok");
  });

  it("rounds half-up to 2dp for DECIMAL(12,2)", () => {
    expect(calculateCommission(rule({ commissionValue: 7.5 }), 333.33).amount).toBe(25);
  });

  it("honours the minimum order threshold", () => {
    const r = rule({ minOrderAmount: 300 });
    expect(calculateCommission(r, 299.99).qualified).toBe(false);
    expect(calculateCommission(r, 300).qualified).toBe(true);
  });
});

describe("calculateCommission — caps", () => {
  it("caps a percentage commission at max_commission", () => {
    expect(calculateCommission(rule({ maxCommission: 75 }), 1000).amount).toBe(75);
  });

  it("leaves a percentage below the cap untouched", () => {
    expect(calculateCommission(rule({ maxCommission: 500 }), 1000).amount).toBe(100);
  });

  it("caps a FIXED commission — this was previously skipped", () => {
    const r = rule({ commissionType: "fixed", commissionValue: 500, maxCommission: 120 });
    expect(calculateCommission(r, 1000).amount).toBe(120);
  });

  it("caps a fixed commission that is already under the cap", () => {
    const r = rule({ commissionType: "fixed", commissionValue: 50, maxCommission: 120 });
    expect(calculateCommission(r, 1000).amount).toBe(50);
  });

  it("treats a null cap as uncapped", () => {
    expect(calculateCommission(rule({ maxCommission: null }), 100000).amount).toBe(10000);
  });
});

describe("calculateCommission — safety bounds", () => {
  it("never pays more than the order total", () => {
    const r = rule({ commissionType: "fixed", commissionValue: 5000 });
    expect(calculateCommission(r, 800).amount).toBe(800);
  });

  it("allows a commission exactly equal to the order total", () => {
    const r = rule({ commissionType: "fixed", commissionValue: 800 });
    expect(calculateCommission(r, 800).amount).toBe(800);
  });

  it("never returns a negative amount", () => {
    expect(calculateCommission(rule({ commissionValue: -5 }), 1000).amount).toBe(0);
  });

  it("treats a zero-value rule as unqualified", () => {
    const result = calculateCommission(rule({ commissionValue: 0 }), 1000);
    expect(result.qualified).toBe(false);
    expect(result.reason).toBe("zero_commission");
  });
});

describe("calculateCommission — missing rule", () => {
  it("reports no_rule and pays nothing", () => {
    const result = calculateCommission(null, 5000);
    expect(result.amount).toBe(0);
    expect(result.qualified).toBe(false);
    expect(result.reason).toBe("no_rule");
  });

  it("never throws on a null rule", () => {
    expect(() => calculateCommission(null, 0)).not.toThrow();
  });
});

describe("calculateCommission — zero-value orders", () => {
  it("owes nothing on a zero-total order", () => {
    const result = calculateCommission(rule(), 0);
    expect(result.amount).toBe(0);
    expect(result.qualified).toBe(false);
  });
});
