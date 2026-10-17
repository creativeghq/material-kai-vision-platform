/** "Is this party already in this workspace?" and find-or-create — the one implementation (#485 C-3/C-4). */
import { escapeLike, foldForSearch } from './searchFold.ts';
import { transliterateGreek } from './crm/greekTransliteration.generated.ts';
import { normalizeVat } from './crm/vatNormalize.generated.ts';

export type PartyTable = 'crm_companies' | 'crm_contacts';

export interface PartyKeys {
  name?: string | null;
  vat?: string | null;
  email?: string | null;
}

export type PartyMatchKey = 'vat' | 'email' | 'name';

export type PartyMatch =
  | { status: 'clear' }
  | { status: 'duplicate'; existing: { id: string; name: string }; matchedOn: PartyMatchKey }
  | { status: 'unavailable'; message: string };

export interface FindPartyOptions {
  /** `always`: a same-name row is a match even when a VAT or email was given (the human-reviewed guard). */
  nameFallback?: 'always' | 'when_no_strong_key' | 'never';
}

const EMAIL_RE = /^[A-Za-z0-9.!#$&'+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

/** A syntactically valid address, trimmed and lower-cased, or null. `%`, `*`, spaces and commas never pass. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v.length > 254 || !EMAIL_RE.test(v)) return null;
  return v;
}

/** Exact, case-insensitive email equality for PostgREST — the wildcards are escaped. */
export function emailEqPattern(email: string): string {
  return escapeLike(email);
}

export function partyNameKey(name: string): string {
  return transliterateGreek(foldForSearch(name.trim()));
}

type Row = { id: string; name: string | null; vat_norm: string | null };

/** VAT first: one VAT is the same party, two different VATs are never the same party. Then email, then name. */
export async function findExistingParty(
  // deno-lint-ignore no-explicit-any
  db: any,
  table: PartyTable,
  workspaceId: string,
  keys: PartyKeys,
  opts: FindPartyOptions = {},
): Promise<PartyMatch> {
  const vat = normalizeVat(keys.vat ?? null);
  const email = table === 'crm_contacts' ? normalizeEmail(keys.email) : null;
  const name = (keys.name ?? '').trim();
  const nameFallback = opts.nameFallback ?? 'always';
  const compatible = (r: Row) => !(vat && r.vat_norm && r.vat_norm !== vat);
  const hit = (r: Row, matchedOn: PartyMatchKey): PartyMatch =>
    ({ status: 'duplicate', existing: { id: r.id, name: r.name ?? '' }, matchedOn });

  if (vat) {
    const { data, error } = await db.from(table).select('id, name, vat_norm')
      .eq('workspace_id', workspaceId).eq('vat_norm', vat).limit(1);
    if (error) return { status: 'unavailable', message: error.message };
    if (data?.[0]) return hit(data[0], 'vat');
  }

  if (email) {
    const { data, error } = await db.from(table).select('id, name, vat_norm')
      .eq('workspace_id', workspaceId).ilike('email', emailEqPattern(email))
      .order('created_at', { ascending: true }).limit(10);
    if (error) return { status: 'unavailable', message: error.message };
    const row = (data as Row[] | null)?.find(compatible);
    if (row) return hit(row, 'email');
  }

  const useName = name !== '' && (nameFallback === 'always' || (nameFallback === 'when_no_strong_key' && !vat && !email));
  if (useName) {
    const { data, error } = await db.from(table).select('id, name, vat_norm')
      .eq('workspace_id', workspaceId).eq('name_xscript', partyNameKey(name))
      .order('created_at', { ascending: true }).limit(20);
    if (error) return { status: 'unavailable', message: error.message };
    const row = (data as Row[] | null)?.find(compatible);
    if (row) return hit(row, 'name');
  }

  return { status: 'clear' };
}

export type FindOrCreateResult =
  | { status: 'found'; id: string; name: string; matchedOn: PartyMatchKey }
  | { status: 'created'; id: string; name: string; row: Record<string, unknown> }
  | { status: 'unavailable'; message: string }
  | { status: 'failed'; message: string };

/**
 * The server-side find-or-create for paths with no human to review a 409. `insert` is the caller's
 * allowlisted row; `workspace_id` is set here and cannot be overridden by it. A failed lookup never
 * falls through to an insert. By default a person is matched only on VAT or email (people share
 * names); a business also on its name, unless that row carries a different VAT.
 */
export async function findOrCreateParty(
  // deno-lint-ignore no-explicit-any
  db: any,
  table: PartyTable,
  workspaceId: string,
  keys: PartyKeys,
  insert: Record<string, unknown>,
  opts?: FindPartyOptions,
): Promise<FindOrCreateResult> {
  const match = await findExistingParty(db, table, workspaceId, keys,
    opts ?? { nameFallback: table === 'crm_contacts' ? 'never' : 'always' });
  if (match.status === 'unavailable') return match;
  if (match.status === 'duplicate') {
    return { status: 'found', id: match.existing.id, name: match.existing.name, matchedOn: match.matchedOn };
  }
  const { data, error } = await db.from(table).insert({ ...insert, workspace_id: workspaceId }).select().single();
  if (error || !data) return { status: 'failed', message: error?.message ?? 'insert returned no row' };
  return { status: 'created', id: data.id, name: data.name ?? '', row: data };
}
