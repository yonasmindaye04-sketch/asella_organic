/**
 * chartTheme.ts
 * One palette for every Chart.js canvas in the dashboard.
 *
 * Chart.js paints into <canvas>, which means CSS custom properties such as
 * `var(--fg)` are *not* valid colours there — the canvas keeps whatever fill
 * style it had and text can end up white-on-white. Every value here is a
 * literal colour taken from the site's cream / natural-green tokens in
 * index.css, so tooltips, axes and series all match the rest of the UI.
 */

export const CHART = {
  cream:      "#f7fdf7",
  parchment:  "#faf9f6",
  white:      "#ffffff",
  ink:        "#1a2e1b",
  inkSoft:    "#3a5c3a",
  mutedInk:   "#4a734d",
  border:     "#b5d4b5",

  green900:   "#0d2e10",
  green800:   "#1a4d1e",
  green700:   "#2e7d32",
  green600:   "#388e3c",
  green500:   "#43a047",
  green300:   "#81c784",
  green200:   "#c8e6c9",
  green100:   "#e8f5e9",
  green50:    "#f4faf4",

  gold:       "#8b6932",
  goldLight:  "#d4b878",
  clay:       "#8b4513",
  red:        "#b3261e",
} as const;

/**
 * Series colours, in priority order. Green-first with highland gold for
 * contrast — no cyan / violet / pink, which belong to a different palette
 * than the storefront.
 */
export const CHART_SERIES = [
  CHART.green700,
  CHART.green300,
  CHART.gold,
  CHART.green500,
  CHART.goldLight,
  CHART.mutedInk,
];

/** Cream tooltip with deep-green text and a natural green border. */
export const CHART_TOOLTIP = {
  backgroundColor: CHART.cream,
  borderColor: CHART.border,
  borderWidth: 1,
  padding: 10,
  cornerRadius: 8,
  titleColor: CHART.ink,
  bodyColor: CHART.inkSoft,
  footerColor: CHART.inkSoft,
  titleFont: { weight: "bold" as const, size: 12 },
  bodyFont: { size: 11 },
  boxPadding: 4,
};

/** Shared axis colours so no chart falls back to Chart.js grey. */
export const CHART_AXIS = {
  tick: CHART.mutedInk,
  grid: "rgba(46, 125, 50, 0.10)",
  border: "rgba(46, 125, 50, 0.18)",
};
