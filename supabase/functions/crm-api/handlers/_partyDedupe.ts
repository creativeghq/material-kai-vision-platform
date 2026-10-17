/** The crm-api 409 guard over the one party matcher in `_shared/crm-party.ts` (#378 F2, #485 C-3). */
import { findExistingParty, type PartyKeys, type PartyTable } from '../../_shared/crm-party.ts';

export type { PartyTable } from '../../_shared/crm-party.ts';

/** The `code` the client branches on; `QuickCreatePartyDialog` and the company dialogs key off it. */
export const PARTY_DUPLICATE_CODE: Record<PartyTable, string> = {
  crm_companies: 'duplicate_company',
  crm_contacts: 'duplicate_contact',
};

const PARTY_NOUN: Record<PartyTable, string> = {
  crm_companies: 'business',
  crm_contacts: 'contact',
};

/**
 * Returns the Response to send, or `null` to carry on with the insert. `allowDuplicate` is the
 * human's "create anyway"; a same-VAT match is never overridable that way.
 */
export async function guardDuplicateParty(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  table: PartyTable,
  workspaceId: string,
  keys: PartyKeys,
  allowDuplicate: boolean,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const result = await findExistingParty(supabase, table, workspaceId, { name: keys.name, vat: keys.vat, email: keys.email });
  if (result.status === 'clear') return null;
  if (result.status === 'unavailable') {
    return new Response(
      JSON.stringify({ error: `Could not check for an existing ${PARTY_NOUN[table]}: ${result.message}` }),
      { status: 503, headers: corsHeaders },
    );
  }
  if (allowDuplicate && result.matchedOn !== 'vat') return null;
  return new Response(
    JSON.stringify({
      error: result.matchedOn === 'vat'
        ? `"${result.existing.name}" already has this VAT number in this workspace.`
        : `"${result.existing.name}" already exists in this workspace.`,
      code: PARTY_DUPLICATE_CODE[table],
      matched_on: result.matchedOn,
      allow_override: result.matchedOn !== 'vat',
      existing: result.existing,
    }),
    { status: 409, headers: corsHeaders },
  );
}
