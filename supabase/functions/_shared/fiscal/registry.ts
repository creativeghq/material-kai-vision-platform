// Connector registry + per-workspace resolution.
// MASTER-KEY model: the Novus key belongs to the OPERATOR (master), under their
// Novus subscription. A Novus account authorizes many issuer VAT numbers, so every
// sub-tenant transmits THROUGH the master key with their OWN VAT as issuer.vatNumber
// (the issuer identity comes from the submitting workspace's finance_settings, built
// in invoice-builder.ts).

import { novusConnector } from './novus.ts';
import { resolveNovusConnection } from './novusConnection.ts';
import { resolveSecret } from '../secrets.ts';
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
  // Every workspace below the operator transmits through the SAME master Novus
  // connector by default — there is no per-workspace connector choice. An explicit
  // binding can still override with a future connector, but absence means the platform default.
  const { data: binding } = await supabase
    .from('workspace_fiscal_bindings')
    .select('connector_slug, is_active')
    .eq('workspace_id', workspaceId)
    .eq('capability', capability)
    .maybeSingle();

  // Default to Novus for the legal-invoice/tax-submission capabilities.
  const DEFAULT_SLUG = (capability === 'legal_invoice' || capability === 'pre_invoice_notice' || capability === 'tax_submission')
    ? 'novus' : undefined;
  const slug: string | undefined = (binding?.is_active === false ? undefined : binding?.connector_slug) ?? DEFAULT_SLUG;
  if (!slug) {
    return { ok: false, error: `No connector available for "${capability}".`, code: 'no_binding' };
  }

  const connector = getConnector(slug);
  if (!connector) {
    return { ok: false, error: `Connector "${slug}" is not implemented yet.`, code: 'not_implemented' };
  }

  const [conn, b2gRes] = await Promise.all([
    resolveNovusConnection(supabase),
    resolveSecret(supabase, 'NOVUS_B2G_API_KEY'),
  ]);

  const { isSandbox, apiKey } = conn;
  const baseUrl = slug === 'novus' ? conn.baseUrl : '';

  const ctx: FiscalConnectorContext = { baseUrl, apiKey, isSandbox, b2gApiKey: b2gRes.value || undefined };
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
