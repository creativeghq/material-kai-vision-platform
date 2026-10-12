export interface WeekPoint { week: string; clicks: number; impressions: number }

/** Daily rows of one page summed into ISO-week buckets (Monday start), oldest first. */
export function weeklySeries(rows: { date: string; clicks: number; impressions: number }[]): WeekPoint[] {
  const byWeek = new Map<string, WeekPoint>();
  for (const r of rows) {
    const d = new Date(`${r.date}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const week = d.toISOString().slice(0, 10);
    const p = byWeek.get(week) ?? { week, clicks: 0, impressions: 0 };
    p.clicks += r.clicks ?? 0;
    p.impressions += r.impressions ?? 0;
    byWeek.set(week, p);
  }
  return [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week));
}
