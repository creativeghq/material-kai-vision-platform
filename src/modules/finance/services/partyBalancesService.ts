/** Party account balances and opening balances — every figure is derived by SQL; this file only reads and writes. */
import { supabase } from '@/integrations/supabase/client';

export type PartySide = 'customer' | 'supplier';

/** Mirrors the CHECK on `finance_party_opening_balances.source`. */
export const OPENING_BALANCE_SOURCES = ['party_statement', 'previous_system', 'accountant', 'other'] as const;
export type OpeningBalanceSource = (typeof OPENING_BALANCE_SOURCES)[number];
export const OPENING_BALANCE_SOURCE_LABELS: Record<OpeningBalanceSource, string> = {
  party_statement: 'Their statement',
  previous_system: 'Previous system',
  accountant: 'Accountant',
  other: 'Other',
};

/** One party in one currency, from its full ledger: opening balance, documents, AADE documents and payments. */
export interface PartyBalance {
  party_type: 'company' | 'contact';
  party_id: string;
  currency: string;
  /** Customer side: positive = due to us. */
  receivable: number;
  /** Supplier side: positive = due to them. */
  payable: number;
  /** receivable − payable, derived in SQL. */
  net: number;
  customer_open_items: number;
  supplier_open_items: number;
  oldest_open_date: string | null;
  customer_opening_as_of: string | null;
  supplier_opening_as_of: string | null;
  aade_documents: number;
}

export interface OpeningBalance {
  id: string;
  workspace_id: string;
  side: PartySide;
  company_id: string | null;
  contact_id: string | null;
  as_of: string;
  /** Positive = due in the side's normal direction (they owe us / we owe them). */
  amount: number;
  currency: string;
  source: OpeningBalanceSource;
  note: string | null;
  updated_at: string;
}

export interface UnlinkedInboundIssuer {
  issuer_vat: string;
  issuer_name: string | null;
  documents: number;
  balance: number;
  currency: string;
  first_date: string;
  last_date: string;
  /** 0 = no CRM company has the VAT; >1 = several do, so none is chosen. */
  matching_companies: number;
}

export type OpeningImportStatus = 'ready' | 'saved' | 'no_company' | 'ambiguous' | 'invalid';
export interface OpeningImportRow {
  row_no: number;
  vat: string | null;
  company_id: string | null;
  company_name: string | null;
  as_of: string | null;
  amount: number | null;
  currency: string;
  status: OpeningImportStatus;
  message: string | null;
}

export interface OpeningImportInput { vat: string; as_of: string; amount: string | number; currency?: string; note?: string }

export const partyKey = (partyType: string, partyId: string) => `${partyType}:${partyId}`;

export const partyBalancesService = {
  async listBalances(workspaceId: string, party?: { companyId?: string | null; contactId?: string | null }): Promise<PartyBalance[]> {
    const { data, error } = await supabase.rpc('finance_party_balances', {
      p_workspace_id: workspaceId, p_include_orders: true,
      p_company_id: party?.companyId ?? null, p_contact_id: party?.companyId ? null : (party?.contactId ?? null),
    });
    if (error) throw error;
    return ((data ?? []) as PartyBalance[]).map((r) => ({
      ...r,
      receivable: Number(r.receivable ?? 0),
      payable: Number(r.payable ?? 0),
      net: Number(r.net ?? 0),
    }));
  },

  async listUnlinkedIssuers(workspaceId: string): Promise<UnlinkedInboundIssuer[]> {
    const { data, error } = await supabase.rpc('finance_unlinked_inbound_issuers', { p_workspace_id: workspaceId });
    if (error) throw error;
    return ((data ?? []) as UnlinkedInboundIssuer[]).map((r) => ({ ...r, balance: Number(r.balance ?? 0) }));
  },

  async getOpeningBalance(input: { workspaceId: string; side: PartySide; companyId?: string | null; contactId?: string | null }): Promise<OpeningBalance | null> {
    let q = supabase.from('finance_party_opening_balances').select('*')
      .eq('workspace_id', input.workspaceId).eq('side', input.side);
    q = input.companyId ? q.eq('company_id', input.companyId) : q.eq('contact_id', input.contactId ?? '');
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return data ? ({ ...(data as OpeningBalance), amount: Number((data as OpeningBalance).amount) }) : null;
  },

  async setOpeningBalance(input: {
    workspaceId: string; side: PartySide; companyId?: string | null; contactId?: string | null;
    asOf: string; amount: number; currency?: string; source: OpeningBalanceSource; note?: string | null;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('set_party_opening_balance', {
      p_workspace_id: input.workspaceId, p_side: input.side,
      p_company_id: input.companyId ?? null, p_contact_id: input.companyId ? null : (input.contactId ?? null),
      p_as_of: input.asOf, p_amount: input.amount, p_currency: input.currency ?? 'EUR',
      p_source: input.source, p_note: input.note ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  async deleteOpeningBalance(id: string): Promise<void> {
    const { error } = await supabase.rpc('delete_party_opening_balance', { p_id: id });
    if (error) throw error;
  },

  /** `commit: false` previews the match; `true` saves every row the preview marked ready. */
  async importOpeningBalances(input: { workspaceId: string; side: PartySide; rows: OpeningImportInput[]; commit: boolean }): Promise<OpeningImportRow[]> {
    const { data, error } = await supabase.rpc('import_party_opening_balances', {
      p_workspace_id: input.workspaceId, p_side: input.side,
      p_rows: input.rows as unknown as never, p_commit: input.commit,
    });
    if (error) throw error;
    return ((data ?? []) as OpeningImportRow[]).map((r) => ({ ...r, amount: r.amount == null ? null : Number(r.amount) }));
  },
};
