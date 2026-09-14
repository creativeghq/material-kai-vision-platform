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
  // Every live customer row, because a thread can legitimately carry two: one filed before the
  // contact was known and one after. Prefer whichever actually names somebody.
  const { data: rows } = await db
    .from('inbox_participants').select('contact_id, company_id')
    .eq('thread_id', threadId).eq('participant_type', 'customer').eq('status', 'active');
  const parts = (rows ?? []) as Array<{ contact_id?: string | null; company_id?: string | null }>;
  const contactId = parts.find((p) => p.contact_id)?.contact_id ?? null;
  const linkedCompanyId = parts.find((p) => p.company_id)?.company_id ?? null;
  if (!contactId) {
    // A company line with no named person is a real counterparty, not nobody. Before the
    // participant could carry a company this returned NOBODY and the thread had no party at all.
    return linkedCompanyId
      ? { contactId: null, companyId: linkedCompanyId, isBusiness: true }
      : NOBODY;
  }

  const [{ data: contact }, { data: link }, { data: q }, { data: p }] = await Promise.all([
    db.from('crm_contacts').select('vat_number, contact_type').eq('id', contactId).maybeSingle(),
    // The EXPLICIT answer, and the one the rest of the platform already trusts:
    // `bind_party_company` re-points every new quote/invoice at this company, so a drawer that
    // could not see it disagreed with the document the operator was about to raise.
    db.from('crm_company_contacts').select('company_id')
      .eq('contact_id', contactId)
      .order('is_primary', { ascending: false }).order('created_at', { ascending: true })
      .limit(1).maybeSingle(),
    db.from('quotes').select('customer_company_id').eq('customer_contact_id', contactId)
      .not('customer_company_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('projects').select('client_company_id').eq('client_contact_id', contactId)
      .not('client_company_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  // Filed on the thread → filed on the contact → inferred from what they have bought. The last
  // one was the ONLY source until 2026-09-14, so a company somebody had explicitly recorded was
  // invisible here until it had a quote — and `isBusiness` drives net-vs-gross pricing.
  const companyId = linkedCompanyId
    ?? (link as { company_id?: string } | null)?.company_id
    ?? (q as { customer_company_id?: string } | null)?.customer_company_id
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
