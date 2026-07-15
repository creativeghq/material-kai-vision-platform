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
import { SupabaseClient } from '@supabase/supabase-js';

export interface BrandingConfig {
  // Template image storage paths (in the `quote-templates` bucket).
  cover_image_path: string;
  intro_page_path: string;
  content_page_path: string;
  backcover_image_path: string;
  // "FROM" company identity.
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_vat: string;
  // Default VAT % for this workspace (used by proforma/quote totals).
  vat_rate_default: number;
}

const TEMPLATE_BUCKET = 'quote-templates';

/**
 * Resolve the branded template config for a workspace. Per-slot precedence:
 * workspace finance_settings → operator root default → legacy system_settings → hardcoded.
 */
export async function fetchBrandingConfig(
  supabase: SupabaseClient,
  workspaceId?: string | null,
): Promise<BrandingConfig> {
  const { data: sysRow } = await supabase
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', 'quote_pdf_template')
    .maybeSingle();
  const g = (sysRow?.setting_value ?? {}) as Record<string, any>;

  const tplCols =
    'quote_template_cover_path, quote_template_intro_path, quote_template_content_path, quote_template_backcover_path';

  let ws: Record<string, any> = {};
  if (workspaceId) {
    const { data } = await supabase.from('finance_settings').select(tplCols).eq('workspace_id', workspaceId).maybeSingle();
    ws = data ?? {};
  }

  // Operator root template = the default every tenant inherits.
  let root: Record<string, any> = ws;
  const { data: rootWs } = await supabase.from('workspaces').select('id').eq('is_root', true).limit(1).maybeSingle();
  if (rootWs?.id && rootWs.id !== workspaceId) {
    const { data } = await supabase.from('finance_settings').select(tplCols).eq('workspace_id', rootWs.id).maybeSingle();
    root = data ?? {};
  }

  const cover = ws.quote_template_cover_path || root.quote_template_cover_path || g.first_page_path || g.cover_image_path || 'cover.png';
  const intro = ws.quote_template_intro_path || root.quote_template_intro_path || g.intro_page_path || '';
  const content = ws.quote_template_content_path || root.quote_template_content_path || g.content_page_path || g.items_background_path || 'items-background.png';
  const backcover = ws.quote_template_backcover_path || root.quote_template_backcover_path || g.last_page_path || g.backcover_image_path || 'backcover.png';

  const base: BrandingConfig = {
    cover_image_path: cover,
    intro_page_path: intro,
    content_page_path: content,
    backcover_image_path: backcover,
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
  supabase: SupabaseClient,
  config: BrandingConfig,
  workspaceId: string | null | undefined,
): Promise<BrandingConfig> {
  if (!workspaceId) return config;
  try {
    const { data: fs } = await supabase
      .from('finance_settings')
      .select('business_name, business_address, business_street_number, business_city, business_postal_code, business_phone, business_email, business_vat, contact_phone, contact_email, vat_rate_default')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
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
      vat_rate_default: fs.vat_rate_default ?? config.vat_rate_default,
    };
  } catch {
    return config;
  }
}

/** Download a branded template image from the `quote-templates` bucket (optional — null on miss). */
export async function fetchTemplateImage(
  supabase: SupabaseClient,
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

/** Fetch an image from a public URL (https only, 8 MB cap, image/* only). Null on any failure. */
export async function fetchImageBytesFromUrl(url: string | null | undefined): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    if (!/^https?:\/\//i.test(url)) return null;
    const resp = await fetch(url, { redirect: 'follow' });
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type') || '';
    if (ct && !ct.startsWith('image/')) return null;
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (buf.length === 0 || buf.length > 8 * 1024 * 1024) return null;
    return buf;
  } catch {
    return null;
  }
}
