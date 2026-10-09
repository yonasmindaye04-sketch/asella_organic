import React from "react"

/**
 * src/components/affiliates/StatusPill.tsx
 *
 * The single status renderer for the affiliate UI.
 *
 * Rule: a solid colour dot plus BOLD, fully saturated text on the plain
 * surface — no tinted chip fill, so the background stays neutral and the colour
 * itself carries the signal. This is the OrderTracking / CustomersPage
 * convention, and routing every status through one component is what stops
 * weight and colour drifting between panels.
 *
 * Every tone clears WCAG AA (4.5:1) on the card, page, table-header and tint
 * surfaces. `--amber` (#f59e0b) could not: it is only 2.2:1 on white, so
 * pending uses the darkened `--amber-ink` instead.
 */

export const status = {
  paid: "var(--emerald)", // 5.1:1
  active: "var(--emerald)", // 5.1:1
  success: "var(--emerald)", // 5.1:1
  pending: "var(--amber-ink)", // 5.0:1
  warning: "var(--amber-ink)", // 5.0:1
  reversed: "var(--muted-ink)", // 5.0:1
  inactive: "var(--muted-ink)", // 5.0:1
  neutral: "var(--muted-ink)", // 5.0:1
  custom: "var(--sky)", // 6.4:1
  info: "var(--sky)", // 6.4:1
  error: "var(--rose)", // 5.6:1
} as const

export type StatusTone = keyof typeof status

const dot = "inline-block h-[8px] w-[8px] shrink-0 rounded-full";
const pill =
  "inline-flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wider whitespace-nowrap";

export const StatusPill: React.FC<{
  tone: StatusTone
  label: string
  /** Strike the label through — used for reversed commissions. */
  strike?: boolean
}> = ({ tone, label, strike = false }) => (
  <span className={`${pill} ${strike ? "line-through" : ""}`} style={{ color: status[tone] }}>
    <span className={dot} style={{ background: status[tone] }} aria-hidden="true" />
    {label}
  </span>
)

export default StatusPill