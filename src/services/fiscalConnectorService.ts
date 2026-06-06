import { supabase } from '@/integrations/supabase/client';

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

  async listSubmissions(invoiceId: string): Promise<FiscalSubmission[]> {
    const { data } = await supabase
      .from('fiscal_submissions')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false });
    return (data ?? []) as FiscalSubmission[];
  },

  /** Submit an existing invoice to its workspace's legal_invoice connector (Novus → myDATA). */
  async submitInvoice(
    invoiceId: string,
    opts?: { skipSignature?: boolean; overrides?: Record<string, unknown> },
  ): Promise<any> {
    const { data, error } = await supabase.functions.invoke('finance-issue-invoice', {
      body: {
        invoice_id: invoiceId,
        submit_fiscal: true,
        skip_signature: opts?.skipSignature,
        fiscal_overrides: opts?.overrides,
      },
    });
    if (error) throw error;
    return data;
  },
};
