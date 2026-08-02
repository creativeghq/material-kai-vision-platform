import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

// Client for the fiscal connector abstraction (e-Invoicing).
// Master-key model: the Novus key is configured ONCE on the root (operator)
// workspace; every tenant transmits through it with its own issuer VAT.

export type FiscalCapability =
  | 'legal_invoice'
  | 'pre_invoice_notice'
  | 'pdf_render'
  | 'tax_submission'
  | 'numbering'
  | 'payment_reconciliation';

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
  connector_slug: string;
  capability: string;
  status: 'pending' | 'accepted' | 'offline' | 'rejected' | 'error' | 'cancelled';
  mark: string | null;
  uid: string | null;
  qr_url: string | null;
  invoice_url: string | null;
  series: string | null;
  aa: string | null;
  is_offline: boolean;
  provider_credits: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

export const fiscalConnectorService = {
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
