// Single source of truth for module plan-tier ranking, shared by the checkout handler
// (stripe-api/handlers/modules.ts) and the webhook add-on reconciliation (stripe-webhooks). A drift
// between two hand-maintained copies is a billing bug (free-grant vs paid-add-on decisions), so keep
// this the ONLY definition. `price_tier` on a module is the plan tier that includes it for free.
export const MODULE_TIER_RANK: Record<string, number> = { free: 0, pro: 1, enterprise: 2 };

export function moduleTierRank(tier?: string | null): number {
  return MODULE_TIER_RANK[(tier || '').toLowerCase()] ?? 999;
}
