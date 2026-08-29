// deno-lint-ignore-file no-explicit-any
// HR AI metering. Every HR AI operation (accounting OCR, reconciliation, CV screening,
// job-description generation) runs through here so it is:
//   1. LOGGED to `ai_usage_logs` (module_slug='hr') → surfaces on the Operations dashboard with
//      real model + token counts + raw/billed cost, exactly like every other platform AI op.
//   2. CHARGED usage-based credits (NOT a fixed number): actual provider cost × platform markup,
//      converted to credits at $0.01/credit. A 1-page slip costs less than a 20-page scanned batch;
//      reconciling 3 employees costs less than 60; a December run with extra Δώρο docs costs more —
//      because each is a separate metered call whose token count reflects the real work.
import { HttpError } from '../_shared/api-logger.ts';
import { MARKUP_MULTIPLIER, CREDITS_PER_USD } from '../_shared/pricing-constants.ts';

export interface ClaudeUsage { input_tokens: number; output_tokens: number; }
export interface ClaudeToolResult { input: any; usage: ClaudeUsage; model: string; }

// Per-1M-token provider pricing, matched by model family. Mirrors ai_model_pricing (token_based)
// and _shared/ai-client.ts. Family-matched so an HR_JOB_AI_MODEL pin like `claude-sonnet-5`
// still resolves against the `claude-sonnet` row.
//
// The Opus row said 15.00/75.00, which is Opus-3-era pricing and 3x the real rate. That was the
// SIXTH copy of the same wrong number: base-agent.ts, OperationsDashboard MODEL_PRICING and
// MODEL_CONFIGS, credits.service.ts and ai-pricing-updater were corrected in 0d20b768 and this
// one was not, because it is family-matched rather than keyed on a model id and so did not turn
// up in a search for `claude-opus-4-8`. Every HR job run on an Opus pin was billed at 3x.
const FAMILY_PRICING: Array<{ match: string; input: number; output: number }> = [
  { match: 'claude-opus',   input:  5.0, output: 25.0 },
  { match: 'claude-sonnet', input:  3.0, output: 15.0 },
  { match: 'claude-haiku',  input:  1.0, output:  5.0 },
];
function priceFor(model: string): { input: number; output: number } {
  const m = model.toLowerCase();
  return FAMILY_PRICING.find((p) => m.includes(p.match)) ?? { input: 3.0, output: 15.0 };
}

const HR_MODEL = () => Deno.env.get('HR_JOB_AI_MODEL') || 'claude-sonnet-5';

/**
 * Call Claude with a forced tool and return the structured input + token usage.
 * `contentBlocks` is the raw message content array (supports text + document/image blocks).
 */
export async function callClaudeTool(contentBlocks: any[], tool: any, maxTokens = 1200): Promise<ClaudeToolResult> {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new HttpError(400, 'AI is not configured (ANTHROPIC_API_KEY missing)');
  const model = HR_MODEL();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      tools: [tool], tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: contentBlocks }],
    }),
  });
  if (!res.ok) throw new HttpError(502, `AI request failed (${res.status})`);
  const data = await res.json();
  const block = (data.content || []).find((b: any) => b.type === 'tool_use');
  if (!block?.input) throw new HttpError(502, 'AI returned no structured result');
  return {
    input: block.input,
    usage: { input_tokens: Number(data?.usage?.input_tokens ?? 0), output_tokens: Number(data?.usage?.output_tokens ?? 0) },
    model,
  };
}

/**
 * Reserve (debit up front) a conservative credit ceiling BEFORE the upstream LLM call, per security
 * invariant #10 ("debit + rate-limit BEFORE the upstream call, not after"). An unlocked balance
 * pre-check does NOT reserve, so N concurrent requests could all pass it and each spend real provider
 * money; debiting the ceiling first serialises that. Throws 402 when the balance/pool can't cover the
 * ceiling. `meterHrAi(..., reservedCredits)` later refunds the difference vs the actual usage cost.
 */
export async function reserveHrCredits(supabase: any, userId: string, workspaceId: string, credits: number, operationType: string, description: string): Promise<void> {
  if (!(credits > 0)) return;
  const { data, error } = await supabase.rpc('debit_credits', {
    p_user_id: userId, p_amount: credits, p_operation_type: `${operationType}_reserve`,
    p_description: `Reserve — ${description}`, p_metadata: { reserve: true }, p_workspace_id: workspaceId ?? null,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || (row && row.success === false)) throw new HttpError(402, row?.error_message || error?.message || 'Not enough credits');
}

/** Credit credits back (reservation refund). Best-effort — never throws. */
export async function refundHrCredits(supabase: any, userId: string, workspaceId: string, credits: number, operationType: string, description: string, metadata?: any): Promise<void> {
  if (!(credits > 0)) return;
  try {
    await supabase.rpc('refund_credits', {
      p_user_id: userId, p_amount: credits, p_operation_type: `${operationType}_refund`,
      p_description: `Refund — ${description}`, p_metadata: metadata ?? { refund: true }, p_workspace_id: workspaceId ?? null,
    });
  } catch (e) { console.warn('[hr-ai-meter] credit refund failed (non-fatal):', e); }
}

/**
 * Log the call to `ai_usage_logs` (dashboard/Operations) AND settle usage-based credits, returning
 * the whole number actually charged. When `reservedCredits` is supplied (the debit-first path), the
 * caller has already debited that ceiling via {@link reserveHrCredits}, so this only refunds
 * `reserved − actual` (or debits the small remainder if actual exceeded the ceiling). Without it, it
 * debits the actual usage directly (legacy path). Throws 402 only on the legacy direct-debit path.
 */
export async function meterHrAi(supabase: any, opts: {
  userId: string; workspaceId: string; operationType: string; model: string;
  usage: ClaudeUsage; description: string; metadata?: any; reservedCredits?: number;
}): Promise<number> {
  const p = priceFor(opts.model);
  const inTok = opts.usage.input_tokens, outTok = opts.usage.output_tokens;
  const rawInput = (inTok / 1_000_000) * p.input;
  const rawOutput = (outTok / 1_000_000) * p.output;
  const rawUsd = rawInput + rawOutput;
  const billedUsd = rawUsd * MARKUP_MULTIPLIER;
  const credits = Math.max(1, Math.ceil(billedUsd * CREDITS_PER_USD));

  // 1) Dashboard-facing usage log — fire-and-forget (never block the op on a logging failure).
  try {
    await supabase.from('ai_usage_logs').insert({
      user_id: opts.userId, workspace_id: opts.workspaceId, module_slug: 'hr',
      operation_type: opts.operationType, model_name: opts.model,
      input_tokens: inTok, output_tokens: outTok,
      input_cost_usd: rawInput * MARKUP_MULTIPLIER, output_cost_usd: rawOutput * MARKUP_MULTIPLIER,
      raw_cost_usd: rawUsd, markup_multiplier: MARKUP_MULTIPLIER, billed_cost_usd: billedUsd,
      credits_debited: credits,
      // Written after a completed Claude call — see ai-client.ts for why the key matters.
      metadata: { success: true, ...(opts.metadata ?? {}) },
    });
  } catch (e) { console.warn('[hr-ai-meter] ai_usage_logs insert failed (non-fatal):', e); }

  const meta = { ...(opts.metadata ?? {}), model: opts.model, input_tokens: inTok, output_tokens: outTok, billed_cost_usd: billedUsd };

  if (opts.reservedCredits !== undefined) {
    // Debit-first path: the ceiling was already reserved. Reconcile the difference.
    const delta = opts.reservedCredits - credits;
    if (delta > 0) {
      await refundHrCredits(supabase, opts.userId, opts.workspaceId, delta, opts.operationType, opts.description, meta);
    } else if (delta < 0) {
      // Actual exceeded the ceiling (rare). Charge the small remainder; don't fail the completed op.
      const { data, error } = await supabase.rpc('debit_credits', {
        p_user_id: opts.userId, p_amount: -delta, p_operation_type: opts.operationType,
        p_description: opts.description, p_metadata: meta, p_workspace_id: opts.workspaceId ?? null,
      });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || (row && row.success === false)) console.warn('[hr-ai-meter] over-ceiling remainder debit failed (non-fatal):', row?.error_message || error?.message);
    }
    return credits;
  }

  // Legacy path: debit the actual usage directly.
  const { data, error } = await supabase.rpc('debit_credits', {
    p_user_id: opts.userId, p_amount: credits, p_operation_type: opts.operationType,
    p_description: opts.description, p_metadata: meta, p_workspace_id: opts.workspaceId ?? null,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || (row && row.success === false)) throw new HttpError(402, row?.error_message || error?.message || 'Credit deduction failed');
  return credits;
}

export async function creditBalance(supabase: any, userId: string): Promise<number> {
  const { data } = await supabase.from('user_credits').select('balance').eq('user_id', userId).maybeSingle();
  return Number(data?.balance ?? 0);
}

/** Base64-encode bytes in chunks (avoids call-stack blowups on large files). */
export function base64FromBytes(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  return btoa(bin);
}
