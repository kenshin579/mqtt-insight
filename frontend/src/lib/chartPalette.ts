// dataviz validate_palette.js 전 체크 PASS 값 (스펙 §3 — 눈대중 금지, 변경 시 재검증).
export const CHART_DARK = ["#4f8cff", "#7b5cff", "#2fa896", "#c9791f", "#d05ca8"] as const;
export const CHART_LIGHT = ["#3d6fd6", "#6a4de0", "#0e9f87", "#b5651f", "#b8438f"] as const;

/** Resolve a series color by palette index (fixed order, cycled) and theme. */
export function chartColor(index: number, theme: "dark" | "light"): string {
  const pal = theme === "light" ? CHART_LIGHT : CHART_DARK;
  return pal[index % pal.length];
}
