/** "Is this party already in this workspace?" — one implementation, both kinds (#378 F2). */
import { foldForSearch } from '../../_shared/searchFold.ts';
// Generated mirror of src/services/crm/greekTransliteration.ts (#353 CRM-1).
import { transliterateGreek } from '../../_shared/crm/greekTransliteration.generated.ts';

export type PartyTable = 'crm_companies' | 'crm_contacts';

/**
 * The `code` the client branches on. Beside the query it belongs to, because the caller's
 * "use the existing one" button is only reachable when these two strings agree — and they live in
 * different repositories of the same codebase (`QuickCreatePartyDialog`).
 */
export const PARTY_DUPLICATE_CODE: Record<PartyTable, string> = {
  crm_companies: 'duplicate_company',
  crm_contacts: 'duplicate_contact',
};

const PARTY_NOUN: Record<PartyTable, string> = {
  crm_companies: 'business',
  crm_contacts: 'contact',
};

export type PartyDedupeResult =
  | { status: 'clear' }
  | { status: 'duplicate'; existing: { id: string; name: string } }
  | { status: 'unavailable'; message: string };

/** Look for a party with the same transliterated, folded name in this workspace. */
export async function findExistingParty(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  table: PartyTable,
  workspaceId: string,
  name: string,
): Promise<PartyDedupeResult> {
  const { data, error } = await supabase
    .from(table)
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .eq('name_xscript', transliterateGreek(foldForSearch(name)))
    .limit(1)
    .maybeSingle();

  // A failed lookup does NOT fall through to the insert. Creating a duplicate is cheap to detect
  // and expensive to unpick; retrying a create is neither.
  if (error) return { status: 'unavailable', message: error.message };
  if (data) return { status: 'duplicate', existing: { id: data.id, name: data.name ?? '' } };
  return { status: 'clear' };
}

/**
 * The guard, as one call: returns the Response to send, or `null` to carry on with the insert.
 *
 * `allowDuplicate` is the escape hatch for the genuine case — two distinct legal entities sharing
 * a trading name, two people with the same name. Refusing by default and opting in is the right
 * way round: the accidental duplicate is silent, the deliberate one is typed by a human.
 */
export async function guardDuplicateParty(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  table: PartyTable,
  workspaceId: string,
  name: string,
  allowDuplicate: boolean,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (allowDuplicate) return null;
  const result = await findExistingParty(supabase, table, workspaceId, name);
  if (result.status === 'clear') return null;
  if (result.status === 'unavailable') {
    return new Response(
      JSON.stringify({ error: `Could not check for an existing ${PARTY_NOUN[table]}: ${result.message}` }),
      { status: 503, headers: corsHeaders },
    );
  }
  return new Response(
    JSON.stringify({
      error: `"${result.existing.name}" already exists in this workspace.`,
      code: PARTY_DUPLICATE_CODE[table],
      existing: result.existing,
    }),
    { status: 409, headers: corsHeaders },
  );
}
