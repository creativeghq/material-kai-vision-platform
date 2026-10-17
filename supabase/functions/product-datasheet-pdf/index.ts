// The catalogue tier is refused: this publishes the supplier's letterhead, not just facts.
import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { normalizeFieldKey } from '../_shared/fieldKeyNormalize.generated.ts';
import { fetchBrandingConfig, fetchTemplateImage, fetchImageBytesFromUrl } from '../_shared/pdf/branding.ts';
import {
  renderBrandedDocument, type BrandedDoc, type BrandedSpecTable,
} from '../_shared/pdf/document.ts';

const URL_TTL_SECONDS = 7 * 24 * 3600;
const MAX_SPEC_ROWS = 60;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Json = Record<string, unknown>;

function plain(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map((x) => plain(x)).filter(Boolean).join(', ') || null;
  if (typeof v === 'object') {
    const env = v as Json;
    if ('value' in env) return plain(env.value);
    return null;
  }
  const s = String(v).trim();
  return s === '' ? null : s;
}

interface RegistryField {
  field_name: string;
  display_name: string | null;
  label_by_category: Record<string, string> | null;
  section: string | null;
  sort_order: number | null;
  aliases: string[] | null;
}

interface SpecValue { field: RegistryField; value: string }

/** Exact field name first, then aliases — the registry is the only source of what a key means. */
function registryResolver(fields: RegistryField[]): (key: string) => RegistryField | null {
  const byName = new Map<string, RegistryField>();
  const byAlias = new Map<string, RegistryField>();
  for (const f of fields) byName.set(f.field_name.toLowerCase(), f);
  for (const f of fields) {
    for (const a of f.aliases ?? []) {
      const k = String(a).toLowerCase();
      if (!byName.has(k) && !byAlias.has(k)) byAlias.set(k, f);
    }
  }
  return (key) => {
    const lower = key.toLowerCase();
    const folded = normalizeFieldKey(key);
    return byName.get(lower) ?? byName.get(folded) ?? byAlias.get(lower) ?? byAlias.get(folded) ?? null;
  };
}

function collectSpecValues(
  bags: unknown[],
  resolve: (key: string) => RegistryField | null,
  isInternal: (key: string) => boolean,
): SpecValue[] {
  const out = new Map<string, SpecValue>();
  for (const bag of bags) {
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) continue;
    for (const [key, raw] of Object.entries(bag as Json)) {
      if (isInternal(key)) continue;
      const field = resolve(key);
      if (!field || out.has(field.field_name)) continue;
      const value = plain(raw);
      if (!value) continue;
      out.set(field.field_name, { field, value: value.slice(0, 200) });
    }
  }
  return [...out.values()];
}

function humanise(key: string): string {
  const s = key.replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

Deno.serve(withApiLogging('product-datasheet-pdf', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error ?? 'Unauthorized' }, 401);

  let body: { product_id?: string; today?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const productId = body.product_id;
  if (!productId) return json({ error: 'product_id is required' }, 400);

  const asUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const { data: detail, error: dErr } = await asUser.rpc('get_product_detail', { p_product_id: productId });
  if (dErr) return json({ error: 'Could not load the product' }, 500);
  const product = detail as Json | null;
  if (!product) return json({ error: 'Not found' }, 404);
  const tier = String(product.viewer_tier ?? '');
  if (tier !== 'internal' && tier !== 'member') return json({ error: 'Not found' }, 404);

  const workspaceId = String(product.workspace_id ?? '');
  // The caller's day, not UTC: a certificate expiring tonight would print as expired.
  const today = ISO_DATE.test(body.today ?? '') ? body.today : null;
  const { data: certs } = await asUser.rpc('get_product_certificates', {
    p_product_id: productId,
    ...(today ? { p_today: today } : {}),
  });

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const branding = await fetchBrandingConfig(service, workspaceId);

  const { data: assoc } = await service
    .from('image_product_associations')
    .select('overall_score, document_images(image_url)')
    .eq('product_id', productId)
    .order('overall_score', { ascending: false, nullsFirst: false })
    .limit(1);
  const imageUrl = (assoc?.[0] as Json | undefined)?.document_images
    ? String(((assoc![0] as Json).document_images as Json).image_url ?? '')
    : '';
  const itemImages: Record<string, Uint8Array> = {};
  if (imageUrl) {
    const bytes = await fetchImageBytesFromUrl(imageUrl);
    if (bytes) itemImages.product = bytes;
  }

  // FETCHED, never restated; an unreadable pattern withholds rather than printing a cost.
  const { data: patternText } = await asUser.rpc('internal_product_field_pattern');
  let isInternal: (key: string) => boolean;
  try {
    const re = new RegExp(String(patternText), 'i');
    isInternal = (k) => re.test(normalizeFieldKey(k));
  } catch {
    isInternal = () => true;
  }
  if (!patternText) isInternal = () => true;

  const [registryRes, sectionsRes, categoryRes] = await Promise.all([
    service.from('material_metadata_fields')
      .select('field_name, display_name, label_by_category, section, sort_order, aliases')
      .eq('status', 'active'),
    service.from('material_field_sections').select('section_key, display_order'),
    product.category_id
      ? service.from('material_categories').select('category_key').eq('id', String(product.category_id)).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (registryRes.error || sectionsRes.error || categoryRes.error) {
    return json({ error: 'Could not load the field registry' }, 500);
  }
  const categoryKey = String((categoryRes.data as Json | null)?.category_key ?? product.category ?? '');

  // PDF ingest writes `metadata`; every bag is read, and the first registered value wins.
  const values = collectSpecValues(
    [product.attributes, product.specifications, product.metadata, product.properties],
    registryResolver((registryRes.data ?? []) as RegistryField[]),
    isInternal,
  );

  // Per-key sensitivity from the SQL verdict in one call; a key it does not return is withheld.
  const { data: kept, error: redactErr } = await service.rpc('redact_internal_product_fields', {
    p_data: Object.fromEntries(values.map((v) => [v.field.field_name, true])),
  });
  const publicKeys = new Set(!redactErr && kept && typeof kept === 'object' ? Object.keys(kept as Json) : []);
  const publishable = values.filter((v) => publicKeys.has(v.field.field_name));

  const sectionOrder = new Map(((sectionsRes.data ?? []) as Json[])
    .map((r) => [String(r.section_key), Number(r.display_order ?? 0)]));
  const bySection = new Map<string, SpecValue[]>();
  for (const v of publishable.slice(0, MAX_SPEC_ROWS)) {
    const key = v.field.section ?? 'other';
    bySection.set(key, [...(bySection.get(key) ?? []), v]);
  }
  const specTables: BrandedSpecTable[] = [...bySection.entries()]
    .sort(([a], [b]) => (sectionOrder.get(a) ?? 9999) - (sectionOrder.get(b) ?? 9999))
    .map(([section, rows]) => ({
      title: humanise(section),
      rows: rows
        .sort((x, y) => (x.field.sort_order ?? 9999) - (y.field.sort_order ?? 9999))
        .map((v) => ({
          label: v.field.label_by_category?.[categoryKey] ?? v.field.display_name ?? humanise(v.field.field_name),
          value: v.value,
        })),
    }));

  const certRows = (Array.isArray(certs) ? certs : []).map((c) => {
    const cert = c as Json;
    const parts = [
      cert.result ? String(cert.result) : null,
      cert.certificate_number ? `No. ${cert.certificate_number}` : null,
      cert.issuer ? String(cert.issuer) : null,
      cert.valid_until ? `valid to ${cert.valid_until}` : null,
    ].filter(Boolean);
    return { label: String(cert.standard ?? 'Certificate'), value: parts.join(' · ') || '—' };
  });
  if (certRows.length) specTables.push({ title: 'Certificates', rows: certRows });

  const doc: BrandedDoc = {
    doc_label: 'Product datasheet',
    number: (product.sku as string | null) ?? null,
    subtitle: (product.category as string | null) ?? null,
    created_at: new Date().toISOString(),
    currency: 'EUR',
    layout: 'list',
    company: {
      name: branding.company_name,
      address: branding.company_address,
      phone: branding.company_phone,
      email: branding.company_email,
      vat: branding.company_vat,
    },
    show_client_page: false,
    sections: [{
      items: [{
        image_key: itemImages.product ? 'product' : null,
        name: String(product.name ?? 'Product'),
        description: (product.long_description as string | null)
          ?? (product.description as string | null) ?? null,
        sku: (product.sku as string | null) ?? null,
      }],
    }],
    spec_tables: specTables.length ? specTables : null,
    spec_title: 'Technical specification',
    totals: null,
  };

  const [coverBytes, introBytes, bgBytes, backBytes] = await Promise.all([
    fetchTemplateImage(service, branding.cover_image_path),
    fetchTemplateImage(service, branding.intro_page_path),
    fetchTemplateImage(service, branding.content_page_path),
    fetchTemplateImage(service, branding.backcover_image_path),
  ]);

  let pdfBytes: Uint8Array;
  try {
    const rendered = await renderBrandedDocument(doc, {
      coverBytes, introBytes, contentBgBytes: bgBytes, backCoverBytes: backBytes, itemImages,
    });
    pdfBytes = rendered.pdfBytes;
  } catch (e) {
    return json({ error: `Could not render the datasheet: ${(e as Error).message}` }, 500);
  }

  const path = `datasheets/${workspaceId}/${productId}-${Date.now()}.pdf`;
  const { error: upErr } = await service.storage
    .from('pdf-documents')
    .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) return json({ error: 'Could not store the datasheet' }, 502);

  const { data: signed } = await service.storage
    .from('pdf-documents')
    .createSignedUrl(path, URL_TTL_SECONDS, { download: `${String(product.name ?? 'datasheet')}.pdf` });
  if (!signed?.signedUrl) return json({ error: 'Could not sign the datasheet' }, 502);

  return json({ url: signed.signedUrl, expires_in: URL_TTL_SECONDS });
}));
