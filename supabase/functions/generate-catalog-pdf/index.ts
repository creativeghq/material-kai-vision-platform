import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { fetchCatalog } from './data-fetcher.ts';
import type { CatalogPDFRequest, CatalogPDFResponse } from './types.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { fetchBrandingConfig, fetchTemplateImage, fetchImageBytesFromUrl } from '../_shared/pdf/branding.ts';
import { renderBrandedDocument, type BrandedDoc, type BrandedDocSection } from '../_shared/pdf/document.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const round2 = (n: number) => Math.round(n * 100) / 100;
// Cap embedded product images so a huge catalog can't blow the request budget.
const MAX_ITEM_IMAGES = 60;
// (redeploy nudge — prior deploy hit a transient Supabase 502 during upload)

async function authenticate(req: Request): Promise<{ ok: boolean; userId?: string; isService?: boolean; error?: string }> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  // Internal server-to-server callers (agent-chat + other edge fns using the service-role
  // client) authenticate with the platform service key, which supabase-js places on the
  // `apikey` header rather than Authorization. Accept the service key on EITHER header.
  const apiKeyHeader = (req.headers.get('apikey') || req.headers.get('x-api-key') || '').trim();
  if (token === supabaseServiceKey || (apiKeyHeader && apiKeyHeader === supabaseServiceKey)) {
    return { ok: true, isService: true };
  }
  if (!token) return { ok: false, error: 'Missing Authorization header' };
  try {
    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user?.id) return { ok: false, error: 'Invalid JWT' };
    return { ok: true, userId: data.user.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Auth failed' };
  }
}

Deno.serve(withApiLogging('generate-catalog-pdf', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const auth = await authenticate(req);
  if (!auth.ok) return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  let catalogId = '';

  try {
    const body: CatalogPDFRequest = await req.json();
    catalogId = body.catalog_id;
    if (!catalogId) return jsonResponse({ success: false, error: 'Missing catalog_id' }, 400);

    const catalog = await fetchCatalog(supabase, catalogId);

    if (!auth.isService && auth.userId && catalog.owner_user_id !== auth.userId) {
      return jsonResponse({ success: false, error: 'Not authorized for this catalog' }, 403);
    }

    const sections = (catalog.body_data?.sections || []) as Array<{ title?: string; intro?: string | null; materials?: any[] }>;
    const totalMaterials = sections.reduce((acc, s) => acc + (s.materials?.length || 0), 0);
    if (totalMaterials === 0) {
      await supabase.from('presentation_catalogs')
        .update({ status: 'failed', status_message: 'No materials in catalog body' })
        .eq('id', catalogId);
      return jsonResponse({ success: false, error: 'Catalog has no materials' }, 422);
    }

    await supabase.from('presentation_catalogs')
      .update({ status: 'generating', status_message: null })
      .eq('id', catalogId);

    // Layout + proforma resolution: request param wins, else the catalog's own body_data
    // hint, else defaults. "list" (quote-style table) is the default; "grid" keeps cards.
    const bodyMeta = (catalog.body_data ?? {}) as Record<string, any>;
    const layout: 'list' | 'grid' = body.layout === 'grid' ? 'grid' : body.layout === 'list' ? 'list' : (bodyMeta.layout === 'grid' ? 'grid' : 'list');
    const isProforma = body.proforma === true || bodyMeta.proforma === true;
    const currency = (bodyMeta.currency as string) || firstMaterialCurrency(sections) || 'EUR';

    // Workspace-defined branding (finance_settings) — the same source quotes use.
    const branding = await fetchBrandingConfig(supabase, catalog.workspace_id ?? null);
    const vatRate = body.vat_rate ?? (bodyMeta.vat_rate as number) ?? branding.vat_rate_default ?? 24;

    // Template images (cover / intro / content bg / back cover) from the branded template.
    const [coverBytes, introBytes, bgBytes, backBytes] = await Promise.all([
      fetchTemplateImage(supabase, branding.cover_image_path),
      fetchTemplateImage(supabase, branding.intro_page_path),
      fetchTemplateImage(supabase, branding.content_page_path),
      fetchTemplateImage(supabase, branding.backcover_image_path),
    ]);

    // Map sections → normalized doc sections; collect item images (capped).
    // Pricing lives in material.specs, NOT the top-level `price`:
    //   quantity_tmet / quantity_tem = billed quantity, net_value = line total
    //   (qty × unit price − discount), discount_pct, vat_pct. `price` is the UNIT price.
    const itemImages: Record<string, Uint8Array> = {};
    let imgCount = 0;
    const docSections: BrandedDocSection[] = [];
    let subtotalNet = 0;
    let grossSum = 0;
    let discountSum = 0;
    let vatSum = 0;
    let anyPriced = false;
    let matIdx = 0;
    for (const s of sections) {
      const items = [];
      for (const mat of (s.materials || [])) {
        const specs = (mat.specs ?? {}) as Record<string, any>;
        const unitPrice = mat.price != null ? Number(mat.price)
          : specs.unit_price != null ? Number(specs.unit_price) : null;
        const qty = specs.quantity_tmet != null ? Number(specs.quantity_tmet)
          : specs.quantity_tem != null ? Number(specs.quantity_tem)
          : specs.quantity != null ? Number(specs.quantity) : 1;
        // Net line value (after discount) = net_value if present, else qty × unit price.
        const netValue = specs.net_value != null ? Number(specs.net_value)
          : (unitPrice != null ? round2(unitPrice * qty) : null);
        const lineVatPct = specs.vat_pct != null ? Number(specs.vat_pct) : vatRate;
        const discountPct = specs.discount_pct != null ? Number(specs.discount_pct) : 0;
        // Pre-discount value = net + discount, else unit × qty; discount = the difference.
        let discountValue = specs.discount_value != null ? Number(specs.discount_value) : null;
        const grossVal = (netValue != null && discountValue != null) ? round2(netValue + discountValue)
          : (unitPrice != null ? round2(unitPrice * qty) : netValue);
        if (discountValue == null && grossVal != null && netValue != null) discountValue = round2(grossVal - netValue);

        if (netValue != null && !Number.isNaN(netValue)) {
          subtotalNet += netValue;
          vatSum += netValue * lineVatPct / 100;
          anyPriced = true;
        }
        if (grossVal != null && !Number.isNaN(grossVal)) grossSum += grossVal;
        if (discountValue != null && !Number.isNaN(discountValue)) discountSum += discountValue;

        const key = mat.id || `m${matIdx}`;
        matIdx++;
        if (mat.image_url && imgCount < MAX_ITEM_IMAGES) {
          const bytes = await fetchImageBytesFromUrl(mat.image_url);
          if (bytes) { itemImages[key] = bytes; imgCount++; }
        }
        items.push({
          image_key: key,
          name: mat.name || 'Item',
          description: mat.description ?? null,
          sku: specs.sku ?? specs.code ?? null,
          size_color: sizeColorFromSpecs(specs),
          quantity: qty,
          unit: specs.unit ?? 'pcs',
          unit_price: unitPrice,
          discount_pct: discountPct,
          discount_value: discountValue,
          vat_pct: lineVatPct,
          line_total: netValue,
          specs,
        });
      }
      // Drop the translate step's page-split section titles ("Page 1 — … (Items 1–6)")
      // — they're pagination artifacts, not real categories. Keeps one clean list.
      const rawTitle = s.title ?? null;
      const title = rawTitle && /^\s*(page|σελ[ίι]δα)\s*\d+/i.test(rawTitle) ? null : rawTitle;
      docSections.push({ title, intro: s.intro ?? null, items });
    }

    // Totals only when this is a proforma AND at least one material is priced.
    // Subtotal = Σ net line values; VAT summed per line (handles mixed rates).
    const totals = (isProforma && anyPriced)
      ? {
          subtotal: round2(subtotalNet),
          gross_subtotal: round2(grossSum),
          discount_total: round2(discountSum),
          vat_rate: vatRate,
          vat_amount: round2(vatSum),
          grand_total: round2(subtotalNet + vatSum),
          currency,
        }
      : null;

    const cover = (catalog.cover_data ?? {}) as Record<string, any>;
    const doc: BrandedDoc = {
      doc_label: isProforma ? 'PROFORMA' : 'CATALOG',
      number: cover.number ?? null,
      subtitle: cover.subtitle ?? catalog.subtitle ?? null,
      created_at: cover.date ?? new Date().toISOString(),
      currency,
      layout,
      company: {
        name: branding.company_name || null,
        address: branding.company_address || null,
        phone: branding.company_phone || null,
        email: branding.company_email || null,
        vat: branding.company_vat || null,
      },
      client: cover.client_name ? { contact_name: cover.client_name } : null,
      // Show the client/company page for proformas (a Προσφορά needs a FROM + totals);
      // a plain presentation catalog goes straight cover → items → back.
      show_client_page: isProforma,
      notes: (catalog.body_data as any)?.notes ?? null,
      sections: docSections,
      totals,
      closing_message: (catalog.back_cover_data as any)?.closing_message ?? null,
      // Page size + orientation follow the workspace's cover template image.
      page_width: branding.cover_width,
      page_height: branding.cover_height,
    };

    const { pdfBytes, pageCount } = await renderBrandedDocument(doc, {
      coverBytes,
      introBytes,
      contentBgBytes: bgBytes,
      backCoverBytes: backBytes,
      itemImages,
    });

    // Clear previous output before writing the new one (rebuild replaces, not accumulates).
    try {
      const { data: existing } = await supabase.storage.from('pdf-documents').list(`catalog-output/${catalogId}`);
      if (existing && existing.length > 0) {
        await supabase.storage.from('pdf-documents').remove(existing.map((f) => `catalog-output/${catalogId}/${f.name}`));
      }
    } catch (_) { /* best-effort */ }

    const storagePath = `catalog-output/${catalogId}/catalog-${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from('pdf-documents')
      .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: signed } = await supabase.storage.from('pdf-documents').createSignedUrl(storagePath, 60 * 60 * 24 * 7);

    await supabase.from('presentation_catalogs')
      .update({
        status: catalog.status === 'published' ? 'published' : 'ready',
        status_message: null,
        pdf_storage_path: storagePath,
        // Invariant #8: do NOT persist the signed URL on a private bucket — it expires. Store only the
        // storage path; both readers (builder page + catalog-access) re-sign fresh on demand.
        pdf_generated_at: new Date().toISOString(),
        page_count: pageCount,
      })
      .eq('id', catalogId);

    return jsonResponse({ success: true, pdf_url: signed?.signedUrl, pdf_storage_path: storagePath, page_count: pageCount });
  } catch (err) {
    console.error('[generate-catalog-pdf] error:', err);
    if (catalogId) {
      await supabase.from('presentation_catalogs')
        .update({ status: 'failed', status_message: err instanceof Error ? err.message : String(err) })
        .eq('id', catalogId);
    }
    return jsonResponse({ success: false, error: err instanceof Error ? err.message : 'PDF generation failed' }, 500);
  }
}));

function sizeColorFromSpecs(specs: Record<string, any> | null | undefined): string | null {
  if (!specs) return null;
  const parts = [specs.size, specs.dimensions, specs.color, specs.finish].filter(Boolean);
  return parts.length ? parts.join(' / ') : null;
}

function firstMaterialCurrency(sections: Array<{ materials?: any[] }>): string | null {
  for (const s of sections) for (const m of (s.materials || [])) if (m.currency) return m.currency;
  return null;
}

function jsonResponse(body: CatalogPDFResponse, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
