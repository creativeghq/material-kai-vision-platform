/**
 * Put the NAME beside the id, flat, on every row a tool returns.
 *
 * The result cards can turn `supplier_company_id` into a link to that company — `recordLinks.ts`
 * knows where a company opens — but a link needs words. Most list tools select the foreign key and
 * not the name, so the row said `KEROS HELLAS` nowhere: the card showed `Notes: Order ORD-2026-0001
 * — KEROS HELLAS …` and the reader had to parse a sentence to learn who the expense was with,
 * while the model's prose answer in the same conversation had a Supplier column. Same data, two
 * different answers on the two halves of the screen.
 *
 * FLAT on purpose. A PostgREST embed (`customer:crm_companies(name)`) returns a nested object, and
 * the card's table builder skips non-scalar columns — so an embed adds the name to the payload and
 * removes it from the table. One extra `in()` read per list is the honest price.
 *
 * Never overwrites a name the row already carries: `supplier_bills.supplier_name` is what the
 * document SAID, and the CRM company is who we think it is. When they differ the document wins.
 */

export interface PartyNamePair {
  /** The row's foreign-key field, e.g. `supplier_company_id`. */
  idField: string;
  /** Where to put the name, e.g. `supplier_name`. Left alone if already non-empty. */
  nameField: string;
  /** Which party table the id points at. */
  table?: 'crm_companies' | 'crm_contacts';
}

export async function attachPartyNames<T extends Record<string, any>>(
  sb: any,
  rows: T[],
  pairs: PartyNamePair[],
): Promise<T[]> {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const wanted = new Map<string, Set<string>>();
  for (const pair of pairs) {
    const table = pair.table ?? 'crm_companies';
    for (const row of rows) {
      const id = row?.[pair.idField];
      const existing = row?.[pair.nameField];
      if (typeof id !== 'string' || !id) continue;
      if (typeof existing === 'string' && existing.trim() !== '') continue;
      if (!wanted.has(table)) wanted.set(table, new Set());
      wanted.get(table)!.add(id);
    }
  }
  if (wanted.size === 0) return rows;

  const names = new Map<string, string>();
  for (const [table, ids] of wanted) {
    try {
      const { data } = await sb.from(table).select('id, name').in('id', [...ids]);
      for (const r of (data ?? []) as Array<{ id: string; name: string | null }>) {
        if (r?.id && r.name) names.set(`${table}:${r.id}`, r.name);
      }
    } catch {
      // A name we could not read is a name the row does without — the id still links, and the
      // list is the answer to the question that was asked. Never fail the list over a label.
    }
  }

  return rows.map((row) => {
    const next: Record<string, any> = { ...row };
    for (const pair of pairs) {
      const table = pair.table ?? 'crm_companies';
      const id = row?.[pair.idField];
      const existing = row?.[pair.nameField];
      if (typeof existing === 'string' && existing.trim() !== '') continue;
      if (typeof id !== 'string' || !id) continue;
      const name = names.get(`${table}:${id}`);
      if (name) next[pair.nameField] = name;
    }
    return next as T;
  });
}
