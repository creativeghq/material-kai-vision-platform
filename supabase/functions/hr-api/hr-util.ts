// deno-lint-ignore-file no-explicit-any
// #252 — small pure helpers shared across the hr-api handlers (index.ts + expansion.ts) so the two
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

/** Ensure a contact is tagged with the global "Employee" category (idempotent). Non-fatal if the
 *  seeded category is missing. */
export async function tagEmployee(supabase: any, contactId: string, userId: string): Promise<void> {
  const { data: cat } = await supabase.from('crm_categories').select('id').eq('slug', 'employee').maybeSingle();
  if (!cat?.id) return;
  const { data: existing } = await supabase.from('crm_category_members').select('id')
    .eq('category_id', cat.id).eq('crm_contact_id', contactId).maybeSingle();
  if (existing) return;
  await supabase.from('crm_category_members').insert({
    category_id: cat.id, member_kind: 'crm_contact', crm_contact_id: contactId, source: 'manual', added_by: userId,
  });
}
