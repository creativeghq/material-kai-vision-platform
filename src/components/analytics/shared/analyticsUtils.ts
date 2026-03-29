// ── Pure utility functions (no React, no components) ──────────

/** Formats a quotes-to-saves ratio as a percentage string, or '—' when no saves. */
export function convRate(quotes: number, saves: number): string {
  return saves > 0 ? `${Math.round((quotes / saves) * 100)}%` : '—';
}

/** Standard Recharts margin presets shared across both analytics tabs. */
export const CHART_MARGINS = {
  /** Line/area charts: trims left axis label space */
  line: { top: 5, right: 20, left: -20, bottom: 5 },
  /** Bar charts: tighter right side */
  bar: { top: 5, right: 10, left: -20, bottom: 5 },
  /** Horizontal bar charts: room for category labels on left */
  barH: { top: 5, right: 30, left: 10, bottom: 5 },
} as const;

/** CartesianGrid props shared across all charts. */
export const GRID_PROPS = {
  strokeDasharray: '3 3',
  stroke: 'hsl(var(--border))',
} as const;

export function getWeekNum(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

export function weekLabel(d: Date): string {
  return `W${getWeekNum(d)}`;
}

export function buildWeeks(n: number): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (n - 1 - i) * 7); return weekLabel(d);
  });
}

export function weeksAgo(n: number): Date {
  const d = new Date(); d.setDate(d.getDate() - n * 7); return d;
}

export function buildMonthlyTrend(rows: { created_at: string }[]) {
  const thisYear = new Date().getFullYear();
  const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const months = MONTH_LABELS.map((label) => ({ label, thisYear: 0, lastYear: 0 }));
  rows.forEach((row) => {
    try {
      const d = new Date(row.created_at);
      const yr = d.getFullYear();
      const mo = d.getMonth();
      if (yr === thisYear)      months[mo].thisYear++;
      else if (yr === thisYear - 1) months[mo].lastYear++;
    } catch { /* skip */ }
  });
  return months;
}

export function forecastWeeks(thisWeek: number, growthPct: number, n: number): number[] {
  // Clamp rate to avoid unrealistic explosions
  const rate = Math.max(-0.4, Math.min(0.8, growthPct / 100));
  return Array.from({ length: n }, (_, i) => Math.round(thisWeek * Math.pow(1 + rate, i + 1)));
}

export function downloadCSV(filename: string, rows: string[][]): void {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
