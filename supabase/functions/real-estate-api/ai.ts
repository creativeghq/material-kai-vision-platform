// deno-lint-ignore-file no-explicit-any
// #249 P2 — Real Estate AI: listing-copy generation, credit-metered. Mirrors hr-api/ai-meter:
// reserve a credit ceiling BEFORE the Claude call (invariant #10), settle the difference after,
// and log to ai_usage_logs (module_slug='real-estate') so the op shows on the Operations dashboard.
import { HttpError } from '../_shared/api-logger.ts';
import { MARKUP_MULTIPLIER, CREDITS_PER_USD } from '../_shared/pricing-constants.ts';

const FAMILY_PRICING: Array<{ match: string; input: number; output: number }> = [
  { match: 'claude-opus', input: 15.0, output: 75.0 },
  { match: 'claude-sonnet', input: 3.0, output: 15.0 },
  { match: 'claude-haiku', input: 1.0, output: 5.0 },
];
function priceFor(model: string) {
  const m = model.toLowerCase();
  return FAMILY_PRICING.find((p) => m.includes(p.match)) ?? { input: 3.0, output: 15.0 };
}
const RE_MODEL = () => Deno.env.get('REAL_ESTATE_AI_MODEL') || 'claude-sonnet-4-6';
const DRAFT_CEILING = 5; // conservative credit reservation for one listing-copy generation

/** Reserve a credit ceiling up front (throws 402 if the pool/balance can't cover it). */
export async function reserveCredits(supabase: any, userId: string, workspaceId: string, credits = DRAFT_CEILING): Promise<void> {
  const { data, error } = await supabase.rpc('debit_credits', {
    p_user_id: userId, p_amount: credits, p_operation_type: 'real_estate_ai_reserve',
    p_description: 'Reserve — AI listing copy', p_metadata: { reserve: true }, p_workspace_id: workspaceId ?? null,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || (row && row.success === false)) throw new HttpError(402, row?.error_message || error?.message || 'Not enough credits');
}

async function refund(supabase: any, userId: string, workspaceId: string, credits: number, meta: any): Promise<void> {
  if (!(credits > 0)) return;
  try {
    await supabase.rpc('refund_credits', {
      p_user_id: userId, p_amount: credits, p_operation_type: 'real_estate_ai_refund',
      p_description: 'Refund — AI listing copy', p_metadata: meta, p_workspace_id: workspaceId ?? null,
    });
  } catch (e) { console.warn('[re-ai] refund failed (non-fatal):', e); }
}

const LISTING_COPY_TOOL = {
  name: 'emit_listing_copy',
  description: 'Return polished, factual listing marketing copy. Never invent facts not present in the input.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'A concise, appealing listing title (max ~70 chars).' },
      description_en: { type: 'string', description: 'English description, 2–4 short paragraphs, factual, no fabricated amenities.' },
      description_el: { type: 'string', description: 'Greek translation of the description.' },
    },
    required: ['title', 'description_en', 'description_el'],
  },
};

/**
 * Generate listing copy from the property's structured fields. Reserves credits, calls Claude with a
 * forced tool (schema-locked output), settles the difference, logs usage. Returns the draft + credits.
 * Does NOT persist — the workbench fills the form so the human reviews before Save (fair-housing safety).
 */
export async function draftListingCopy(
  supabase: any, userId: string, workspaceId: string, property: any,
): Promise<{ title: string; description_en: string; description_el: string; credits: number }> {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new HttpError(400, 'AI is not configured (ANTHROPIC_API_KEY missing)');

  // Compact factual brief from the structured row (only real fields; no invention).
  const facts: Record<string, unknown> = {
    type: property.property_type, subtype: property.subtype, transaction: property.transaction_type,
    price: property.price, currency: property.currency,
    location: [property.town, property.region, property.prefecture, property.country_code].filter(Boolean).join(', '),
    bedrooms: property.bedrooms, bathrooms: property.bathrooms, wc: property.wc,
    area_built_m2: property.area_built, area_plot_m2: property.area_plot ?? property.plot_area,
    floor: property.floor, floors_total: property.floors_total, year_built: property.year_built,
    energy_class: property.energy_class, heating: property.heating_type, orientation: property.orientation,
    parking: property.parking_spaces, furnished: property.furnished,
    features: property.features, amenities: property.amenities,
  };
  const prompt = [
    'Write marketing copy for this property listing. Use ONLY the facts provided — do not invent amenities, dimensions, or claims.',
    'Follow fair-housing norms: describe the PROPERTY, never the ideal occupant; no references to protected characteristics.',
    '',
    'FACTS (JSON):',
    JSON.stringify(facts, null, 2),
  ].join('\n');

  const model = RE_MODEL();
  await reserveCredits(supabase, userId, workspaceId);

  let data: any;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: 1200,
        tools: [LISTING_COPY_TOOL], tool_choice: { type: 'tool', name: LISTING_COPY_TOOL.name },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new HttpError(502, `AI request failed (${res.status})`);
    data = await res.json();
  } catch (e) {
    await refund(supabase, userId, workspaceId, DRAFT_CEILING, { reason: 'ai_call_failed' });
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, 'AI request failed');
  }

  const block = (data.content || []).find((b: any) => b.type === 'tool_use');
  if (!block?.input) { await refund(supabase, userId, workspaceId, DRAFT_CEILING, { reason: 'no_output' }); throw new HttpError(502, 'AI returned no result'); }

  const inTok = Number(data?.usage?.input_tokens ?? 0), outTok = Number(data?.usage?.output_tokens ?? 0);
  const p = priceFor(model);
  const rawUsd = (inTok / 1e6) * p.input + (outTok / 1e6) * p.output;
  const billedUsd = rawUsd * MARKUP_MULTIPLIER;
  const credits = Math.max(1, Math.ceil(billedUsd * CREDITS_PER_USD));

  // Log + settle (refund ceiling − actual).
  try {
    await supabase.from('ai_usage_logs').insert({
      user_id: userId, workspace_id: workspaceId, module_slug: 'real-estate',
      operation_type: 'real_estate_listing_copy', model_name: model,
      input_tokens: inTok, output_tokens: outTok,
      raw_cost_usd: rawUsd, markup_multiplier: MARKUP_MULTIPLIER, billed_cost_usd: billedUsd,
      credits_debited: credits, metadata: { property_id: property.id },
    });
  } catch (e) { console.warn('[re-ai] usage log failed (non-fatal):', e); }
  const delta = DRAFT_CEILING - credits;
  if (delta > 0) await refund(supabase, userId, workspaceId, delta, { property_id: property.id, settle: true });

  return { title: block.input.title, description_en: block.input.description_en, description_el: block.input.description_el, credits };
}
