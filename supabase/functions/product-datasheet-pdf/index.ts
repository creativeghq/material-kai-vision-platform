// The catalogue tier is refused: this publishes the supplier's letterhead, not just facts.
import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { fetchBrandingConfig, fetchTemplateImage, fetchImageBytesFromUrl } from '../_shared/pdf/branding.ts';
import {
  renderBrandedDocument, type BrandedDoc, type BrandedSpecTable,
} from '../_shared/pdf/document.ts';

const URL_TTL_SECONDS = 7 * 24 * 3600;
const MAX_SPEC_ROWS = 60;

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

function specRowsFrom(
  bag: unknown,
  seen: Set<string>,
  isInternal: (key: string) => boolean,
): Array<{ label: string; value: string }> {
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return [];
  const out: Array<{ label: string; value: string }> = [];
  for (const [key, raw] of Object.entries(bag as Json)) {
    if (seen.has(key) || isInternal(key)) continue;
    const value = plain(raw);
    if (!value) continue;
    seen.add(key);
    out.push({
      label: key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      value: value.slice(0, 200),
    });
    if (out.length >= MAX_SPEC_ROWS) break;
  }
  return out;
}

Deno.serve(withApiLogging('product-datasheet-pdf', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error ?? 'Unauthorized' }, 401);

  let body: { product_id?: string };
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
  const { data: certs } = await asUser.rpc('get_product_certificates', { p_product_id: productId });

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
    isInternal = (k) => re.test(k.toLowerCase());
  } catch {
    isInternal = () => true;
  }
  if (!patternText) isInternal = () => true;

  const seen = new Set<string>();
  const specTables: BrandedSpecTable[] = [];
  const blocks: Array<[string, unknown]> = [
    ['Specifications', product.specifications],
    ['Attributes', product.attributes],
    ['Properties', product.properties],
  ];
  for (const [title, bag] of blocks) {
    const rows = specRowsFrom(bag, seen, isInternal);
    if (rows.length) specTables.push({ title, rows });
  }

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
