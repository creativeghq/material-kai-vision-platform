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
import { authenticate, userHasWorkspaceCapability } from '../_shared/auth.ts';
import { loadPrompt } from '../_shared/prompt-utils.ts';
import { scrapeToMarkdown } from '../_shared/tools/material-scrape-tools.ts';
import { generateStructuredWithClaude, z } from '../_shared/ai-client.ts';
import { wrapUntrusted } from '../_shared/untrusted.ts';
import { reserveCredits, refundCredits, settleCredits } from '../_shared/credit-reserve.ts';
import { resolveTokenPrice } from '../_shared/ai-logger.ts';

const OP = 'intake_enrichment';
const MAX_BATCH = 10;
const MIN_PAGE_CHARS = 200;
/** Below this the page is not confidently about this product, so nothing is written. */
const MIN_CONFIDENCE = 0.5;
const EXTRACTION_MODEL = 'claude-opus-5';
const EXTRACTION_CEILING = 20;
const MAX_PAGE_CHARS = 60_000;

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

/** The reply shape is enforced by the server: field keys are the registry's, never the model's. */
export function extractionSchema(fieldKeys: string[]) {
  const base = {
    source_confidence: z.number(),
    image_urls: z.array(z.string()),
  };
  if (fieldKeys.length === 0) return z.object(base);
  return z.object({
    ...base,
    values: z.array(z.object({
      key: z.enum(fieldKeys as [string, ...string[]]),
      value: z.union([z.string(), z.number(), z.boolean()]),
    })),
  });
}

/** Registry fields for a category: those scoped to it plus the globals (`applies_to_categories` null). */
async function registryFieldKeys(supabase: any, categoryKey: string | null): Promise<string[]> {
  let q = supabase
    .from('material_metadata_fields')
    .select('field_name')
    .eq('status', 'active');
  q = categoryKey
    ? q.or(`applies_to_categories.is.null,applies_to_categories.cs.{${categoryKey}}`)
    : q.is('applies_to_categories', null);
  const { data, error } = await q;
  if (error) throw new Error(`field registry unreadable: ${error.message}`);
  return [...new Set((data ?? []).map((f: any) => f.field_name).filter(Boolean))] as string[];
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
  if (!(await userHasWorkspaceCapability(supabase, userId, workspaceId, 'pricing.manage'))) return json({ error: 'not found' }, 404);

  const limit = Math.min(Math.max(Number(body?.limit ?? MAX_BATCH) || MAX_BATCH, 1), MAX_BATCH);

  // The task prompt is a DB row; the FIELDS come from the registry, not from either.
  const systemPrompt = await loadPrompt(supabase, 'tool', 'intake_enrichment');

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

  /** Every outcome is recorded; a recording that did not persist is a failure, never a count. */
  const record = async (productId: string, status: string, reason: string, findings: unknown): Promise<string | null> => {
    const { error } = await supabase.rpc('record_product_enrichment', {
      p_product: productId, p_status: status, p_reason: reason, p_findings: findings,
    });
    return error ? error.message : null;
  };
  const fail = async (p: Claimed, reason: string) => {
    failed++;
    const recErr = await record(p.product_id, 'failed', reason, null);
    results.push({ product_id: p.product_id, status: 'failed', reason, ...(recErr ? { record_error: recErr } : {}) });
  };

  for (const [idx, p] of batch.entries()) {
    const url = sourceFor(p);
    if (!url) {
      const recErr = await record(p.product_id, 'no_source',
        'No product link and no website on its brand. Searching the web by name would be '
          + 'a guess, and a wrong specification on the right-looking product cannot be caught later.',
        null);
      if (recErr) { failed++; results.push({ product_id: p.product_id, status: 'failed', record_error: recErr }); continue; }
      noSource++;
      results.push({ product_id: p.product_id, status: 'no_source' });
      continue;
    }

    let fieldKeys: string[];
    try {
      fieldKeys = await registryFieldKeys(supabase, p.category_key);
    } catch (e) {
      await fail(p, e instanceof Error ? e.message : String(e));
      continue;
    }

    const scraped = await scrapeToMarkdown(url, userId, workspaceId, OP);
    if ('error' in scraped) {
      await fail(p, `Could not read ${url}: ${String(scraped.error).slice(0, 300)}`);
      continue;
    }
    if (scraped.markdown.trim().length < MIN_PAGE_CHARS) {
      await fail(p, `Could not read ${url}: the page came back empty. That is a failed read, not a product with no facts.`);
      continue;
    }

    const identity = JSON.stringify({
      product: p.product_name,
      maker: p.manufacturer,
      supplier_article_code: p.external_sku,
      our_code: p.sku,
      field_keys: fieldKeys,
    });
    const userMessage = `${wrapUntrusted('product record', identity)}\n\n${wrapUntrusted('product page', scraped.markdown, MAX_PAGE_CHARS)}`;

    const reserve = await reserveCredits(supabase, userId, workspaceId, EXTRACTION_CEILING, OP);
    if (!reserve.ok) {
      const reason = reserve.message || 'Insufficient credits for the extraction pass.';
      for (const rest of batch.slice(idx)) await fail(rest, reason);
      break;
    }

    let reply: { source_confidence: number; image_urls: string[]; values?: Array<{ key: string; value: unknown }> };
    try {
      const res = await generateStructuredWithClaude(userMessage, extractionSchema(fieldKeys), {
        model: EXTRACTION_MODEL,
        systemPrompt,
        temperature: 0,
        task: OP,
        userId,
        workspaceId,
      });
      if (!res.output) throw new Error('model returned no structured reply');
      reply = res.output as typeof reply;
      const price = await resolveTokenPrice(supabase, EXTRACTION_MODEL);
      const actual = price
        ? Math.round(((res.usage.inputTokens / 1e6) * price.input + (res.usage.outputTokens / 1e6) * price.output) * price.markup * 100 * 100) / 100
        : 0;
      await settleCredits(supabase, userId, workspaceId, EXTRACTION_CEILING, actual, OP, { product_id: p.product_id });
    } catch (e) {
      // A refusal or an off-schema reply is a FAILED extraction, never a parse target.
      await refundCredits(supabase, userId, workspaceId, EXTRACTION_CEILING, OP, { reason: 'extraction_failed' });
      await fail(p, `Extraction failed for ${url}: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}`);
      continue;
    }

    const confidence = Number(reply.source_confidence ?? 0);
    if (!(confidence >= MIN_CONFIDENCE)) {
      const recErr = await record(p.product_id, 'low_confidence',
        `The page at ${url} was not confidently about this product (${confidence.toFixed(2)}). `
          + 'Nothing was written: a thin product is a deliberate outcome, a wrong spec is not.',
        null);
      if (recErr) { failed++; results.push({ product_id: p.product_id, status: 'failed', record_error: recErr }); continue; }
      lowConfidence++;
      results.push({ product_id: p.product_id, status: 'low_confidence', confidence });
      continue;
    }

    const allowed = new Set(fieldKeys);
    const values: Record<string, unknown> = {};
    for (const { key, value } of reply.values ?? []) {
      if (allowed.has(key) && value !== null && value !== '') values[key] = value;
    }
    const images = (reply.image_urls ?? []).filter((u) => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 10);

    const recErr = await record(p.product_id, 'done',
      Object.keys(values).length
        ? `Read ${Object.keys(values).length} field(s) from ${url}.`
        : `${url} described this product and stated none of its registry fields. That is a finding, `
          + 'not a failure.',
      {
        source_url: url,
        source: 'web_enrichment',
        confidence,
        read_at: new Date().toISOString(),
        values,
        // Candidates, not associations: images become searchable only through the ingestion path.
        image_candidates: images,
      });
    if (recErr) {
      failed++;
      results.push({ product_id: p.product_id, status: 'failed', record_error: recErr });
      continue;
    }
    enriched++;
    results.push({
      product_id: p.product_id, status: 'done',
      fields: Object.keys(values).length, images: images.length, confidence,
    });
  }

  return json({
    ok: failed === 0,
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
