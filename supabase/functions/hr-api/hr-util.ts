// deno-lint-ignore-file no-explicit-any
// Small pure helpers shared across the hr-api handlers (index.ts + expansion.ts) so the two
// copies can't drift.

/** Business days (Mon–Fri) between two ISO dates inclusive. Weekends excluded (v1; holidays later). */
export function businessDaysInclusive(startISO: string, endISO: string): number {
  const start = new Date(startISO + 'T00:00:00Z');
  const end = new Date(endISO + 'T00:00:00Z');
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
  let days = 0;
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

// `tagEmployee` lived here: it wrote a source='manual' row into the crm_categories list with
// slug='employee'. That list was retired on 2026-07-30 when employment categories became DERIVED
// from hr_employees, so the lookup returned nothing and the helper silently no-opped. Writing the
// membership by hand is also what we removed: a manual row survives resync, so an employee who left
// would stay on the list forever. `hr-employees-active` (plus the per-department lists) is now kept
// correct by crm_resync_auto_category_members, run nightly by `crm-category-resync-daily`.
