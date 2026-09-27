import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

// Client for the fiscal connector abstraction (e-Invoicing).
// Master-key model: the Novus key is configured ONCE on the root (operator)
// workspace; every tenant transmits through it with its own issuer VAT.

// One source (#391). Re-exported so existing imports from this service keep working.
export { FISCAL_CAPABILITIES, isFiscalCapability } from './fiscal/fiscalVocabulary';
export type { FiscalCapability } from './fiscal/fiscalVocabulary';

// Also imported: a re-export does not bind the name locally.
import type { FiscalCapability } from './fiscal/fiscalVocabulary';

export interface FiscalConnector {
  slug: string;
  name: string;
  description: string | null;
  capabilities: FiscalCapability[];
  country_codes: string[];
  is_enabled: boolean;
}

export interface FiscalBinding {
  connector_slug: string;
  is_active: boolean;
}

export interface FiscalSubmission {
  id: string;
  invoice_id: string | null;
  /** Which table the document lives in. `invoice_id` alone cannot say it — a credit note and a
   *  delivery note are documents too, and the pair is what identifies one. */
  document_table: 'invoices' | 'credit_notes' | 'delivery_notes' | null;
  document_id: string | null;
  connector_slug: string;
  capability: string;
  status: 'pending' | 'accepted' | 'offline' | 'rejected' | 'error' | 'cancelled';
  mark: string | null;
  uid: string | null;
  authentication_code: string | null;
  qr_url: string | null;
  invoice_url: string | null;
  /** The myDATA type this attempt declared (1.1, 11.1, 9.3, `cancel_9.3` …). */
  fiscal_invoice_type: string | null;
  series: string | null;
  aa: string | null;
  is_offline: boolean;
  transmission_failure: boolean;
  attempt: number | null;
  provider_credits: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

export type TransmissionStatusFilter = 'all' | 'accepted' | 'offline' | 'rejected' | 'error' | 'cancelled';

export const fiscalConnectorService = {
  /** Every transmission ATTEMPT for a workspace, newest first; the large payload columns are not selected. */
  async listTransmissions(
    workspaceId: string,
    opts: { status?: TransmissionStatusFilter; limit?: number } = {},
  ): Promise<FiscalSubmission[]> {
    let q = supabase
      .from('fiscal_submissions')
      .select('id, invoice_id, document_table, document_id, connector_slug, capability, status, mark, uid, authentication_code, qr_url, invoice_url, fiscal_invoice_type, series, aa, is_offline, transmission_failure, attempt, provider_credits, error_code, error_message, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(opts.limit ?? 200);
    if (opts.status && opts.status !== 'all') q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as FiscalSubmission[];
  },

  /** Re-send a document that did not land. */
  async retransmit(sub: FiscalSubmission): Promise<any> {
    const body =
      sub.fiscal_invoice_type === 'cancel_9.3' || sub.fiscal_invoice_type === 'cancel_receiving'
        ? { cancel_delivery_note: { delivery_note_id: sub.document_id } }
      : sub.document_table === 'credit_notes' ? { credit_note_id: sub.document_id, submit_fiscal: true }
      : sub.document_table === 'delivery_notes' ? { delivery_note_id: sub.document_id, submit_fiscal: true }
      : { invoice_id: sub.document_id ?? sub.invoice_id, submit_fiscal: true };
    const { data, error } = await supabase.functions.invoke('finance-issue-invoice', { body });
    if (error) throw await edgeError(error);
    if (data && data.ok === false) throw new Error(data.error || 'Retransmission failed');
    return data;
  },

  async listConnectors(): Promise<FiscalConnector[]> {
    const { data, error } = await supabase
      .from('fiscal_connectors')
      .select('*')
      .eq('is_enabled', true)
      .order('slug');
    if (error) throw error;
    return (data ?? []) as FiscalConnector[];
  },

  async getBinding(workspaceId: string, capability: FiscalCapability): Promise<FiscalBinding | null> {
    const { data } = await supabase
      .from('workspace_fiscal_bindings')
      .select('connector_slug, is_active')
      .eq('workspace_id', workspaceId)
      .eq('capability', capability)
      .maybeSingle();
    return (data as FiscalBinding) ?? null;
  },

  /** Read-only connector status for this workspace's legal_invoice capability — whether the
   *  operator master key is configured and whether we point at sandbox or live. The key itself
   *  is operator-only and never leaves the server; this only returns booleans. */
  async getStatus(workspaceId: string): Promise<{
    connector_slug: string;
    master_key_configured: boolean;
    is_sandbox: boolean;
    code?: string;
    reason?: string;
  }> {
    const { data, error } = await supabase.functions.invoke('finance-issue-invoice', {
      body: { fiscal_status: { workspace_id: workspaceId } },
    });
    if (error) throw await edgeError(error);
    return data;
  },

  /** e-Invoicing is ON by default (the registry defaults to Novus when no binding row exists).
   *  Enabled = no binding OR an active one; a row with is_active=false explicitly disables it. */
  async getEInvoicingEnabled(workspaceId: string): Promise<boolean> {
    const b = await this.getBinding(workspaceId, 'legal_invoice');
    return b ? b.is_active : true;
  },

  /** Toggle e-invoicing for the workspace by writing the Novus binding across the legal_invoice,
   *  pre_invoice_notice and tax_submission capabilities (is_active drives transmission). */
  async setEInvoicingEnabled(workspaceId: string, enabled: boolean): Promise<void> {
    const caps: FiscalCapability[] = ['legal_invoice', 'pre_invoice_notice', 'tax_submission'];
    const rows = caps.map((capability) => ({
      workspace_id: workspaceId,
      capability,
      connector_slug: 'novus',
      is_active: enabled,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from('workspace_fiscal_bindings')
      .upsert(rows, { onConflict: 'workspace_id,capability' });
    if (error) throw error;
  },

  async setBinding(workspaceId: string, capability: FiscalCapability, connectorSlug: string | null): Promise<void> {
    if (!connectorSlug) {
      const { error } = await supabase
        .from('workspace_fiscal_bindings')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('capability', capability);
      if (error) throw error;
      return;
    }
    const { error } = await supabase.from('workspace_fiscal_bindings').upsert(
      { workspace_id: workspaceId, capability, connector_slug: connectorSlug, is_active: true, updated_at: new Date().toISOString() },
      { onConflict: 'workspace_id,capability' },
    );
    if (error) throw error;
  },

  /** Submit an existing invoice to its workspace's legal_invoice connector (Novus → myDATA).
   *  When `posPayment` is supplied, the receipt is issued as a card(7)/IRIS(8) payment on
   *  a registered EFT-POS terminal: the connector signs it (skipSignature=false) and returns a
   *  provider signature with status 'awaiting_payment'. Charge the terminal, then completePos(). */
  async submitInvoice(
    invoiceId: string,
    opts?: {
      skipSignature?: boolean;
      overrides?: Record<string, unknown>;
      posPayment?: { terminal_id: string; pos_nsp_id: number; payment_type?: number };
    },
  ): Promise<any> {
    const { data, error } = await supabase.functions.invoke('finance-issue-invoice', {
      body: {
        invoice_id: invoiceId,
        submit_fiscal: true,
        skip_signature: opts?.skipSignature,
        fiscal_overrides: opts?.overrides,
        pos_payment: opts?.posPayment,
      },
    });
    if (error) throw await edgeError(error);
    return data;
  },

  /** Finalize a held POS/IRIS receipt after the terminal charge succeeded. */
  async completePos(input: {
    pos_signature_id?: string; invoice_id?: string;
    transaction_id: string; payment_amount?: number; tip_amount?: number;
  }): Promise<any> {
    const { data, error } = await supabase.functions.invoke('finance-issue-invoice', {
      body: { pos_complete: input },
    });
    if (error) throw await edgeError(error);
    return data;
  },

  /** Card/IRIS payment against an invoice already on myDATA: signs it for the terminal; completePos() finishes. */
  async startCardPaymentOnIssuedInvoice(input: {
    invoice_id: string; terminal_id: string; pos_nsp_id: number; payment_type?: number; payment_amount?: number;
  }): Promise<{ pos_signature_id: string; payment_amount: number }> {
    const { data, error } = await supabase.functions.invoke('finance-issue-invoice', {
      body: { pos_old_invoice: input },
    });
    if (error) throw await edgeError(error);
    if (!data?.ok) throw new Error(data?.error ?? 'The provider did not sign the payment.');
    return { pos_signature_id: data.pos_signature_id, payment_amount: Number(data.fiscal?.payment_amount) };
  },

  /** Transmit a credit note; with `posPayment` it is a refund to the card, held for the terminal like a sale. */
  async submitCreditNote(
    creditNoteId: string,
    opts?: { posPayment?: { terminal_id: string; pos_nsp_id: number; payment_type?: number } },
  ): Promise<any> {
    const { data, error } = await supabase.functions.invoke('finance-issue-invoice', {
      body: { credit_note_id: creditNoteId, submit_fiscal: true, pos_payment: opts?.posPayment },
    });
    if (error) throw await edgeError(error);
    if (data && data.ok === false) throw new Error(data.error || 'Credit note transmission failed');
    return data;
  },

  /** Create the 8.4 card receipt (ΠΟΛ.1220 355) that settles already-transmitted invoices. Idempotent by clientToken. */
  async issueEftposReceipt(invoiceIds: string[], paymentType: 7 | 8, clientToken: string): Promise<string> {
    const { data, error } = await supabase.rpc('issue_eftpos_receipt' as never, {
      p_invoice_ids: invoiceIds, p_payment_method_code: paymentType, p_client_token: clientToken,
    } as never);
    if (error) throw error;
    return data as unknown as string;
  },
};

// ── EFT-POS terminal registry (settings_pos parity) ───────────────────────
// Novus posNspId provider codes (token encoding noted for reference).
export const POS_NSP_PROVIDERS: { id: number; name: string; encoding: string }[] = [
  { id: 1, name: 'Mellon', encoding: 'HEX' },
  { id: 2, name: 'Viva', encoding: 'HEX' },
  { id: 3, name: 'Cardlink', encoding: 'BASE64' },
  { id: 4, name: 'Euronet', encoding: 'BASE64' },
  { id: 5, name: 'Nexi', encoding: 'BASE64' },
  { id: 6, name: 'EDPS', encoding: 'BASE64' },
  { id: 7, name: 'Worldline', encoding: 'HEX' },
  { id: 98, name: 'Other (HEX→BASE64)', encoding: 'HEX' },
  { id: 99, name: 'Other (BASE64)', encoding: 'BASE64' },
];

export interface PosTerminal {
  id: string;
  workspace_id: string;
  branch_code: number;
  label: string;
  terminal_id: string;
  pos_nsp_id: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export const posTerminalService = {
  async list(workspaceId: string, branchCode?: number): Promise<PosTerminal[]> {
    let q = supabase.from('pos_terminals').select('*').eq('workspace_id', workspaceId).order('created_at');
    if (branchCode != null) q = q.eq('branch_code', branchCode);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PosTerminal[];
  },
  async listActive(workspaceId: string, branchCode = 0): Promise<PosTerminal[]> {
    const { data, error } = await supabase
      .from('pos_terminals').select('*')
      .eq('workspace_id', workspaceId).eq('branch_code', branchCode).eq('is_active', true)
      .order('label');
    if (error) throw error;
    return (data ?? []) as PosTerminal[];
  },
  async create(input: Omit<PosTerminal, 'id' | 'created_at' | 'is_active'> & { is_active?: boolean }): Promise<PosTerminal> {
    const { data, error } = await supabase.from('pos_terminals').insert(input).select().single();
    if (error) throw error;
    return data as PosTerminal;
  },
  async update(id: string, patch: Partial<Pick<PosTerminal, 'label' | 'terminal_id' | 'pos_nsp_id' | 'branch_code' | 'is_active' | 'notes'>>): Promise<void> {
    const { error } = await supabase.from('pos_terminals').update(patch).eq('id', id);
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('pos_terminals').delete().eq('id', id);
    if (error) throw error;
  },
};
