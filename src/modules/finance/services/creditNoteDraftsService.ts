/** A credit note DRAFT is intent only — nothing is numbered, allocated or reported until issued. */
import { supabase } from '@/integrations/supabase/client';

export interface CreditLine {
  source_invoice_item_id?: string | null;
  product_id?: string | null;
  description: string;
  sku?: string | null;
  unit?: string | null;
  quantity: number;
  unit_price: number;
  net_value: number;
  vat_amount: number;
  vat_category?: number | null;
  vat_percent?: number | null;
  income_classification_type?: string | null;
  income_classification_category?: string | null;
}

interface InvoiceRef {
  internal_number: string | null;
  legal_number: string | null;
  customer_company_id: string | null;
  currency: string | null;
  document_type: string | null;
  fiscal_mark: string | null;
}

export interface CreditNoteDraft {
  id: string;
  workspace_id: string;
  invoice_id: string;
  reason: string;
  correlated: boolean;
  lines: CreditLine[];
  issued_credit_note_id: string | null;
  created_at: string;
  updated_at: string;
  invoice: InvoiceRef | null;
  party_name: string | null;
}

export interface CreditNoteRecord {
  id: string;
  workspace_id: string;
  credit_note_number: string;
  invoice_id: string;
  document_type: string | null;
  status: string | null;
  reason: string | null;
  currency: string;
  subtotal_net: number;
  vat_amount: number;
  total: number;
  issued_at: string | null;
  fiscal_mark: string | null;
  fiscal_status: string | null;
  fiscal_error: string | null;
  correlated_mark: string | null;
  goods_returned_at: string | null;
  invoice: InvoiceRef | null;
  party_name: string | null;
  items: (CreditLine & { id: string; line_total: number | null })[];
}

const INVOICE_EMBED = 'invoices!credit_notes_invoice_id_fkey(internal_number, legal_number, customer_company_id, currency, document_type, fiscal_mark)';
const DRAFT_INVOICE_EMBED = 'invoices!credit_note_drafts_invoice_id_fkey(internal_number, legal_number, customer_company_id, currency, document_type, fiscal_mark)';

async function companyNames(ids: (string | null | undefined)[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  if (!unique.length) return new Map();
  const { data, error } = await supabase.from('crm_companies').select('id, name').in('id', unique);
  if (error) throw error;
  return new Map(((data ?? []) as { id: string; name: string | null }[]).map((c) => [c.id, c.name]));
}

export const invoiceLabel = (inv: InvoiceRef | null | undefined) => inv?.legal_number ?? inv?.internal_number ?? 'Invoice';

export const creditNoteDraftsService = {
  async list(workspaceId: string): Promise<CreditNoteDraft[]> {
    const { data, error } = await supabase
      .from('credit_note_drafts' as never)
      .select(`*, ${DRAFT_INVOICE_EMBED}`)
      .eq('workspace_id', workspaceId)
      .is('issued_credit_note_id', null)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as unknown as (CreditNoteDraft & { invoices: InvoiceRef | null })[];
    const names = await companyNames(rows.map((r) => r.invoices?.customer_company_id));
    return rows.map((r) => ({ ...r, invoice: r.invoices, party_name: names.get(r.invoices?.customer_company_id ?? '') ?? null }));
  },

  async get(id: string): Promise<CreditNoteDraft | null> {
    const { data, error } = await supabase
      .from('credit_note_drafts' as never)
      .select(`*, ${DRAFT_INVOICE_EMBED}`)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const r = data as unknown as CreditNoteDraft & { invoices: InvoiceRef | null };
    const names = await companyNames([r.invoices?.customer_company_id]);
    return { ...r, invoice: r.invoices, party_name: names.get(r.invoices?.customer_company_id ?? '') ?? null };
  },

  async save(input: { id?: string | null; invoiceId: string; lines: CreditLine[]; reason: string; correlated: boolean }): Promise<string> {
    const { data, error } = await supabase.rpc('save_credit_note_draft' as never, {
      p_id: input.id ?? null, p_invoice_id: input.invoiceId, p_lines: input.lines,
      p_reason: input.reason, p_correlated: input.correlated,
    } as never);
    if (error) throw error;
    return data as unknown as string;
  },

  async issue(id: string): Promise<string> {
    const { data, error } = await supabase.rpc('issue_credit_note_draft' as never, { p_id: id } as never);
    if (error) throw error;
    return data as unknown as string;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.rpc('delete_credit_note_draft' as never, { p_id: id } as never);
    if (error) throw error;
  },

  async getIssued(id: string): Promise<CreditNoteRecord | null> {
    const { data, error } = await supabase
      .from('credit_notes')
      .select(`*, ${INVOICE_EMBED}, credit_note_items(id, source_invoice_item_id, product_id, description, sku, unit, quantity, unit_price, net_value, vat_amount, vat_percent, line_total)`)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const r = data as unknown as CreditNoteRecord & { invoices: InvoiceRef | null; credit_note_items: CreditNoteRecord['items'] };
    const names = await companyNames([r.invoices?.customer_company_id]);
    return { ...r, invoice: r.invoices, party_name: names.get(r.invoices?.customer_company_id ?? '') ?? null, items: r.credit_note_items ?? [] };
  },
};
