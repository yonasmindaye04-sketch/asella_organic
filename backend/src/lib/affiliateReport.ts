/**
 * src/lib/affiliateReport.ts
 * Asella Organic — Affiliate Sales & Engagement Reporting (MySQL)
 *
 * Builds the figures that power both the affiliate portal summary and the
 * emailed report. Every aggregate is computed from the `referral_commissions`
 * ledger rather than from the denormalised `affiliate_profiles` counters, which
 * historically drifted because only one of the two crediting paths maintained
 * them.
 *
 * Privacy: no customer names or phone numbers are ever selected here. An
 * affiliate learns how many people they referred and how much that was worth —
 * never who those people are. See PrivacyPolicy.tsx, which promises referral
 * data is used only to calculate commissions for authorised brand partners.
 */

import type { Pool, PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import { sendMail } from "./mailer.js";

export interface Period {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}

export interface SalesTotals {
  orders: number;
  grossSales: number;
  commissionEarned: number;  // credited in period (delivered orders)
  commissionPaid: number;
  commissionPending: number;
  commissionReversed: number;
  clawback: number;
  netEarned: number;
}

export interface EngagementTotals {
  linkClicks: number;
  uniqueVisitors: number;
  referredCustomers: number;
  convertedCustomers: number;
  conversionRate: number;    // 0..1
}

export interface AffiliateReportData extends SalesTotals, EngagementTotals {
  affiliateName: string;
  referralCode: string;
  period: Period;
  commissionRule: string;
  lifetime: {
    totalEarned: number;
    totalPaid: number;
    totalPending: number;
    clawbackPending: number;
    customers: number;
    orders: number;
    grossSales: number;
  };
  recentOrders: Array<{
    orderId: string | null;
    date: string | null;
    orderTotal: number;
    commission: number;
    status: string;
    ruleSource: string;
  }>;
}

type Executor = Pool | PoolConnection;

const num = (v: unknown): number => Number(v ?? 0);
const money = (v: number): string =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Build the human-readable rule description for the email header. */
export async function describeRule(
  executor: Executor,
  affiliateId: string,
): Promise<string> {
  const [rows] = await executor.query(
    `SELECT ap.rule_type, r.commission_type, r.commission_value,
            r.min_order_amount, r.max_commission,
            g.commission_type AS g_type, g.commission_value AS g_value,
            g.min_order_amount AS g_min, g.max_commission AS g_max
     FROM   affiliate_profiles ap
     LEFT   JOIN affiliate_commission_rules r
            ON r.affiliate_id = ap.id AND r.is_active = TRUE
     LEFT   JOIN referral_configs g
            ON g.is_active = TRUE
     WHERE  ap.id = ?`,
    [affiliateId],
  ) as [RowDataPacket[], unknown];

  const row = rows[0] as RowDataPacket | undefined;

  const fmt = (
    type: string | null,
    value: unknown,
    min: unknown,
    max: unknown,
  ): string => {
    if (!type) return "not configured";
    const pct = type === "percentage" ? `${num(value)}%` : `ETB ${money(num(value))}`;
    const floor = num(min) > 0 ? ` (orders from ETB ${money(num(min))})` : "";
    const cap = max == null ? "" : `, capped at ETB ${money(num(max))}`;
    return `${pct}${floor}${cap}`;
  };

  if (!row) return "not configured";

  if (row.rule_type === "custom" && row.commission_type) {
    return `${fmt(row.commission_type, row.commission_value, row.min_order_amount, row.max_commission)} — individual rate`;
  }
  return `${fmt(row.g_type, row.g_value, row.g_min, row.g_max)} — standard rate`;
}

export async function buildAffiliateReport(
  executor: Executor,
  affiliateId: string,
  period: Period,
): Promise<AffiliateReportData> {
  const [profileRows] = await executor.query(
    `SELECT ap.referral_code, COALESCE(ap.full_name, s.full_name, 'Affiliate') AS name
     FROM   affiliate_profiles ap
     LEFT   JOIN staff_users s ON s.id = ap.user_id
     WHERE  ap.id = ?`,
    [affiliateId],
  ) as [RowDataPacket[], unknown];
  const profile = profileRows[0] as RowDataPacket | undefined;

  const from = `${period.start} 00:00:00`;
  const to = `${period.end} 23:59:59`;

  // ── Period sales, straight off the ledger ────────────────────────────────
  const [salesRows] = await executor.query(
    `SELECT
       COUNT(*)                                                        AS orders,
       COALESCE(SUM(rc.order_total), 0)                                AS gross_sales,
       COALESCE(SUM(CASE WHEN rc.status = 'pending'  THEN rc.commission_amount ELSE 0 END), 0) AS pending,
       COALESCE(SUM(CASE WHEN rc.status = 'paid'     THEN rc.commission_amount ELSE 0 END), 0) AS paid,
       COALESCE(SUM(CASE WHEN rc.status = 'reversed' THEN rc.commission_amount ELSE 0 END), 0) AS reversed,
       COALESCE(SUM(CASE WHEN rc.status = 'paid' AND rc.clawback_settled = 1
                         THEN rc.commission_amount ELSE 0 END), 0)       AS clawback
     FROM  referral_commissions rc
     WHERE rc.affiliate_id = ?
       AND rc.calculated_at BETWEEN ? AND ?`,
    [affiliateId, from, to],
  ) as [RowDataPacket[], unknown];

  const s = (salesRows[0] ?? {}) as RowDataPacket;

  // ── Period engagement ────────────────────────────────────────────────────
  const [clickRows] = await executor.query(
    `SELECT COUNT(*) AS clicks,
            COUNT(DISTINCT visitor_hash) AS unique_visitors
     FROM   referral_clicks
     WHERE  affiliate_id = ? AND created_at BETWEEN ? AND ?`,
    [affiliateId, from, to],
  ) as [RowDataPacket[], unknown];
  const c = (clickRows[0] ?? {}) as RowDataPacket;

  const [custRows] = await executor.query(
    `SELECT COUNT(*) AS referred,
            COUNT(DISTINCT CASE WHEN rc.order_id IS NOT NULL THEN c.id END) AS converted
     FROM   customers c
     LEFT   JOIN referral_commissions rc ON rc.customer_id = c.id
     WHERE  c.referred_by_affiliate_id = ?
       AND  c.deleted_at IS NULL
       AND  c.referred_at BETWEEN ? AND ?`,
    [affiliateId, from, to],
  ) as [RowDataPacket[], unknown];
  const cu = (custRows[0] ?? {}) as RowDataPacket;

  // ── Lifetime totals ─────────────────────────────────────────────────────
  const [lifeRows] = await executor.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status <> 'reversed' THEN commission_amount ELSE 0 END), 0) AS earned,
       COALESCE(SUM(CASE WHEN status = 'paid'     THEN commission_amount ELSE 0 END), 0) AS paid,
       COALESCE(SUM(CASE WHEN status = 'pending'  THEN commission_amount ELSE 0 END), 0) AS pending,
       COUNT(*) AS orders,
       COALESCE(SUM(order_total), 0) AS gross
     FROM  referral_commissions
     WHERE affiliate_id = ?`,
    [affiliateId],
  ) as [RowDataPacket[], unknown];
  const l = (lifeRows[0] ?? {}) as RowDataPacket;

  const [lifeCustRows] = await executor.query(
    `SELECT COUNT(*) AS customers FROM customers
     WHERE  referred_by_affiliate_id = ? AND deleted_at IS NULL`,
    [affiliateId],
  ) as [RowDataPacket[], unknown];

  const [clawRows] = await executor.query(
    `SELECT COALESCE(SUM(commission_amount), 0) AS clawback
     FROM   referral_commissions
     WHERE  affiliate_id = ? AND status = 'paid' AND clawback_settled = 1`,
    [affiliateId],
  ) as [RowDataPacket[], unknown];

  // ── Recent orders (order id + totals only, never customer identity) ─────
  const [recentRows] = await executor.query(
    `SELECT rc.order_id, rc.calculated_at, rc.order_total,
            rc.commission_amount, rc.status, rc.rule_source
     FROM   referral_commissions rc
     WHERE  rc.affiliate_id = ?
     ORDER  BY rc.calculated_at DESC
     LIMIT  25`,
    [affiliateId],
  ) as [RowDataPacket[], unknown];

  const referredCustomers = num(cu.referred);
  const convertedCustomers = num(cu.converted);

  return {
    affiliateName: (profile?.name as string) ?? "Affiliate",
    referralCode: (profile?.referral_code as string) ?? "",
    period,
    commissionRule: await describeRule(executor, affiliateId),

    orders: num(s.orders),
    grossSales: num(s.gross_sales),
    commissionEarned: num(s.paid) + num(s.pending),
    commissionPaid: num(s.paid),
    commissionPending: num(s.pending),
    commissionReversed: num(s.reversed),
    clawback: num(s.clawback),
    netEarned: num(s.paid) + num(s.pending) - num(s.reversed) - num(s.clawback),

    linkClicks: num(c.clicks),
    uniqueVisitors: num(c.unique_visitors),
    referredCustomers,
    convertedCustomers,
    conversionRate:
      referredCustomers > 0 ? convertedCustomers / referredCustomers : 0,

    lifetime: {
      totalEarned: num(l.earned),
      totalPaid: num(l.paid),
      totalPending: num(l.pending),
      clawbackPending: num((clawRows[0] as RowDataPacket | undefined)?.clawback),
      customers: num((lifeCustRows[0] as RowDataPacket | undefined)?.customers),
      orders: num(l.orders),
      grossSales: num(l.gross),
    },

    recentOrders: (recentRows as RowDataPacket[]).map((r) => ({
      orderId: (r.order_id as string) ?? null,
      date: r.calculated_at ? new Date(r.calculated_at as Date).toISOString().slice(0, 10) : null,
      orderTotal: num(r.order_total),
      commission: num(r.commission_amount),
      status: r.status as string,
      ruleSource: r.rule_source as string,
    })),
  };
}

// ─── HTML rendering ─────────────────────────────────────────────────────────

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const card = (label: string, value: string): string => `
  <td style="padding:10px 14px;border:1px solid #e2e8f0;background:#f8fafc;">
    <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;font-weight:700;">${esc(label)}</div>
    <div style="font-size:20px;font-weight:800;color:#0f172a;margin-top:4px;">${esc(value)}</div>
  </td>`;

export function renderAffiliateReportHtml(d: AffiliateReportData): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  const orderRows = d.recentOrders
    .map(
      (o) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:12px;">${esc(o.orderId ?? "—")}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;">${esc(o.date ?? "—")}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;font-size:12px;">${money(o.orderTotal)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;font-size:12px;font-weight:700;">${money(o.commission)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;">${esc(o.status)}</td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:720px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">

    <div style="background:#1b3d1e;padding:24px;color:#ffffff;">
      <h1 style="margin:0;font-size:20px;">Your Asella Organic Affiliate Report</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#8ff59c;">
        ${esc(d.period.start)} to ${esc(d.period.end)} &middot; Code ${esc(d.referralCode)}
      </p>
    </div>

    <div style="padding:24px;">
      <p style="margin:0 0 6px;font-size:15px;color:#0f172a;">
        Hello ${esc(d.affiliateName)},
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">
        Here is how your referrals performed during the period above.
        Commissions are credited once an order is <strong>delivered</strong>, and are
        reversed automatically if that order is later cancelled or returned.
      </p>

      <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0 0 10px;">Commission earned</h2>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>${card("Gross sales", money(d.grossSales))}</tr>
        <tr>${card("Pending payout", money(d.commissionPending))}${card("Paid out", money(d.commissionPaid))}</tr>
        <tr>${card("Reversed / cancelled", money(d.commissionReversed))}${card("Clawback", money(d.clawback))}</tr>
        <tr>${card("Net earned this period", money(d.netEarned))}${card("Orders delivered", String(d.orders))}</tr>
      </table>

      <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0 0 10px;">Engagement</h2>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>${card("Link clicks", String(d.linkClicks))}${card("Unique visitors", String(d.uniqueVisitors))}</tr>
        <tr>${card("Customers referred", String(d.referredCustomers))}${card("Conversion rate", pct(d.conversionRate))}</tr>
      </table>

      <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0 0 10px;">Lifetime totals</h2>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>${card("Total earned", money(d.lifetime.totalEarned))}${card("Total paid", money(d.lifetime.totalPaid))}</tr>
        <tr>${card("Awaiting payout", money(d.lifetime.totalPending))}${card("Customers referred", String(d.lifetime.customers))}</tr>
      </table>

      <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0 0 10px;">
        Your rate: ${esc(d.commissionRule)}
      </h2>

      ${
        orderRows
          ? `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0 0 10px;">Recent commissions</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;">Order</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;">Date</th>
          <th style="padding:8px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:#64748b;">Order total</th>
          <th style="padding:8px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:#64748b;">Commission</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;">Status</th>
        </tr></thead>
        <tbody>${orderRows}</tbody>
      </table>`
          : ""
      }

      <p style="font-size:12px;color:#94a3b8;line-height:1.6;margin:0;border-top:1px solid #e2e8f0;padding-top:16px;">
        Commissions are calculated on delivered orders only. We share aggregate
        figures and order references — never the personal details of the customers
        you referred. Questions about a specific payout? Reply to this email.
      </p>
    </div>
  </div>
</body></html>`;
}

export function reportSubject(d: AffiliateReportData, trigger: string): string {
  const scope =
    trigger === "weekly"
      ? "Your weekly affiliate summary"
      : "Your affiliate sales & engagement report";
  return `${scope} — ${d.period.start} to ${d.period.end}`;
}

/** Send one report. Records the outcome in `report_runs`. */
export async function sendAffiliateReport(opts: {
  executor: Executor;
  affiliateId: string;
  recipient: string;
  period: Period;
  trigger: "manual" | "weekly";
  triggeredBy: string | null;
}): Promise<{ status: "sent" | "failed" | "skipped"; error?: string }> {
  const data = await buildAffiliateReport(opts.executor, opts.affiliateId, opts.period);
  const html = renderAffiliateReportHtml(data);
  const result = await sendMail(
    opts.recipient,
    reportSubject(data, opts.trigger),
    html,
  );

  const status = result.skipped ? "skipped" : result.sent ? "sent" : "failed";

  await opts.executor.query(
    `INSERT INTO report_runs
       (id, affiliate_id, period_start, period_end, trigger_type,
        recipient, status, error, triggered_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      opts.affiliateId,
      opts.period.start,
      opts.period.end,
      opts.trigger,
      opts.recipient,
      status,
      result.error ?? null,
      opts.triggeredBy,
    ],
  );

  return result.error ? { status, error: result.error } : { status };
}

/** Previous Monday through today — the window the weekly cron reports on. */
export function currentWeekPeriod(now = new Date()): Period {
  const end = new Date(now);
  // getDay(): 0=Sun … 1=Mon. Shift so Monday is the origin.
  const daysSinceMonday = (end.getDay() + 6) % 7;
  const start = new Date(end);
  start.setDate(start.getDate() - daysSinceMonday);

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}
