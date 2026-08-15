/**
 * Shared PDF branding + template resolution.
 *
 * The single, workspace-defined source of truth for how EVERY generated PDF is
 * branded (quotes, catalogs, proformas, …). Resolves, per workspace:
 *   - the branded template images (cover / intro / content-bg / back cover) with
 *     per-slot precedence: this workspace's finance_settings → operator root
 *     default → legacy system_settings → hardcoded filenames, AND
 *   - the "FROM" company identity (name / address / phone / email / VAT), overlaid
 *     from the workspace's own finance_settings business identity (white-label).
 *
 * Extracted verbatim from generate-quote-pdf's data-fetcher so quotes and catalogs
 * share one branding path. Template images live in the `quote-templates` bucket.
 */
import type { DbClient } from '../supabase-client.ts';
import { SupabaseClient } from '@supabase/supabase-js';

import { fetchImageGuardedOrNull } from '../fetch-image.ts';
export interface BrandingConfig {
  // Template image storage paths (in the `quote-templates` bucket). Free-form — whatever
  // the owner uploaded; null when unset. Read from workspace_pdf_templates (per-workspace,
  // owner-managed under Profile), falling back to the operator root's template.
  cover_image_path: string | null;
  intro_page_path: string | null;    // optional page 2 — no page rendered when null
  content_page_path: string | null;
  backcover_image_path: string | null;
  // Cover image pixel dimensions (cached) so the PDF page size can match the design.
  cover_width: number | null;
  cover_height: number | null;
  // "FROM" company identity (from finance_settings business identity).
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_vat: string;
  // Default VAT % for this workspace (used by proforma/quote totals).
  vat_rate_default: number;
}

const TEMPLATE_BUCKET = 'quote-templates';

interface WpsTemplateRow {
  cover_path: string | null;
  intro_path: string | null;
  background_path: string | null;
  backcover_path: string | null;
  cover_width: number | null;
  cover_height: number | null;
}

/** The workspace's own PDF template, falling back per-slot to the operator root's. */
async function fetchWorkspaceTemplate(supabase: DbClient, workspaceId?: string | null): Promise<WpsTemplateRow> {
  const cols = 'cover_path, intro_path, background_path, backcover_path, cover_width, cover_height';
  const empty: WpsTemplateRow = { cover_path: null, intro_path: null, background_path: null, backcover_path: null, cover_width: null, cover_height: null };
  let row: WpsTemplateRow | null = null;
  if (workspaceId) {
    const { data } = await supabase.from('workspace_pdf_templates').select(cols).eq('workspace_id', workspaceId).maybeSingle();
    row = (data as WpsTemplateRow) ?? null;
  }
  // Operator root template = the default every tenant inherits when a slot is unset.
  if (!row || !row.cover_path) {
    const { data: rootWs } = await supabase.from('workspaces').select('id').eq('is_root', true).limit(1).maybeSingle();
    if (rootWs?.id && rootWs.id !== workspaceId) {
      const { data } = await supabase.from('workspace_pdf_templates').select(cols).eq('workspace_id', rootWs.id).maybeSingle();
      const r = data as WpsTemplateRow | null;
      if (r) {
        row = {
          cover_path: row?.cover_path ?? r.cover_path,
          intro_path: row?.intro_path ?? r.intro_path,
          background_path: row?.background_path ?? r.background_path,
          backcover_path: row?.backcover_path ?? r.backcover_path,
          cover_width: row?.cover_width ?? r.cover_width,
          cover_height: row?.cover_height ?? r.cover_height,
        };
      }
    }
  }
  return row ?? empty;
}

/**
 * Resolve the branded config for a workspace: template images from the per-workspace
 * PDF template vault (workspace → operator root), company identity from finance_settings.
 */
export async function fetchBrandingConfig(
  supabase: DbClient,
  workspaceId?: string | null,
): Promise<BrandingConfig> {
  // Company identity default (legacy operator-wide setting).
  const { data: sysRow } = await supabase
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', 'quote_pdf_template')
    .maybeSingle();
  const g = (sysRow?.setting_value ?? {}) as Record<string, any>;

  const tpl = await fetchWorkspaceTemplate(supabase, workspaceId);

  const base: BrandingConfig = {
    cover_image_path: tpl.cover_path,
    intro_page_path: tpl.intro_path,
    content_page_path: tpl.background_path,
    backcover_image_path: tpl.backcover_path,
    cover_width: tpl.cover_width,
    cover_height: tpl.cover_height,
    company_name: g.company_name || '',
    company_address: g.company_address || '',
    company_phone: g.company_phone || '',
    company_email: g.company_email || '',
    company_vat: g.company_vat || '',
    vat_rate_default: g.vat_rate_default ?? 24,
  };

  return applyWorkspaceBranding(supabase, base, workspaceId);
}

/**
 * White-label overlay: replace the "FROM" company identity with the workspace's own
 * finance_settings business identity. Only overlays when the workspace set a
 * business_name; otherwise the global template identity stands.
 */
export async function applyWorkspaceBranding(
  supabase: DbClient,
  config: BrandingConfig,
  workspaceId: string | null | undefined,
): Promise<BrandingConfig> {
  if (!workspaceId) return config;
  try {
    // NOTE the column is `default_vat_rate`, NOT `vat_rate_default` (the name of the
    // BrandingConfig field it feeds). Getting this backwards made PostgREST reject the
    // WHOLE select, so `fs` came back null and the `if (!fs)` below returned the
    // OPERATOR's identity — every tenant's quote/catalog/proforma PDF carried our
    // company name, address and VAT number instead of their own.
    const { data: fs, error } = await supabase
      .from('finance_settings')
      .select('business_name, business_address, business_street_number, business_city, business_postal_code, business_phone, business_email, business_vat, contact_phone, contact_email, default_vat_rate')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    // Distinguish "this workspace has no finance_settings row" (fine — fall back to the
    // template identity) from "the query is broken" (never fine — it silently mis-brands
    // every document). The latter must be loud.
    if (error) {
      console.error('[branding] finance_settings lookup failed — PDFs would carry the operator identity:', error.message);
      return config;
    }
    if (!fs) return config;

    const addressLine = [
      [fs.business_address, fs.business_street_number].filter(Boolean).join(' '),
      [fs.business_postal_code, fs.business_city].filter(Boolean).join(' '),
    ].filter(Boolean).join(', ');

    return {
      ...config,
      company_name: fs.business_name || config.company_name,
      company_address: addressLine || config.company_address,
      company_phone: fs.business_phone || fs.contact_phone || config.company_phone,
      company_email: fs.business_email || fs.contact_email || config.company_email,
      company_vat: fs.business_vat || config.company_vat,
      vat_rate_default: fs.default_vat_rate ?? config.vat_rate_default,
    };
  } catch {
    return config;
  }
}

/** Download a branded template image from the `quote-templates` bucket (optional — null on miss). */
export async function fetchTemplateImage(
  supabase: DbClient,
  path: string | null | undefined,
): Promise<Uint8Array | null> {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage.from(TEMPLATE_BUCKET).download(path);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/** Fetch an image from a public URL. Null on any failure.
 *
 * The docstring here used to promise "https only, 8 MB cap" and the body delivered
 * neither: the regex accepted `http://`, `redirect: 'follow'` let a public URL 302
 * to an internal address, and the cap was checked AFTER `arrayBuffer()` had already
 * read everything. `image_url` on a catalog material is model-supplied
 * (`add_material_to_catalog`), so this was the reachable end of audit #352 `A8`.
 * One helper now — see _shared/fetch-image.ts for why there were five. */
export async function fetchImageBytesFromUrl(url: string | null | undefined): Promise<Uint8Array | null> {
  const img = await fetchImageGuardedOrNull(url);
  return img?.bytes ?? null;
}
