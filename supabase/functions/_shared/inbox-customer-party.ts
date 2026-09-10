/**
 * WHO the customer on an Inbox thread is — one derivation, for everything that prices, lists or
 * answers on their behalf.
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
