/**
 * WHO the customer on an Inbox thread is — one derivation, for everything that prices, lists or
 * answers on their behalf.
 *
 * Three copies of this used to live in inbox-api and agent-chat (the context rail, the card
 * resolver, the customer-audience account scope), and they had already drifted: one read the
 * newest quote, one the newest eight, one had no company at all — so the rail listed an order the
 * assistant then said did not exist. One function; every reader gets the same party.
 *
 * Everything comes from the THREAD — the active customer participant's CRM contact, and the
 * company the platform already links that contact to (the most recent quote or project). Never
 * from a message, and never from a request body: this is what makes the customer-audience tools
 * safe to scope with it.
 *
 * `isBusiness` follows the SQL predicate `invoice_buyer_is_business` — a linked company, a
 * contact of type `company`, or a VAT number on the contact — so the card that says "incl. VAT"
 * and the invoice that later says 11.x agree on which kind of buyer this is.
 */

import type { DbClient } from './supabase-client.ts';

export interface ThreadCustomerParty {
  contactId: string | null;
  companyId: string | null;
  /** A business buyer is quoted net; a consumer is quoted gross. */
  isBusiness: boolean;
}

const NOBODY: ThreadCustomerParty = { contactId: null, companyId: null, isBusiness: false };

export async function threadCustomerParty(db: DbClient, threadId: string): Promise<ThreadCustomerParty> {
  const { data: custP } = await db
    .from('inbox_participants').select('contact_id')
    .eq('thread_id', threadId).eq('participant_type', 'customer').eq('status', 'active')
    .not('contact_id', 'is', null).limit(1).maybeSingle();
  const contactId = (custP as { contact_id?: string } | null)?.contact_id ?? null;
  if (!contactId) return NOBODY;

  const [{ data: contact }, { data: q }, { data: p }] = await Promise.all([
    db.from('crm_contacts').select('vat_number, contact_type').eq('id', contactId).maybeSingle(),
    db.from('quotes').select('customer_company_id').eq('customer_contact_id', contactId)
      .not('customer_company_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('projects').select('client_company_id').eq('client_contact_id', contactId)
      .not('client_company_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const companyId = (q as { customer_company_id?: string } | null)?.customer_company_id
    ?? (p as { client_company_id?: string } | null)?.client_company_id ?? null;
  const c = (contact || {}) as { vat_number?: string | null; contact_type?: string | null };
  const isBusiness = !!companyId
    || (c.contact_type ?? '') === 'company'
    || !!(c.vat_number ?? '').trim();
  return { contactId, companyId, isBusiness };
}

/** The PostgREST `.or()` clause selecting rows that belong to this party, by contact or company. */
export function partyFilter(party: Pick<ThreadCustomerParty, 'contactId' | 'companyId'>, contactCol: string, companyCol: string): string {
  const parts = [`${contactCol}.eq.${party.contactId}`];
  if (party.companyId) parts.push(`${companyCol}.eq.${party.companyId}`);
  return parts.join(',');
}
