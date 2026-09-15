// deno-lint-ignore-file no-explicit-any
// Proposes a target for the terms the ontology cannot resolve (#406 Phase 3).
//
// All 180 bindings had `proposed_by = NULL`: the work list was 180 invoice terms waiting to be
// matched entirely by hand. A proposal is a CANDIDATE and a human still accepts it — nothing here
// confirms, and nothing here mints a company.
import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { MARKUP_MULTIPLIER, CREDITS_PER_USD } from '../_shared/pricing-constants.ts';
import { loadPrompt } from '../_shared/prompt-utils.ts';

const MODEL = () => Deno.env.get('ONTOLOGY_AI_MODEL') || 'claude-sonnet-5';
const PRICE = { input: 3.0, output: 15.0 };
/** A batch, not the whole list: 180 terms in one turn is one answer nobody can review. */
const MAX_TERMS = 25;
const CEILING = 8;

const TOOL = {
  name: 'emit_ontology_proposals',
  description: 'Propose, for each supplied term, the party it refers to.',
  input_schema: {
    type: 'object',
    properties: {
      proposals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            binding_id: { type: 'string' },
            verdict: { type: 'string', enum: ['existing', 'new_manufacturer', 'unknown'] },
            company_id: { type: 'string', description: 'only when verdict is existing' },
            suggested_name: { type: 'string', description: 'only when verdict is new_manufacturer' },
            confidence: { type: 'number' },
            reason: { type: 'string' },
          },
          required: ['binding_id', 'verdict', 'confidence'],
        },
      },
    },
    required: ['proposals'],
  },
};

/** Ingested invoice text is DATA, never instructions (security invariant 9). */
const asData = (s: string) => `<untrusted_invoice_terms>\n${s}\n</untrusted_invoice_terms>`;

async function reserve(supabase: any, userId: string, ws: string, credits: number) {
  const { data, error } = await supabase.rpc('debit_credits', {
    p_user_id: userId, p_amount: credits, p_operation_type: 'ontology_propose_reserve',
    p_description: 'Reserve — ontology target proposals', p_metadata: { reserve: true }, p_workspace_id: ws,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || (row && row.success === false)) {
    throw new HttpError(402, row?.error_message || error?.message || 'Not enough credits');
  }
}
async function refund(supabase: any, userId: string, ws: string, credits: number, meta: any) {
  if (!(credits > 0)) return;
  try {
    await supabase.rpc('refund_credits', {
      p_user_id: userId, p_amount: credits, p_operation_type: 'ontology_propose_refund',
      p_description: 'Refund — ontology target proposals', p_metadata: meta, p_workspace_id: ws,
    });
  } catch (e) { console.warn('[ontology-propose-targets] refund failed:', e); }
}

Deno.serve(withApiLogging('ontology-propose-targets', async (req) => {
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

  const limit = Math.min(Math.max(Number(body?.limit ?? MAX_TERMS) || MAX_TERMS, 1), MAX_TERMS);
  const conceptType = ['manufacturer', 'supplier'].includes(String(body?.concept_type ?? ''))
    ? String(body.concept_type) : 'manufacturer';

  const { data: bindings, error: bErr } = await supabase
    .from('ontology_bindings')
    .select('id, raw_term, concept_type, status, proposed_by')
    .eq('workspace_id', workspaceId)
    .eq('concept_type', conceptType)
    .eq('status', 'unresolved')
    .is('proposed_by', null)
    .limit(limit);
  if (bErr) throw new HttpError(500, bErr.message);
  if (!bindings?.length) {
    return json({ ok: true, proposed: 0, reason: 'Nothing unresolved is waiting for a proposal.' });
  }

  const { data: companies } = await supabase
    .from('crm_companies')
    .select('id, name, is_manufacturer, is_supplier, factory_names')
    .eq('workspace_id', workspaceId)
    .limit(400);

  // The rubric is a DB row: "does this term mean that company" is a judgement an operator should
  // be able to retune without a deploy. Loaded BEFORE the reserve, so a missing prompt never
  // debits for work that cannot happen.
  const rubric = await loadPrompt(supabase, 'tool', 'ontology_propose');
  const prompt = `${rubric}\n\nCANDIDATE COMPANIES (JSON):\n`
    + JSON.stringify((companies ?? []).map((c: any) => ({
      id: c.id, name: c.name, manufacturer: !!c.is_manufacturer,
      supplier: !!c.is_supplier, other_names: c.factory_names ?? [],
    })), null, 2)
    + `\n\nTERMS:\n${asData(JSON.stringify(
      bindings.map((b: any) => ({ binding_id: b.id, term: b.raw_term })), null, 2))}`;

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'AI is not configured' }, 400);

  const model = MODEL();
  await reserve(supabase, userId, workspaceId, CEILING);
  let data: any;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: 2000, tools: [TOOL],
        tool_choice: { type: 'tool', name: TOOL.name },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new HttpError(502, `AI request failed (${res.status})`);
    data = await res.json();
  } catch (e) {
    await refund(supabase, userId, workspaceId, CEILING, { reason: 'ai_failed' });
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: 'AI request failed' }, 502);
  }

  const block = (data.content || []).find((b: any) => b.type === 'tool_use');
  if (!block?.input?.proposals) {
    await refund(supabase, userId, workspaceId, CEILING, { reason: 'no_output' });
    return json({ error: 'AI returned no result' }, 502);
  }

  const known = new Set((bindings ?? []).map((b: any) => b.id));
  const validCompany = new Set((companies ?? []).map((c: any) => c.id));
  let existing = 0, minted = 0, skipped = 0;
  const results: any[] = [];

  for (const p of block.input.proposals as any[]) {
    // The model does not get to name a binding it was not given, or a company that does not
    // exist. A hallucinated id here would bind an invoice term to a random party.
    if (!known.has(p?.binding_id)) { skipped++; continue; }
    const confidence = Number(p?.confidence ?? 0);
    if (p?.verdict === 'existing' && validCompany.has(p?.company_id)) {
      const { error } = await supabase.rpc('ontology_propose_binding', {
        p_binding_id: p.binding_id, p_target_id: p.company_id, p_target_key: null,
        p_confidence: confidence,
        p_evidence: { proposed_by_model: model, reason: String(p?.reason ?? '').slice(0, 500) },
      });
      if (error) { results.push({ binding_id: p.binding_id, error: error.message }); continue; }
      existing++;
      results.push({ binding_id: p.binding_id, verdict: 'existing', confidence });
    } else if (p?.verdict === 'new_manufacturer' && String(p?.suggested_name ?? '').trim()) {
      const { error } = await supabase.rpc('ontology_propose_new_party', {
        p_binding_id: p.binding_id,
        p_suggested_name: String(p.suggested_name).trim().slice(0, 200),
        p_confidence: confidence,
        p_evidence: { proposed_by_model: model, reason: String(p?.reason ?? '').slice(0, 500) },
      });
      if (error) { results.push({ binding_id: p.binding_id, error: error.message }); continue; }
      minted++;
      results.push({ binding_id: p.binding_id, verdict: 'new_manufacturer', confidence });
    } else {
      skipped++;
      results.push({ binding_id: p.binding_id, verdict: 'unknown', confidence });
    }
  }

  const inTok = Number(data?.usage?.input_tokens ?? 0);
  const outTok = Number(data?.usage?.output_tokens ?? 0);
  const billedUsd = ((inTok / 1e6) * PRICE.input + (outTok / 1e6) * PRICE.output) * MARKUP_MULTIPLIER;
  const credits = Math.max(1, Math.ceil(billedUsd * CREDITS_PER_USD));
  try {
    await supabase.from('ai_usage_logs').insert({
      user_id: userId, workspace_id: workspaceId, module_slug: 'stock',
      operation_type: 'ontology_propose', model_name: model,
      // `billed_cost_usd`, not `total_cost` — there is no such column, so PostgREST rejected the
      // whole insert and the catch below swallowed it. Every run of this logged NOTHING while
      // debiting credits, which is the silent-zero shape: the cost view shows a plausible zero.
      input_tokens: inTok, output_tokens: outTok,
      billed_cost_usd: billedUsd, credits_debited: credits,
      // `ops.silent_zero_provider` skips a row with no `success` key, so a run that proposed
      // NOTHING would be invisible to the one probe that would notice the model refusing
      // everything. Derived from the outcome, never hardcoded true.
      metadata: {
        success: existing + minted > 0,
        considered: bindings.length,
        proposed_existing: existing,
        proposed_new_party: minted,
        left_unknown: skipped,
      },
    });
  } catch (e) { console.warn('[ontology-propose-targets] usage log failed:', e); }
  if (credits < CEILING) {
    await refund(supabase, userId, workspaceId, CEILING - credits, { reason: 'settle' });
  }

  return json({
    ok: true,
    considered: bindings.length,
    proposed_existing: existing,
    proposed_new_party: minted,
    left_unknown: skipped,
    results,
    note: 'Every one of these is a CANDIDATE. A human confirms, and confirming is what changes what '
        + 'products get classified as and therefore what they cost.',
  });
}));
