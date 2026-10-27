// deno-lint-ignore-file no-explicit-any
/** enrich-draft-products — the operator's door to draft-product enrichment. */
import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate, userHasWorkspaceCapability } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { loadPrompt } from '../_shared/prompt-utils.ts';
import { scrapeToMarkdown } from '../_shared/tools/material-scrape-tools.ts';
import { generateStructuredWithClaude, z } from '../_shared/ai-client.ts';
import { wrapUntrusted } from '../_shared/untrusted.ts';
import { reserveCredits, refundCredits, settleCredits } from '../_shared/credit-reserve.ts';
import { resolveTokenPrice } from '../_shared/ai-logger.ts';
import { acceptClaims, type RegistryField } from '../_shared/draft-enrichment.ts';

const OP = 'draft_enrichment';
const MIVAA_GATEWAY_URL = () => Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
const CRON_SECRET = () => Deno.env.get('CRON_SECRET') || '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 5000;
/** Each product is a crawl plus an Opus turn; three keep one call under the edge ceiling. */
const MAX_RUN = 3;
const MIN_CONFIDENCE = 0.5;
const MIN_PAGE_CHARS = 200;
const MAX_PAGE_CHARS = 60_000;
const EXTRACTION_MODEL = 'claude-opus-5';
const EXTRACTION_CEILING = 20;
const CRAWL_CREDITS = 1;
const ACTIVE_JOB = ['pending', 'processing', 'retrying'];

function extractionSchema(fieldKeys: string[]) {
  return z.object({
    product_match: z.enum(['exact', 'family_or_other', 'unclear']),
    match_evidence: z.string(),
    source_confidence: z.number(),
    values: z.array(z.object({
      key: z.enum(fieldKeys as [string, ...string[]]),
      value: z.string(),
      evidence: z.string(),
    })),
  });
}

async function callMivaa(path: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${MIVAA_GATEWAY_URL()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`MIVAA ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const describeField = (f: any) => ({
  key: f.field_name,
  type: f.field_type,
  description: f.description ?? '',
  ...(f.dropdown_options?.length ? { allowed_options: f.dropdown_options } : {}),
  ...(f.validation_rules?.unit ? { unit: f.validation_rules.unit } : {}),
});

Deno.serve(withApiLogging('enrich-draft-products', async (req) => {
  await bootstrapForFunction();
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
  if (!UUID.test(workspaceId)) return json({ error: 'workspace_id is required' }, 400);

  // Same capabilities publish_products asks for: whoever may publish a catalogue may enrich it.
  if (!(await userHasWorkspaceCapability(supabase, userId, workspaceId, ['catalog.import', 'pricing.manage']))) {
    return json({ error: 'not found' }, 404);
  }
  if (!CRON_SECRET()) return json({ error: 'CRON_SECRET not configured on edge function' }, 500);

  const action = String(body?.action ?? 'report');
  if (!['report', 'run', 'status'].includes(action)) return json({ error: `unknown action '${action}'` }, 400);

  if (action === 'status') {
    const ids: string[] = Array.isArray(body?.product_ids) ? body.product_ids.map(String) : [];
    if (ids.length === 0 || ids.length > MAX_IDS || !ids.every((id) => UUID.test(id))) {
      return json({ error: `product_ids must be 1 to ${MAX_IDS} uuids` }, 400);
    }
    const latest: Record<string, any> = {};
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await supabase
        .from('product_enrichment_attempts')
        .select('product_id, status, reason, promoted_fields, canonicalization_state, embedding_state, created_at')
        .eq('workspace_id', workspaceId).in('product_id', ids.slice(i, i + 100))
        .order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);
      for (const row of data ?? []) if (!latest[row.product_id]) latest[row.product_id] = row;
    }
    return json({ attempts: Object.values(latest) });
  }

  const documentId = body?.document_id ? String(body.document_id) : null;
  const productIds: string[] | null = Array.isArray(body?.product_ids) ? body.product_ids.map(String) : null;
  if (Boolean(documentId) === Boolean(productIds)) {
    return json({ error: 'send exactly one of document_id or product_ids' }, 400);
  }
  if (documentId) {
    if (!UUID.test(documentId)) return json({ error: 'document_id is invalid' }, 400);
    const { data: doc } = await supabase.from('documents').select('workspace_id').eq('id', documentId).maybeSingle();
    if (!doc || doc.workspace_id !== workspaceId) return json({ error: 'not found' }, 404);
  }
  const cap = action === 'run' ? MAX_RUN : MAX_IDS;
  if (productIds && (productIds.length === 0 || productIds.length > cap || !productIds.every((id) => UUID.test(id)))) {
    return json({ error: `product_ids must be 1 to ${cap} uuids` }, 400);
  }
  if (action === 'run' && !productIds) return json({ error: 'run takes product_ids' }, 400);

  let gapReport: { summary: Record<string, number>; products: any[] };
  try {
    gapReport = await callMivaa('/api/internal/product-enrichment/gaps', {
      workspace_id: workspaceId, document_id: documentId, product_ids: productIds,
    });
  } catch (e) {
    return json({ error: `gap report failed: ${(e as Error).message}` }, 502);
  }

  if (action === 'report') {
    const open = new Map<string, string>();
    const ids = gapReport.products.map((p: any) => p.product_id as string);
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await supabase.from('product_enrichment_attempts').select('product_id, status')
        .eq('workspace_id', workspaceId).in('status', ['extracted', 'promoted']).in('product_id', ids.slice(i, i + 100));
      if (error) return json({ error: error.message }, 500);
      for (const a of data ?? []) open.set(a.product_id, a.status);
    }
    const products = gapReport.products.map((p: any) => ({ ...p, open_attempt: open.get(p.product_id) ?? null }));
    const toRead = gapReport.summary.gaps_with_source ?? 0;
    return json({
      ...gapReport, products,
      estimate: { products_to_read: toRead, credits_ceiling: toRead * (EXTRACTION_CEILING + CRAWL_CREDITS) },
    });
  }

  const rows = new Map<string, any>(gapReport.products.map((r) => [r.product_id, r]));
  const { data: prodRows, error: prodErr } = await supabase
    .from('products').select('id, name, sku, external_sku, source_document_id')
    .eq('workspace_id', workspaceId).eq('status', 'draft').in('id', productIds!);
  if (prodErr) return json({ error: prodErr.message }, 500);
  const prods = new Map<string, any>((prodRows ?? []).map((p: any) => [p.id, p]));

  const docIds = [...new Set((prodRows ?? []).map((p: any) => p.source_document_id).filter(Boolean))];
  if (docIds.length > 0) {
    const { data: busy } = await supabase.from('background_jobs').select('id').in('document_id', docIds).in('status', ACTIVE_JOB).limit(1);
    if (busy?.length) {
      return json({ error: 'This catalogue is still being ingested. Enrich it once the import job has finished.' }, 409);
    }
  }

  const systemPrompt = await loadPrompt(supabase, 'tool', 'draft_enrichment');
  const results: any[] = [];
  const finish = async (attemptId: string, patch: Record<string, unknown>) =>
    (await supabase.from('product_enrichment_attempts')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', attemptId)).error;

  for (const id of productIds!) {
    const row = rows.get(id);
    const prod = prods.get(id);
    if (!row || !prod) { results.push({ product_id: id, status: 'skipped', reason: 'not a draft of this workspace' }); continue; }
    if (row.verdict === 'unclassified') { results.push({ product_id: id, status: 'skipped', reason: 'the product has no category yet' }); continue; }

    const { data: started, error: startErr } = await supabase.rpc('start_product_enrichment_attempt', {
      p_workspace: workspaceId, p_product: id, p_gaps: row.gaps, p_source_kind: row.source?.kind ?? null,
      p_source_url: row.source?.url ?? null, p_user: userId,
    });
    if (startErr) { results.push({ product_id: id, status: 'failed', reason: startErr.message }); continue; }
    const attempt = Array.isArray(started) ? started[0] : started;
    const attemptId: string = attempt.attempt_id;
    let status: string = attempt.status;

    if (status === 'running') {
      if (!attempt.owned) {
        results.push({ product_id: id, status: 'in_progress', reason: 'Another run is already reading this product.' });
        continue;
      }
      const record = async (patch: Record<string, unknown>, result: Record<string, unknown>) => {
        const err = await finish(attemptId, patch);
        results.push(err ? { product_id: id, status: 'failed', reason: `The outcome could not be recorded (${err.message}). Run it again.` } : result);
      };
      if (row.verdict === 'nothing_missing') {
        await record(
          { status: 'nothing_missing', reason: 'every registry field already has a value', canonicalization_state: 'ok', embedding_state: 'ok' },
          { product_id: id, status: 'nothing_missing' },
        );
        continue;
      }
      if (row.verdict === 'gaps_no_source') {
        await record(
          { status: 'no_source', reason: 'No product link and no website on its brand. Searching by name would be a guess.', canonicalization_state: 'ok', embedding_state: 'ok' },
          { product_id: id, status: 'no_source' },
        );
        continue;
      }

      const fail = async (reason: string) => {
        await finish(attemptId, { status: 'failed', reason: reason.slice(0, 500) });
        results.push({ product_id: id, status: 'failed', reason });
      };

      const { data: fieldRows, error: fieldErr } = await supabase
        .from('material_metadata_fields')
        .select('field_name, field_type, description, dropdown_options, validation_rules')
        .eq('status', 'active').in('field_name', row.gaps);
      if (fieldErr || !fieldRows?.length) { await fail(`field registry unreadable: ${fieldErr?.message ?? 'no rows'}`); continue; }
      const fields: RegistryField[] = fieldRows.map((f: any) => ({
        name: f.field_name, field_type: f.field_type, dropdown_options: f.dropdown_options, validation_rules: f.validation_rules,
      }));

      const scraped = await scrapeToMarkdown(row.source.url, userId, workspaceId, OP);
      if ('error' in scraped) { await fail(`Could not read ${row.source.url}: ${String(scraped.error).slice(0, 300)}`); continue; }
      const page = scraped.markdown.slice(0, MAX_PAGE_CHARS);
      if (page.trim().length < MIN_PAGE_CHARS) { await fail(`Could not read ${row.source.url}: the page came back empty.`); continue; }

      const identity = { name: prod.name as string, sku: prod.sku ?? null, external_sku: prod.external_sku ?? null };
      const userMessage = `${wrapUntrusted('product record', JSON.stringify({ ...identity, fields: fieldRows.map(describeField) }))}\n\n${wrapUntrusted('product page', page)}`;

      const reserve = await reserveCredits(supabase, userId, workspaceId, EXTRACTION_CEILING, OP);
      if (!reserve.ok) {
        await finish(attemptId, { status: 'failed', reason: reserve.message || 'Insufficient credits for the extraction pass.' });
        results.push({ product_id: id, status: 'failed', reason: reserve.message });
        break;
      }

      let res: any;
      try {
        res = await generateStructuredWithClaude(userMessage, extractionSchema(fields.map((f) => f.name)), {
          model: EXTRACTION_MODEL, systemPrompt, temperature: 0, task: OP, userId, workspaceId,
        });
        if (!res.output) throw new Error('model returned no structured reply');
      } catch (e) {
        await refundCredits(supabase, userId, workspaceId, EXTRACTION_CEILING, OP, { reason: 'extraction_failed', attempt_id: attemptId });
        await fail(`Extraction failed for ${row.source.url}: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}`);
        continue;
      }

      // The model has run and been paid for from here on. A missing price keeps the whole ceiling
      // rather than refunding work that happened.
      const price = await resolveTokenPrice(supabase, EXTRACTION_MODEL);
      const actual = price
        ? Math.round(((res.usage.inputTokens / 1e6) * price.input + (res.usage.outputTokens / 1e6) * price.output) * price.markup * 100 * 100) / 100
        : EXTRACTION_CEILING;
      const verdict = acceptClaims(res.output, page, fields, identity);
      const confidence = Number(res.output.source_confidence ?? 0);

      let patch: Record<string, unknown>;
      let outcome: Record<string, unknown>;
      if (verdict.abstained || !(confidence >= MIN_CONFIDENCE)) {
        patch = {
          status: 'low_confidence', confidence,
          reason: `Nothing was written: ${verdict.abstained ?? `confidence ${confidence.toFixed(2)} is below ${MIN_CONFIDENCE}`}.`,
          canonicalization_state: 'ok', embedding_state: 'ok',
        };
        outcome = { product_id: id, status: 'low_confidence', reason: verdict.abstained ?? 'low confidence' };
      } else if (verdict.claims.length === 0) {
        patch = {
          status: 'done', confidence, canonicalization_state: 'ok', embedding_state: 'ok',
          reason: `The page describes this product and states none of the missing fields${verdict.rejected.length ? ` (${verdict.rejected.length} claim(s) failed validation)` : ''}. That is a finding, not a failure.`,
        };
        outcome = { product_id: id, status: 'done', fields: 0, rejected: verdict.rejected };
      } else {
        patch = { status: 'extracted', claims: verdict.claims, confidence };
        outcome = { product_id: id, status: 'extracted', rejected: verdict.rejected };
      }
      const saveErr = await finish(attemptId, patch);
      await settleCredits(supabase, userId, workspaceId, EXTRACTION_CEILING, actual, OP, { product_id: id, attempt_id: attemptId });
      if (saveErr) {
        results.push({ product_id: id, status: 'failed', reason: `The page was read but the result could not be saved (${saveErr.message}). Run it again.` });
        continue;
      }
      results.push(outcome);
      if (patch.status === 'extracted') status = 'extracted';
    }

    if (status === 'extracted' || status === 'promoted') {
      try {
        const out = await callMivaa('/api/internal/product-enrichment/promote', { attempt_id: attemptId });
        const at = results.findIndex((r) => r.product_id === id);
        const merged = { product_id: id, status: out.status, fields: (out.promoted_fields ?? []).length, resumed: attempt.resumed, ...out };
        if (at >= 0) results[at] = { ...results[at], ...merged }; else results.push(merged);
      } catch (e) {
        results.push({ product_id: id, status: 'promoted_pending', reason: `Promotion did not finish: ${(e as Error).message}. Run it again; nothing is charged twice.` });
      }
    }
  }

  return json({ ok: results.every((r) => r.status !== 'failed'), results });
}));
