// Recharts takes colours as props; SVG presentation attributes and inline styles accept var(), so the
// chart follows the active theme's tokens (styles.css) directly.

export const CHART = {
  grid: "var(--line)",
  ink: "var(--ink-2)",
  lime: "var(--accent-ink)", // confirmed result only
  fail: "var(--fail)",
  faint: "var(--chart-faint)",
  mid: "var(--ink-3)",
};

export const AXIS_STYLE = { fontSize: 13, fontFamily: "Hanken Grotesk, system-ui, sans-serif", fill: "var(--ink-3)" };

export const TOOLTIP_STYLE = {
  fontFamily: "Hanken Grotesk, system-ui, sans-serif",
  fontSize: 13,
  background: "var(--raised)",
  border: "1px solid var(--line-strong)",
  borderRadius: 10,
  color: "var(--ink)",
  whiteSpace: "normal" as const, // long RO names wrap instead of running off a phone screen
  maxWidth: 220,
};

export const TOOLTIP_CURSOR = { fill: "var(--chart-cursor)" };
