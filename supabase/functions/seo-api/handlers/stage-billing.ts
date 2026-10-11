/**
 * Reserve → settle for every paid SEO stage (invariant 10): a ceiling is debited before the
 * provider call, then settled to what the call actually cost, priced through ai_model_pricing
 * (tokens × model price, or provider-reported USD) × markup. A cost that cannot be priced keeps
 * the ceiling — an unpriced call is a gap in the price table, never a free one.
 */

import type { DbClient } from '../../_shared/supabase-client.ts';
import { settleCredits } from '../../_shared/credit-reserve.ts';
import { creditsForTokens } from '../../_shared/ai-logger.ts';
import { getServicePricing } from '../../_shared/credit-utils.ts';
import { CREDITS_PER_USD, MARKUP_MULTIPLIER } from '../../_shared/pricing-constants.ts';

export interface StageWallet {
  userId: string;
  workspaceId: string | null;
  /** Credit-ledger operation type, e.g. `seo_write`; refunds/overages append `_refund`/`_overage`. */
  opType: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function reserveStage(
  supabase: DbClient,
  wallet: StageWallet,
  credits: number,
  description: string,
  metadata: Record<string, unknown> = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('debit_credits', {
    p_user_id: wallet.userId,
    p_amount: credits,
    p_operation_type: wallet.opType,
    p_description: description,
    p_metadata: { ...metadata, reserve: true, ceiling_credits: credits },
    p_workspace_id: wallet.workspaceId,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.success) {
    return { ok: false, error: row?.error_message || error?.message || 'Insufficient credits' };
  }
  return { ok: true };
}

/** Hand back a whole reservation — the stage failed, so nothing was sold. */
export async function refundStage(
  supabase: DbClient,
  wallet: StageWallet,
  credits: number,
  reason: string,
): Promise<void> {
  if (!(credits > 0)) return;
  const { error } = await supabase.rpc('refund_credits', {
    p_user_id: wallet.userId,
    p_amount: credits,
    p_operation_type: `${wallet.opType}_refund`,
    p_description: `Refund — ${wallet.opType}`,
    p_metadata: { reason: reason.slice(0, 300) },
    p_workspace_id: wallet.workspaceId,
  });
  if (error) console.error(`[stage-billing] refund failed for ${wallet.opType}:`, error.message);
}

/** Settle a reservation to `actual` (null = unpriced → the ceiling stands). Returns credits charged. */
export async function settleStage(
  supabase: DbClient,
  wallet: StageWallet,
  reserved: number,
  actual: number | null,
  meta: Record<string, unknown> = {},
): Promise<number> {
  const charged = actual === null ? reserved : round2(actual);
  await settleCredits(supabase, wallet.userId, wallet.workspaceId ?? undefined, reserved, charged, wallet.opType, {
    ...meta,
    unpriced: actual === null,
  });
  return charged;
}

/** Credits for one model call, or null when the model has no price row. */
export async function tokenCredits(
  supabase: DbClient,
  model: string,
  usage: { inputTokens?: number; outputTokens?: number },
): Promise<number | null> {
  const priced = await creditsForTokens(supabase, model, usage.inputTokens ?? 0, usage.outputTokens ?? 0);
  return priced ? priced.credits : null;
}

/** Credits for `units` of a per-unit external service, or null when it has no price row. */
export async function serviceCredits(supabase: DbClient, service: string, units: number): Promise<number | null> {
  if (!(units > 0)) return 0;
  const pricing = await getServicePricing(supabase, service).catch(() => null);
  if (!pricing) return null;
  return round2(pricing.cost_per_unit * units * (pricing.markup_multiplier || MARKUP_MULTIPLIER) * CREDITS_PER_USD);
}

/** Ceiling for a model call from its worst case (max output + expected input), priced like the settle. */
export async function tokenCeiling(
  supabase: DbClient,
  model: string,
  maxInputTokens: number,
  maxOutputTokens: number,
  fallback: number,
): Promise<number> {
  const c = await tokenCredits(supabase, model, { inputTokens: maxInputTokens, outputTokens: maxOutputTokens });
  return c === null ? fallback : Math.ceil(c);
}
