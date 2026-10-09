/**
 * src/components/affiliates/theme.ts
 *
 * The affiliate program's design tokens.
 *
 * Every colour here resolves through a CSS variable declared in src/index.css.
 * Nothing is a hardcoded hex and nothing uses the generic Tailwind palette
 * (slate-*, gray-*, emerald-*), which is what previously made the affiliate
 * screens look like a different product from the rest of the dashboard.
 *
 * Sources of truth:
 *   - src/index.css:70-100  the dashboard token block (--bg, --bg-card, --fg,
 *                           --fg-secondary, --muted, --border, --accent, …)
 *   - src/index.css:24-56   the green ramp (--g50 … --g900) and --ink/--cream
 *
 * Two rules that are easy to break, so they are encoded here once:
 *
 * 1. NEVER use `brand-700` (`var(--g700)`) as a button fill that carries white
 *    text. The green ramp inverts in dark mode (index.css:52-53), so --g700
 *    becomes #81c784 — pale green under white text. Use `btnPrimaryBg`
 *    (`var(--accent)`) which is theme-stable, or --g900.
 *
 * 2. The tokens resolve through the `@layer utilities` block in index.css,
 *    which has no `.dark` counterpart. That is fine today because App.tsx:40-43
 *    strips `.dark` from <html> on mount, so the main app is light-only. Do not
 *    add `dark:` variants to affiliate code until a real dark palette lands —
 *    they would be dead CSS and would drift from these tokens.
 */

/** Page background. Matches DashboardLayout (bg-[var(--bg)]). */
export const page = "bg-[var(--bg)]";

/**
 * Raised panel: cards, table shells, modals.
 *
 * Uses --border-strong, not --border. A white card on the #f7fdf7 page is only
 * 1.03:1 — indistinguishable — and the default #d4ecd4 border is 1.25:1 against
 * the card. Together the panel had no edge at all, which is what made the
 * content read as a flat wash. --border-strong gives 1.6:1.
 */
export const panel =
  "bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-lg";

/** A panel that lifts on hover — the .card convention from index.css:193. */
export const panelHover =
  "bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-lg transition-[var(--transition)] hover:border-[var(--accent)] hover:shadow-[var(--shadow-hover)]";

export const panelShadow = "shadow-[var(--shadow-card)]";

/** Text.
 *
 * `muted` is --muted-ink (#4a734d), NOT --muted (#6b8f6e). The latter measures
 * 3.6:1 on a white card and fails WCAG AA, which is illegible at the small
 * sizes these labels use.
 */
export const fg = "text-[var(--fg)]";
export const fgSecondary = "text-[var(--fg-secondary)]";
export const muted = "text-[var(--muted-ink)]";

/** Uppercase micro-label — the platform's section-label convention.
 *  11px, not 10px: at 10px the muted green was effectively unreadable. */
export const label =
  "text-[11px] font-bold uppercase tracking-wider text-[var(--muted-ink)]";

/** Numeric / money. Tabular figures keep columns aligned. */
export const figure = "font-mono tabular-nums";

/** Monospace value. `font-mono` is Tailwind's ui-monospace default, not DM
 *  Mono — use `font-[DM_Mono]` when the brand face matters. */
export const mono = "font-[DM_Mono]";

/** Buttons — rectangular, matching the dashboard pages (CustomersPage,
 *  AuditLogPage), not the pill-shaped `.btn` used on the public site. */
export const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-extrabold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export const btnPrimaryBg =
  "bg-[var(--accent)] text-white hover:bg-[var(--g800)] disabled:hover:bg-[var(--accent)]";
export const btnPrimary = `${btnBase} px-3.5 py-2 text-xs ${btnPrimaryBg}`;

export const btnSecondary =
  `${btnBase} border-[1.5px] border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--border-light)] hover:text-[var(--fg)]`;

export const btnDanger =
  `${btnBase} border-[1.5px] border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--rose)] hover:text-[var(--rose)]`;

export const btnGhost =
  `${btnBase} bg-[var(--accent-dim)] px-2.5 py-1 text-[11px] text-[var(--accent)] hover:bg-[var(--accent-glow)]`;

/** Inputs. */
export const input =
  "w-full rounded-md border-[1.5px] border-[var(--border-strong)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--fg)] outline-none transition-colors placeholder:text-[var(--muted-ink)] focus:border-[var(--accent)]";

export const select = `${input} cursor-pointer`;

export const inputLabel = `${label} mb-1.5 block`;

/** Table — the .data-table convention from index.css:225-249. */
export const table = "w-full border-collapse text-[13.5px]";
export const th =
  "text-left bg-[var(--bg-deep)] px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--muted-ink)] border-b-2 border-[var(--border-strong)] whitespace-nowrap";
export const td = "px-3 py-3 text-[13.5px] text-[var(--fg-secondary)] font-medium";
export const tr =
  "bg-[var(--bg-card)] border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-card-hover)]";

/**
 * Status colours.
 *
 * Rendered by <StatusPill /> (StatusPill.tsx) — a colour dot plus bold
 * saturated text on the plain surface, no tinted chip fill. Every value clears
 * WCAG AA on the card, page, table-header and tint surfaces.
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

export { StatusPill } from "./StatusPill";

/** Dot + bold label markup used by <StatusPill />. */
export const dot = "inline-block h-[8px] w-[8px] shrink-0 rounded-full";
export const pill =
  "inline-flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wider whitespace-nowrap";

/** Alerts. */
export const alertError =
  "rounded-lg border border-[var(--rose)] bg-[var(--rose-dim)] px-4 py-3 text-sm font-bold text-[var(--rose)]";
export const alertSuccess =
  "rounded-lg border border-[var(--emerald)] bg-[var(--emerald-dim)] px-4 py-3 text-sm font-bold text-[var(--emerald)]";

/**
 * `--amber` is #f59e0b, which measures 2.0:1 on its own tint and cannot be
 * read as text. --warn-text is its darkened counterpart, used for text only.
 */
export const warnText = "var(--warn-text)";
export const alertWarn =
  `rounded-lg border border-[var(--amber)] bg-[rgba(245,158,11,0.10)] px-4 py-3 text-sm font-semibold text-[var(--warn-text)]`;

/** Page heading. */
export const h1 = "text-2xl font-extrabold tracking-tight text-[var(--fg)]";
export const h2 = "text-base font-extrabold leading-tight text-[var(--fg)]";
export const sub = "mt-1 text-sm text-[var(--fg-secondary)]";

/** Empty state. */
export const empty =
  "flex flex-col items-center justify-center gap-2 py-10 text-sm text-[var(--muted-ink)]";