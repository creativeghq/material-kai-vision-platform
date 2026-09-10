/** Put the NAME beside the id, flat, on every row a tool returns. */

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
