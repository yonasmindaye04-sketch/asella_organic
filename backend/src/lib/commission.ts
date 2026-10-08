/**
 * src/lib/commission.ts
 * Asella Organic — Commission Rule Resolution (MySQL)
 *
 * Single source of truth for "which rule applies, and how much is owed".
 * The MySQL trigger `trg_order_delivered_commission` implements the same
 * resolution in SQL (triggers cannot call application code); keep the two in
 * step. `backend/tests/integration/commission-rules.test.ts` asserts they agree.
 *
 * Precedence, in order:
 *   1. Individual rule  — only when affiliate_profiles.rule_type = 'custom'
 *                         AND that rule row is_active = TRUE
 *   2. Global rule      — the active referral_configs row, newest first
 *
 * A profile with rule_type = 'custom' but no active rule row therefore falls
 * back to the global rule rather than silently paying nothing.
 */

import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

export type CommissionType = "percentage" | "fixed";
export type RuleSource = "global" | "individual";

export interface ResolvedRule {
  commissionType: CommissionType;
  commissionValue: number;
  minOrderAmount: number;
  maxCommission: number | null;
  source: RuleSource;
  ruleId: string | null;
}

interface RuleRow extends RowDataPacket {
  commission_type: CommissionType;
  commission_value: string | number;
  min_order_amount: string | number | null;
  max_commission: string | number | null;
  id: string;
}

type Executor = Pool | PoolConnection;

/**
 * Resolve the rule that governs `affiliateId` at credit time.
 * Returns null when neither an individual nor a global rule is configured,
 * in which case no commission is owed.
 */
export async function resolveRule(
  executor: Executor,
  affiliateId: string,
): Promise<ResolvedRule | null> {
  const [individual] = await executor.query(
    `SELECT r.id, r.commission_type, r.commission_value,
            r.min_order_amount, r.max_commission
     FROM   affiliate_profiles ap
     JOIN   affiliate_commission_rules r
            ON r.affiliate_id = ap.id AND r.is_active = TRUE
     WHERE  ap.id = ? AND ap.rule_type = 'custom' AND ap.deleted_at IS NULL
     LIMIT  1`,
    [affiliateId],
  ) as [RuleRow[], unknown];

  if (individual.length > 0) {
    const r = individual[0]!;
    return {
      commissionType: r.commission_type,
      commissionValue: Number(r.commission_value),
      minOrderAmount: Number(r.min_order_amount ?? 0),
      maxCommission: r.max_commission == null ? null : Number(r.max_commission),
      source: "individual",
      ruleId: r.id,
    };
  }

  const [global] = await executor.query(
    `SELECT id, commission_type, commission_value, min_order_amount, max_commission
     FROM   referral_configs
     WHERE  is_active = TRUE
     ORDER  BY created_at DESC
     LIMIT  1`,
  ) as [RuleRow[], unknown];

  if (global.length === 0) return null;

  const r = global[0]!;
  return {
    commissionType: r.commission_type,
    commissionValue: Number(r.commission_value),
    minOrderAmount: Number(r.min_order_amount ?? 0),
    maxCommission: r.max_commission == null ? null : Number(r.max_commission),
    source: "global",
    ruleId: r.id,
  };
}

export interface CommissionBreakdown {
  amount: number;
  qualified: boolean;
  reason: "ok" | "below_minimum" | "zero_commission" | "no_rule";
}

/**
 * Apply a resolved rule to an order total.
 *
 * The cap is applied to fixed commissions as well as percentage ones — the
 * original application path skipped it for fixed rules, which let a flat
 * commission exceed the cap. The result is additionally clamped to the order
 * total so a payout can never exceed the sale itself.
 */
export function calculateCommission(
  rule: ResolvedRule | null,
  orderTotal: number,
): CommissionBreakdown {
  if (!rule) return { amount: 0, qualified: false, reason: "no_rule" };

  if (orderTotal < rule.minOrderAmount) {
    return { amount: 0, qualified: false, reason: "below_minimum" };
  }

  let amount =
    rule.commissionType === "percentage"
      ? (orderTotal * rule.commissionValue) / 100
      : rule.commissionValue;

  if (rule.maxCommission != null && amount > rule.maxCommission) {
    amount = rule.maxCommission;
  }
  if (amount > orderTotal) {
    amount = orderTotal;
  }
  if (amount < 0) {
    amount = 0;
  }
  amount = round2(amount);

  if (amount <= 0) return { amount: 0, qualified: false, reason: "zero_commission" };

  return { amount, qualified: true, reason: "ok" };
}

/** Money-safe rounding — DECIMAL(12,2) columns must not receive float noise. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Resolve + calculate in one step. Used by report previews so the figure an
 * affiliate is shown can never be produced by a different code path than the
 * one that actually credits the ledger.
 */
export async function quoteCommission(
  executor: Executor,
  affiliateId: string,
  orderTotal: number,
): Promise<{ rule: ResolvedRule | null; result: CommissionBreakdown }> {
  const rule = await resolveRule(executor, affiliateId);
  return { rule, result: calculateCommission(rule, orderTotal) };
}
