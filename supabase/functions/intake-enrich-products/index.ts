// deno-lint-ignore-file no-explicit-any
// Drains the products intake marked for enrichment (#406 Phase 5).
//
// Approve never crawls: it stamps `metadata.enrichment = {status:'pending'}` and returns, so a slow
// or failed crawl can never hold up a receipt. This is the drain.
//
// Three rules decide its shape:
//  - It enriches from a URL WE ALREADY HOLD — the product's own link, or its brand's site. Hunting
//    the open web for a spec sheet by name is the guessed match the ticket forbids: a wrong
//    specification on the right-looking product is a valid-looking value nothing downstream catches.
//  - Findings are CLAIMS. They land in `attributes_raw` under `web_enrichment` and are canonicalized
//    into `attributes` by the existing nightly pass — never written straight into it, and never into
//    `metadata`, where the supplier's own invoice facts live.
//  - Every outcome is recorded, including "we had nowhere to look". Otherwise the same products are
//    re-crawled nightly forever and "nothing found" is indistinguishable from "never tried".
import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { loadPrompt } from '../_shared/prompt-utils.ts';
import { scrapeToMarkdown, analysePage } from '../_shared/tools/material-scrape-tools.ts';

const OP = 'intake_enrichment';
const MAX_BATCH = 10;
/** Below this the page is not confidently about this product, so nothing is written. */
const MIN_CONFIDENCE = 0.5;

interface Claimed {
  product_id: string;
  product_name: string;
  sku: string | null;
  external_sku: string | null;
  manufacturer: string | null;
  material_category: string | null;
  product_url: string | null;
  brand_website: string | null;
  category_key: string | null;
}

/** The only source we will read: one we already hold. */
const sourceFor = (p: Claimed): string | null => p.product_url ?? p.brand_website ?? null;

function parseReply(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

Deno.serve(withApiLogging('intake-enrich-products', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const workspaceId = String(body?.workspace_id ?? '').trim();
  if (!workspaceId) return json({ error: 'workspace_id is required' }, 400);
  if (!(await userCanAccessWorkspace(supabase, userId, workspaceId))) return json({ error: 'not found' }, 404);

  const limit = Math.min(Math.max(Number(body?.limit ?? MAX_BATCH) || MAX_BATCH, 1), MAX_BATCH);

  // The task prompt is a DB row; the FIELDS come from the registry, not from either.
  const taskPrompt = await loadPrompt(supabase, 'tool', 'intake_enrichment');
  const systemPrompt = 'You read a product page and return only what it states.';

  const { data: claimed, error: claimErr } = await supabase.rpc('claim_products_for_enrichment', {
    p_workspace: workspaceId, p_limit: limit,
  });
  if (claimErr) throw new HttpError(500, claimErr.message);
  const batch = (claimed ?? []) as Claimed[];
  if (batch.length === 0) {
    return json({ ok: true, claimed: 0, reason: 'Nothing is queued for enrichment.' });
  }

  const results: any[] = [];
  let enriched = 0, noSource = 0, lowConfidence = 0, failed = 0;

  for (const p of batch) {
    const url = sourceFor(p);
    if (!url) {
      noSource++;
      await supabase.rpc('record_product_enrichment', {
        p_product: p.product_id, p_status: 'no_source',
        p_reason: 'No product link and no website on its brand. Searching the web by name would be '
          + 'a guess, and a wrong specification on the right-looking product cannot be caught later.',
        p_findings: null,
      });
      results.push({ product_id: p.product_id, status: 'no_source' });
      continue;
    }

    // Which fields this product's category actually has. `applies_to_categories` holds category
    // KEYS, so a product with no material category asks for nothing in particular.
    let fieldKeys: string[] = [];
    if (p.category_key) {
      const { data: fields } = await supabase
        .from('material_metadata_fields')
        .select('field_name, applies_to_categories')
        .contains('applies_to_categories', [p.category_key])
        .limit(60);
      fieldKeys = (fields ?? []).map((f: any) => f.field_name).filter(Boolean);
    }

    const scraped = await scrapeToMarkdown(url, userId, workspaceId, OP);
    if ('error' in scraped) {
      failed++;
      await supabase.rpc('record_product_enrichment', {
        p_product: p.product_id, p_status: 'failed',
        p_reason: `Could not read ${url}: ${String(scraped.error).slice(0, 300)}`,
        p_findings: null,
      });
      results.push({ product_id: p.product_id, status: 'failed' });
      continue;
    }

    const task = `${taskPrompt}\n\nPRODUCT: ${p.product_name}`
      + (p.manufacturer ? `\nMAKER: ${p.manufacturer}` : '')
      + (p.external_sku ? `\nSUPPLIER ARTICLE CODE: ${p.external_sku}` : '')
      + (p.sku ? `\nOUR CODE: ${p.sku}` : '')
      + `\n\nFIELD KEYS: ${fieldKeys.length ? fieldKeys.join(', ') : '(none declared for this category)'}`;

    const analysed = await analysePage(systemPrompt, task, scraped.markdown, userId, workspaceId, OP);
    if ('error' in analysed) {
      failed++;
      await supabase.rpc('record_product_enrichment', {
        p_product: p.product_id, p_status: 'failed',
        p_reason: `Extraction failed for ${url}: ${String(analysed.error).slice(0, 300)}`,
        p_findings: null,
      });
      results.push({ product_id: p.product_id, status: 'failed' });
      continue;
    }

    const parsed = parseReply(analysed.text);
    const confidence = Number(parsed?.source_confidence ?? 0);
    if (!parsed || confidence < MIN_CONFIDENCE) {
      lowConfidence++;
      await supabase.rpc('record_product_enrichment', {
        p_product: p.product_id, p_status: 'low_confidence',
        p_reason: `The page at ${url} was not confidently about this product (${confidence.toFixed(2)}). `
          + 'Nothing was written: a thin product is a deliberate outcome, a wrong spec is not.',
        p_findings: null,
      });
      results.push({ product_id: p.product_id, status: 'low_confidence', confidence });
      continue;
    }

    // Only the keys the registry declares for this category. A field nobody has classified is not
    // a field, and letting the model name its own would make `attributes_raw` a second registry.
    const values: Record<string, unknown> = {};
    for (const k of fieldKeys) {
      if (parsed[k] !== undefined && parsed[k] !== null && parsed[k] !== '') values[k] = parsed[k];
    }
    const images = Array.isArray(parsed.image_urls)
      ? (parsed.image_urls as unknown[]).filter((u) => typeof u === 'string').slice(0, 10)
      : [];

    await supabase.rpc('record_product_enrichment', {
      p_product: p.product_id,
      p_status: 'done',
      p_reason: Object.keys(values).length
        ? `Read ${Object.keys(values).length} field(s) from ${url}.`
        : `${url} described this product and stated none of its registry fields. That is a finding, `
          + 'not a failure.',
      p_findings: {
        source_url: url,
        source: 'web_enrichment',
        confidence,
        read_at: new Date().toISOString(),
        values,
        // Candidates, not associations: an image becomes searchable through `document_images` and
        // `image_product_associations`, which belong to the catalogue ingestion path. Recording the
        // URL here keeps the finding rather than dropping it on the floor.
        image_candidates: images,
      },
    });
    enriched++;
    results.push({
      product_id: p.product_id, status: 'done',
      fields: Object.keys(values).length, images: images.length, confidence,
    });
  }

  return json({
    ok: true,
    claimed: batch.length,
    enriched,
    no_source: noSource,
    low_confidence: lowConfidence,
    failed,
    results,
    note: 'Findings are claims in attributes_raw under `web_enrichment`. The nightly canonicalization '
        + 'pass is what promotes them into `attributes`, with the same provenance every other source '
        + 'is held to.',
  });
}));
