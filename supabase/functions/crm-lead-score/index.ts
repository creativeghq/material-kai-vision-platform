// deno-lint-ignore-file no-explicit-any
// CANONICAL platform lead scorer. Scores ANY crm_contacts lead (not real-estate-only)
// from generic CRM signals, enriched with property signals when the real-estate module is enabled.
// Writes the shared crm_contacts.lead_score / health_score so CRM, Sales, and Real Estate all show
// the SAME score. Credit-metered (reserve → settle). Not module-gated — it's a CRM-wide capability.
import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { MARKUP_MULTIPLIER, CREDITS_PER_USD } from '../_shared/pricing-constants.ts';
import { loadPrompt } from '../_shared/prompt-utils.ts';


const FAMILY_PRICING: Array<{ match: string; input: number; output: number }> = [
  { match: 'claude-opus', input: 15.0, output: 75.0 },
  { match: 'claude-sonnet', input: 3.0, output: 15.0 },
  { match: 'claude-haiku', input: 1.0, output: 5.0 },
];
const priceFor = (m: string) => FAMILY_PRICING.find((p) => m.toLowerCase().includes(p.match)) ?? { input: 3.0, output: 15.0 };
const MODEL = () => Deno.env.get('CRM_AI_MODEL') || 'claude-sonnet-5';
const CEILING = 3;

const TOOL = {
  name: 'emit_lead_score',
  description: 'Score a sales lead 0-100 (likelihood to transact soon) + health 0-100 (engagement/fit).',
  input_schema: {
    type: 'object',
    properties: {
      lead_score: { type: 'integer', description: '0-100 likelihood this lead transacts soon.' },
      health_score: { type: 'integer', description: '0-100 relationship health / fit.' },
      rationale: { type: 'string', description: 'one short sentence.' },
    },
    required: ['lead_score', 'health_score'],
  },
};

async function reserve(supabase: any, userId: string, ws: string, credits: number) {
  const { data, error } = await supabase.rpc('debit_credits', {
    p_user_id: userId, p_amount: credits, p_operation_type: 'crm_lead_score_reserve',
    p_description: 'Reserve — AI lead score', p_metadata: { reserve: true }, p_workspace_id: ws ?? null,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || (row && row.success === false)) throw new HttpError(402, row?.error_message || error?.message || 'Not enough credits');
}
async function refund(supabase: any, userId: string, ws: string, credits: number, meta: any) {
  if (!(credits > 0)) return;
  try { await supabase.rpc('refund_credits', { p_user_id: userId, p_amount: credits, p_operation_type: 'crm_lead_score_refund', p_description: 'Refund — AI lead score', p_metadata: meta, p_workspace_id: ws ?? null }); }
  catch (e) { console.warn('[crm-lead-score] refund failed:', e); }
}

Deno.serve(withApiLogging('crm-lead-score', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId;

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  let body: any; try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const workspaceId = String(body?.workspace_id ?? '').trim();
  const contactId = String(body?.crm_contact_id ?? '').trim();
  if (!workspaceId || !contactId) return json({ error: 'workspace_id and crm_contact_id are required' }, 400);

  if (!(await userCanAccessWorkspace(supabase, userId, workspaceId))) return json({ error: 'not found' }, 404);
  const { data: contact } = await supabase.from('crm_contacts')
    .select('name, lead_status, lead_source, contact_type, is_client, is_supplier, created_at')
    .eq('id', contactId).eq('workspace_id', workspaceId).maybeSingle();
  if (!contact) return json({ error: 'not found' }, 404);

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'AI is not configured' }, 400);

  // ── Generic CRM signals (every lead) ──
  const [{ count: activityCount }, { data: lastAct }] = await Promise.all([
    supabase.from('crm_activities').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('target_kind', 'contact').eq('target_id', contactId),
    supabase.from('crm_activities').select('created_at').eq('workspace_id', workspaceId).eq('target_kind', 'contact').eq('target_id', contactId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const signals: Record<string, unknown> = {
    lead_status: contact.lead_status, lead_source: contact.lead_source, contact_type: contact.contact_type,
    is_client: contact.is_client, is_supplier: contact.is_supplier,
    days_known: contact.created_at ? Math.round((Date.now() - new Date(contact.created_at).getTime()) / 864e5) : null,
    activity_count: activityCount ?? 0,
    days_since_last_activity: lastAct?.created_at ? Math.round((Date.now() - new Date(lastAct.created_at).getTime()) / 864e5) : null,
  };

  // ── Real-estate enrichment (only when the module is enabled) ──
  try {
    const { data: reMod } = await supabase.from('modules').select('enabled').eq('slug', 'real-estate').maybeSingle();
    if (reMod?.enabled) {
      // DESTRUCTURE `.data`, all four. `interests` and `viewings` were bound to the whole
      // PostgrestResponse — an object that is never null, so the `?? []` below never fired and
      // `.map` / `.filter` / `.length` read off `{data, error, count, status, statusText}`.
      // `.map` is undefined there, so the line threw `interests.map is not a function` straight
      // into the `catch` below, which warns and moves on.
      //
      // The consequence is the whole reason this block exists: every property lead has been
      // scored with NO inquiries, interests, viewings, offer flag, budget or pre-approval —
      // silently, with the feature reading as working. `inq` kept working by accident, because
      // `count` genuinely does live on the response rather than on `data`.
      const [{ count: inquiryCount }, { data: interests }, { data: viewings }, { data: ext }] = await Promise.all([
        supabase.from('property_inquiries').select('id', { count: 'exact', head: true }).eq('crm_contact_id', contactId).eq('workspace_id', workspaceId),
        supabase.from('property_interests').select('interest_type').eq('crm_contact_id', contactId).eq('workspace_id', workspaceId),
        supabase.from('property_viewings').select('status').eq('crm_contact_id', contactId).eq('workspace_id', workspaceId),
        supabase.from('property_contacts_ext').select('budget_min, budget_max, pre_approval_status, pre_approval_amount').eq('crm_contact_id', contactId).maybeSingle(),
      ]);
      signals.property = {
        inquiries: inquiryCount ?? 0,
        interests: (interests ?? []).map((i: any) => i.interest_type),
        made_offer: (interests ?? []).some((i: any) => i.interest_type === 'offer_made'),
        viewings: (viewings ?? []).length, completed_viewings: (viewings ?? []).filter((v: any) => v.status === 'completed').length,
        budget_min: ext?.budget_min ?? null, budget_max: ext?.budget_max ?? null,
        pre_approval_status: ext?.pre_approval_status ?? null, pre_approval_amount: ext?.pre_approval_amount ?? null,
      };
    }
  } catch (e) { console.warn('[crm-lead-score] property enrichment skipped:', e); }

  // The rubric is a DB row (`prompt_type='tool'`, `category='crm_lead_score'`) — "what makes a
  // lead hot" is a sales policy an operator should be able to retune without a deploy. The
  // SIGNALS block stays in code because it carries DATA, not behaviour.
  //
  // Loaded BEFORE reserve() on purpose: a missing prompt must not debit the caller's credits
  // for work that cannot happen (invariant 10).
  const rubric = await loadPrompt(supabase, 'tool', 'crm_lead_score');
  const prompt = `${rubric}\n\nSIGNALS (JSON):\n${JSON.stringify(signals, null, 2)}`;

  const model = MODEL();
  await reserve(supabase, userId, workspaceId, CEILING);
  let data: any;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 300, tools: [TOOL], tool_choice: { type: 'tool', name: TOOL.name }, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new HttpError(502, `AI request failed (${res.status})`);
    data = await res.json();
  } catch (e) {
    await refund(supabase, userId, workspaceId, CEILING, { reason: 'ai_failed' });
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: 'AI request failed' }, 502);
  }
  const block = (data.content || []).find((b: any) => b.type === 'tool_use');
  if (!block?.input) { await refund(supabase, userId, workspaceId, CEILING, { reason: 'no_output' }); return json({ error: 'AI returned no result' }, 502); }

  const inTok = Number(data?.usage?.input_tokens ?? 0), outTok = Number(data?.usage?.output_tokens ?? 0);
  const p = priceFor(model);
  const rawUsd = (inTok / 1e6) * p.input + (outTok / 1e6) * p.output;
  const billedUsd = rawUsd * MARKUP_MULTIPLIER;
  const credits = Math.max(1, Math.ceil(billedUsd * CREDITS_PER_USD));
  try {
    await supabase.from('ai_usage_logs').insert({
      user_id: userId, workspace_id: workspaceId, module_slug: 'crm', operation_type: 'crm_lead_score', model_name: model,
      input_tokens: inTok, output_tokens: outTok, raw_cost_usd: rawUsd, markup_multiplier: MARKUP_MULTIPLIER,
      billed_cost_usd: billedUsd, credits_debited: credits,
      // `success` is what ops.silent_zero_provider reads; this row is post-call.
      metadata: { success: true, crm_contact_id: contactId },
    });
  } catch (e) { console.warn('[crm-lead-score] usage log failed:', e); }
  if (CEILING - credits > 0) await refund(supabase, userId, workspaceId, CEILING - credits, { settle: true });

  const clamp = (n: any) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  const lead_score = clamp(block.input.lead_score), health_score = clamp(block.input.health_score);
  await supabase.from('crm_contacts').update({ lead_score, health_score }).eq('id', contactId).eq('workspace_id', workspaceId);

  return json({ lead_score, health_score, rationale: block.input.rationale, credits });
}));
