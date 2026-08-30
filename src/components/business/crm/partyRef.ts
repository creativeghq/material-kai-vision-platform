/**
 * The shape of a CRM counterparty, and the two rules for reading and writing the column pair
 * that stores it (#376).
 *
 * Separate from the picker component ON PURPOSE: the component imports the Supabase client, and
 * these rules are the half that every caller has to get right whether or not a picker is on
 * screen — the quote path, the agent tool, a future import. A pure module is also the half a test
 * can exercise directly rather than only grep for.
 */

export type PartyKind = 'company' | 'contact';
export interface PartyRef { kind: PartyKind; id: string }


/**
 * The stored pair → a `PartyRef`. Null when neither side is set.
 *
 * A helper rather than an inline ternary at each of the six fields, because the pair is the thing
 * that has to stay consistent: the CHECK allows at most one, so reading has to prefer neither.
 */
export function partyRefOf(companyId: string | null | undefined, contactId: string | null | undefined): PartyRef | null {
  if (companyId) return { kind: 'company', id: companyId };
  if (contactId) return { kind: 'contact', id: contactId };
  return null;
}

/**
 * A `PartyRef` → the stored pair, with the other side explicitly NULLED.
 *
 * Nulling is the point. Setting a company on a field that already held a contact without clearing
 * the contact leaves both set, which the `num_nonnulls(...) <= 1` constraint rejects with a raw
 * 23514 — and the operator sees a save that failed for no reason they can act on.
 */
export function partyColumns<C extends string, P extends string>(
  companyKey: C,
  contactKey: P,
  party: PartyRef | null,
): Record<C | P, string | null> {
  return {
    [companyKey]: party?.kind === 'company' ? party.id : null,
    [contactKey]: party?.kind === 'contact' ? party.id : null,
  } as Record<C | P, string | null>;
}
