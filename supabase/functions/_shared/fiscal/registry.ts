// Connector registry + per-workspace resolution.
//
// MASTER-KEY model: the Novus key belongs to the OPERATOR (master), under their
// Novus subscription. A Novus account authorizes many issuer VAT numbers, so every
// sub-tenant transmits THROUGH the master key with their OWN VAT as issuer.vatNumber
// (the issuer identity comes from the submitting workspace's finance_settings, built
// in invoice-builder.ts). The master's credit balance is debited for everyone; we
// meter/bill sub-tenants via our own credit system.
//
// resolveWorkspaceConnector therefore:
//   - reads the SUBMITTING workspace's binding for the capability (C3 — is this
//     tenant enabled for e-invoicing, and via which connector),
//   - resolves the KEY from the MASTER: env NOVUS_API_KEY first, else the ROOT
//     workspace's credential row (admin-configurable without a redeploy).
// When no master key is configured yet, isConfigured=false — the caller surfaces a
// clear "add the master key" message instead of calling with an empty key.

import { novusConnector, novusBaseUrl } from './novus.ts';
import type { FiscalCapability, FiscalConnector, FiscalConnectorContext } from './types.ts';

const CONNECTORS: Record<string, FiscalConnector> = {
  novus: novusConnector,
};

export function getConnector(slug: string): FiscalConnector | null {
  return CONNECTORS[slug] ?? null;
}

export interface ResolvedConnector {
  slug: string;
  connector: FiscalConnector;
  ctx: FiscalConnectorContext;
  isConfigured: boolean;
}

export type ResolveResult =
  | { ok: true; resolved: ResolvedConnector }
  | { ok: false; error: string; code: 'no_binding' | 'not_implemented' | 'not_configured' };

export async function resolveWorkspaceConnector(
  supabase: any,
  workspaceId: string,
  capability: FiscalCapability,
): Promise<ResolveResult> {
  const { data: binding } = await supabase
    .from('workspace_fiscal_bindings')
    .select('connector_slug, is_active')
    .eq('workspace_id', workspaceId)
    .eq('capability', capability)
    .maybeSingle();

  const slug: string | undefined = binding?.connector_slug;
  if (!slug || binding?.is_active === false) {
    return { ok: false, error: `No connector is bound for "${capability}" in this workspace.`, code: 'no_binding' };
  }

  const connector = getConnector(slug);
  if (!connector) {
    return { ok: false, error: `Connector "${slug}" is not implemented yet.`, code: 'not_implemented' };
  }

  // MASTER credentials: resolve from the ROOT (operator) workspace, never the
  // submitting tenant. Env wins (deploy-time master key); else the root credential
  // row (admin-configurable). The submitting tenant only supplies its issuer VAT.
  const { data: root } = await supabase.from('workspaces').select('id').eq('is_root', true).maybeSingle();
  const { data: cred } = root?.id
    ? await supabase
        .from('workspace_fiscal_credentials')
        .select('credentials, is_sandbox')
        .eq('workspace_id', root.id)
        .eq('connector_slug', slug)
        .maybeSingle()
    : { data: null };

  const isSandbox: boolean = cred?.is_sandbox ?? (Deno.env.get('NOVUS_SANDBOX') !== 'false');
  const apiKey: string = Deno.env.get('NOVUS_API_KEY') ?? (cred?.credentials?.api_key as string | undefined) ?? '';
  const baseUrl: string =
    (cred?.credentials?.base_url as string | undefined) ?? (slug === 'novus' ? novusBaseUrl(isSandbox) : '');

  const ctx: FiscalConnectorContext = { baseUrl, apiKey, isSandbox };
  const isConfigured = !!apiKey && !!baseUrl;
  if (!isConfigured) {
    return {
      ok: false,
      code: 'not_configured',
      error: `The master "${slug}" key is not configured yet. The operator adds it once (env NOVUS_API_KEY or the operator e-Invoicing settings); all tenants transmit through it.`,
    };
  }
  return { ok: true, resolved: { slug, connector, ctx, isConfigured } };
}
