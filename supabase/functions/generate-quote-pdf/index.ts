import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { fetchQuoteData, fetchStorageFile, fetchImageBytesFromUrl } from './data-fetcher.ts';
import type { QuotePDFRequest, QuotePDFResponse, QuoteData } from './types.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
// Unified branded-document renderer — the SAME module catalogs use, so quotes,
// catalogs (and other branded sales docs) share one control + workspace branding.
import { fetchBrandingConfig, fetchTemplateImage, type BrandingConfig } from '../_shared/pdf/branding.ts';
import { renderBrandedDocument, type BrandedDoc, type BrandedDocItem } from '../_shared/pdf/document.ts';

/** Map a quote + resolved branding into the shared branded-document model. */
function mapQuoteToBrandedDoc(quote: QuoteData, branding: BrandingConfig): BrandedDoc {
  const items: BrandedDocItem[] = quote.items.map((it) => ({
    image_key: it.image_url ? it.id : null,
    name: it.product_name,
    description: it.description,
    sku: it.sku,
    room: it.room,
    size_color: [it.selected_size, it.selected_color].filter(Boolean).join(' · ') || null,
    quantity: it.quantity,
    unit: it.unit,
    unit_price: it.unit_price,
    discounted_price: it.discounted_price,
    line_total: it.line_total,
    pricing_status: it.pricing_status,
    installation_requirements: it.installation_requirements,
    delivery_date: it.delivery_date,
  }));
  const anyPriced = items.some((i) => Number(i.line_total ?? 0) > 0);
  return {
    doc_label: 'QUOTE',
    number: quote.quote_number ?? null,
    subtitle: quote.name ?? null,
    created_at: quote.created_at ?? null,
    expires_at: quote.expires_at ?? null,
    currency: quote.currency || 'EUR',
    layout: 'list',
    company: {
      name: branding.company_name || null,
      address: branding.company_address || null,
      phone: branding.company_phone || null,
      email: branding.company_email || null,
      vat: branding.company_vat || null,
    },
    client: {
      contact_name: quote.client?.contact_name ?? null,
      company_name: quote.client?.company_name ?? null,
      email: quote.client?.email ?? null,
      phone: quote.client?.phone ?? null,
      address: quote.client?.address ?? null,
      city: quote.client?.city ?? null,
      postal_code: quote.client?.postal_code ?? null,
      country: quote.client?.country ?? null,
      vat_number: quote.client?.vat_number ?? null,
    },
    show_client_page: true,
    notes: quote.notes ?? null,
    sections: [{ items }],
    totals: anyPriced ? {
      subtotal: quote.subtotal,
      vat_rate: quote.vat_rate,
      vat_amount: quote.vat_amount,
      grand_total: quote.grand_total,
      cash_discount_pct: quote.cash_discount_pct ?? 0,
      currency: quote.currency || 'EUR',
    } : null,
    page_width: branding.cover_width ?? null,
    page_height: branding.cover_height ?? null,
  };
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(withApiLogging('generate-quote-pdf', async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Only accept POST
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  // Authenticate
  const auth = await authenticate(req);
  if (!auth.success) {
    return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  }

  let quoteId: string;

  try {
    const body: QuotePDFRequest = await req.json();

    // ── Preview mode: render a sample quote with the current PDF Design Template.
    // No quote row, no DB writes — just the real template output for Quote Settings.
    if (body.preview === true) {
      const workspaceId = body.workspace_id ?? null;
      // If a workspace is named, the caller must belong to it (branding leak guard).
      if (workspaceId && auth.level !== 'secret') {
        const { data: member } = await supabase
          .from('workspace_members').select('user_id')
          .eq('workspace_id', workspaceId).eq('user_id', auth.userId ?? '').maybeSingle();
        if (!member) return jsonResponse({ success: false, error: 'Forbidden' }, 403);
      }
      const branding = await fetchBrandingConfig(supabase, workspaceId);

      let logoPath: string | null = null;
      if (workspaceId) {
        const { data: fs } = await supabase.from('finance_settings')
          .select('business_logo_path').eq('workspace_id', workspaceId).maybeSingle();
        logoPath = fs?.business_logo_path ?? null;
      }
      const [coverBytes, introBytes, bgBytes, backBytes, logoBytes] = await Promise.all([
        fetchTemplateImage(supabase, branding.cover_image_path),
        fetchTemplateImage(supabase, branding.intro_page_path),
        fetchTemplateImage(supabase, branding.content_page_path),
        fetchTemplateImage(supabase, branding.backcover_image_path),
        logoPath ? fetchStorageFile(supabase, 'generation-images', logoPath) : Promise.resolve(null),
      ]);

      const sample = buildSampleQuote(workspaceId, Number(branding.vat_rate_default ?? 24));
      const { pdfBytes } = await renderBrandedDocument(mapQuoteToBrandedDoc(sample, branding), {
        coverBytes, introBytes, contentBgBytes: bgBytes, backCoverBytes: backBytes, logoBytes,
      });

      const storagePath = `quote-output/_preview/${workspaceId ?? 'global'}.pdf`;
      const { error: upErr } = await supabase.storage.from('pdf-documents')
        .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
      if (upErr) throw new Error(`Failed to upload preview: ${upErr.message}`);
      const { data: signedUrl } = await supabase.storage.from('pdf-documents')
        .createSignedUrl(storagePath, 60 * 30);
      return jsonResponse({ success: true, pdf_url: signedUrl?.signedUrl, pdf_storage_path: storagePath });
    }

    quoteId = body.quote_id as string;

    if (!quoteId) {
      return jsonResponse({ success: false, error: 'Missing quote_id' }, 400);
    }

    // Tenant boundary: this handler runs under the service role (RLS bypassed), so we MUST
    // verify the caller belongs to the quote's workspace before reading/generating/mutating
    // it. Without this, any authenticated user could read another tenant's quote PDF (signed
    // URL) or flip its pdf_generation_status by quote_id (cross-tenant IDOR). Internal
    // service-role / admin-secret callers (level 'secret') legitimately operate cross-tenant.
    {
      const { data: ownerRow, error: ownerErr } = await supabase
        .from('quotes')
        .select('workspace_id')
        .eq('id', quoteId)
        .single();
      if (ownerErr || !ownerRow) {
        return jsonResponse({ success: false, error: 'Quote not found' }, 404);
      }
      if (auth.level !== 'secret') {
        const { data: member } = await supabase
          .from('workspace_members')
          .select('user_id')
          .eq('workspace_id', (ownerRow as any).workspace_id)
          .eq('user_id', auth.userId ?? '')
          .maybeSingle();
        if (!member) {
          return jsonResponse({ success: false, error: 'Forbidden' }, 403);
        }
      }
    }

    // Check if PDF already exists and regeneration not requested
    if (!body.regenerate) {
      const { data: existing } = await supabase
        .from('quotes')
        .select('pdf_storage_path, pdf_generation_status')
        .eq('id', quoteId)
        .single();

      if (existing?.pdf_storage_path && existing?.pdf_generation_status === 'completed') {
        // Refresh signed URL and return existing
        const { data: signedUrl } = await supabase.storage
          .from('pdf-documents')
          .createSignedUrl(existing.pdf_storage_path, 60 * 60 * 24 * 7);

        return jsonResponse({
          success: true,
          pdf_url: signedUrl?.signedUrl,
          pdf_storage_path: existing.pdf_storage_path,
        });
      }
    }

    // Mark as generating (this also triggers the quote_number auto-generation)
    await supabase
      .from('quotes')
      .update({
        pdf_generation_status: 'generating',
        updated_at: new Date().toISOString(),
      })
      .eq('id', quoteId);

    // Fetch the quote first so we can resolve THIS workspace's branding + template.
    const quoteData = await fetchQuoteData(supabase, quoteId);
    // Unified branding: workspace business identity + PDF template, one source (#177).
    const branding = await fetchBrandingConfig(supabase, (quoteData as any).workspace_id);

    // Re-fetch quote_number (may have been generated by trigger)
    const { data: updatedQuote } = await supabase
      .from('quotes')
      .select('quote_number')
      .eq('id', quoteId)
      .single();

    if (updatedQuote?.quote_number) {
      quoteData.quote_number = updatedQuote.quote_number;
    }

    // The seller workspace's logo (same source as the invoice PDF) for the cover.
    let logoPath: string | null = null;
    try {
      const { data: fs } = await supabase
        .from('finance_settings').select('business_logo_path')
        .eq('workspace_id', (quoteData as any).workspace_id).maybeSingle();
      logoPath = fs?.business_logo_path ?? null;
    } catch { /* logo optional */ }

    // Fetch template images (+ optional workspace logo) in parallel
    const [coverBytes, introBytes, bgBytes, backBytes, logoBytes] = await Promise.all([
      fetchTemplateImage(supabase, branding.cover_image_path),
      fetchTemplateImage(supabase, branding.intro_page_path),
      fetchTemplateImage(supabase, branding.content_page_path),
      fetchTemplateImage(supabase, branding.backcover_image_path),
      logoPath ? fetchStorageFile(supabase, 'generation-images', logoPath) : Promise.resolve(null),
    ]);

    // Fetch per-item thumbnails (catalog product image or custom_image_url), in
    // parallel. Each is optional — a failure renders a blank cell, never fails.
    const itemImageBytes: Record<string, Uint8Array> = {};
    await Promise.all(
      quoteData.items
        .filter((it) => it.image_url)
        .map(async (it) => {
          const bytes = await fetchImageBytesFromUrl(it.image_url as string);
          if (bytes) itemImageBytes[it.id] = bytes;
        }),
    );

    // Build the PDF via the unified branded-document renderer.
    const { pdfBytes } = await renderBrandedDocument(mapQuoteToBrandedDoc(quoteData, branding), {
      coverBytes, introBytes, contentBgBytes: bgBytes, backCoverBytes: backBytes, logoBytes,
      itemImages: itemImageBytes,
    });

    // Upload to storage
    const storagePath = `quote-output/${quoteId}/quote-${quoteData.quote_number || quoteId}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('pdf-documents')
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload PDF: ${uploadError.message}`);
    }

    // Generate signed URL (7-day expiry)
    const { data: signedUrl } = await supabase.storage
      .from('pdf-documents')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

    // Update quote record
    await supabase
      .from('quotes')
      .update({
        pdf_storage_path: storagePath,
        pdf_generated_at: new Date().toISOString(),
        pdf_generation_status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', quoteId);

    // Log a download/generation analytics event (best-effort, service role).
    supabase.from('quote_analytics_events').insert({
      event_type: 'downloaded',
      view_context: 'admin',
      quote_id: quoteId,
      user_id: auth.userId ?? null,
      session_id: auth.userId ?? 'server',
      source_page: 'generate-quote-pdf',
      metadata: { method: 'server_generate', quote_number: quoteData.quote_number ?? null },
    }).then(() => {});

    // Notify quote owner that PDF is ready
    const { data: quoteRecord } = await supabase
      .from('quotes')
      .select('user_id')
      .eq('id', quoteId)
      .single();
    if (quoteRecord?.user_id) {
      emitFlowEvent('quote_pdf_generated', {
        user_id: quoteRecord.user_id,
        type: 'pdf_ready',
        title: 'Your quote PDF is ready',
        body: `Quote ${quoteData.quote_number || ''} PDF has been generated and is ready to download.`,
        action_url: `/quotes/${quoteId}`,
        quote_id: quoteId,
      }).catch(() => {});
    }

    const response: QuotePDFResponse = {
      success: true,
      quote_number: quoteData.quote_number || undefined,
      pdf_url: signedUrl?.signedUrl,
      pdf_storage_path: storagePath,
    };

    return jsonResponse(response);
  } catch (error) {
    console.error('PDF generation error:', error);

    // Mark failure
    if (quoteId!) {
      await supabase
        .from('quotes')
        .update({
          pdf_generation_status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', quoteId);
    }

    // Honor HttpError status (e.g. 400 for "quote has no items" / unpriced items) so
    // genuine client errors aren't reported as 500s / Sentry noise.
    const status = (error as any)?.status && Number.isInteger((error as any).status) ? (error as any).status : 500;
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'PDF generation failed',
      },
      status
    );
  }
}));

// A representative sample quote for the PDF Design Template preview. Covers the
// visible surfaces (multiple line items, FF&E fields, discount, VAT, notes) so the
// admin sees a faithful render of the template without a real quote.
function buildSampleQuote(workspaceId: string | null, vatRate: number): QuoteData {
  const items = [
    { name: 'Porcelain Tile — Carrara', sku: 'TIL-CAR-60', size: '60×60 cm', color: 'White', qty: 40, unit: 'm²', price: 28.5, room: 'Bathroom' },
    { name: 'Oak Engineered Flooring', sku: 'FLR-OAK-14', size: '1900×190 mm', color: 'Natural', qty: 55, unit: 'm²', price: 42.0, room: 'Living room' },
    { name: 'Matt Black Mixer Tap', sku: 'TAP-BLK-01', size: null, color: 'Matt black', qty: 3, unit: 'pcs', price: 89.0, room: 'Kitchen' },
  ];
  let subtotal = 0;
  const itemData = items.map((it, i) => {
    const lineTotal = Math.round(it.qty * it.price * 100) / 100;
    subtotal += lineTotal;
    return {
      id: `sample-${i}`, product_name: it.name, description: 'Sample line item for template preview.',
      sku: it.sku, selected_size: it.size, selected_color: it.color, quantity: it.qty, unit: it.unit,
      unit_price: it.price, discounted_price: null, line_total: lineTotal, notes: null, pricing_status: 'priced',
      image_url: null, room: it.room, dimensions: it.size, installation_requirements: null, delivery_date: null,
    };
  });
  subtotal = Math.round(subtotal * 100) / 100;
  const vatAmount = Math.round(subtotal * vatRate) / 100;
  const grandTotal = Math.round((subtotal + vatAmount) * 100) / 100;
  return {
    id: 'preview', user_id: 'preview', workspace_id: workspaceId ?? undefined,
    name: 'Sample Quote — Template Preview', quote_number: 'PREVIEW-0001', status: 'draft', notes: 'This is a preview of your PDF Design Template. Replace the images and details in Quote Settings.',
    subtotal, vat_rate: vatRate, vat_amount: vatAmount, grand_total: grandTotal, cash_discount_pct: 0,
    currency: 'EUR', expires_at: '2030-01-01T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z',
    items: itemData,
    client: {
      contact_name: 'Sample Client', company_name: 'Acme Interiors Ltd', email: 'client@example.com',
      phone: '+30 210 0000000', address: '123 Sample Street', city: 'Athens', postal_code: '10431',
      country: 'Greece', vat_number: 'EL000000000',
    },
  };
}

function jsonResponse(body: QuotePDFResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
