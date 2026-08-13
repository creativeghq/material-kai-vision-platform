/**
 * Operator console data layer for plans × modules + per-plan quotas.
 * - Module → plan tier is the `modules.price_tier` field (the lowest plan that unlocks it).
 * - Per-plan quotas live in `subscription_plans.features` jsonb.
 * Both are platform-wide config; writes are admin/operator-gated by RLS.
 */
import { supabase } from '@/integrations/supabase/client';

export type PlanTier = 'free' | 'pro' | 'enterprise';
export const PLAN_TIERS: PlanTier[] = ['free', 'pro', 'enterprise'];

export interface AdminModule {
  slug: string;
  name: string;
  category: string | null;
  price_tier: PlanTier | null;
  enabled: boolean;
}

export interface AdminPlan {
  id: string;
  name: string;
  price: number | null;
  features: Record<string, unknown>;
}

/** Module → modules it requires. A prerequisite must sit at a tier ≤ the dependent's tier, and a
 *  free-baseline module must never depend on a paid one. The grid warns on violations. */
export const MODULE_DEPENDENCIES: Record<string, string[]> = {
  'sales-finance': ['crm'],
  // Offered from BOTH the CRM and Real Estate surfaces, but it depends on CRM only —
  // requiring real-estate too would lock the pipeline away from every non-RE tenant.
  deals: ['crm'],
  quotes: ['crm'],
  projects: ['crm'],
  'mention-monitoring-notifications': ['mention-monitoring'],
  'job-research-notifications': ['job-research'],
};

/** Quota keys surfaced in the per-plan editor (label + the jsonb key). -1 = unlimited. */
export const QUOTA_KEYS: { key: string; label: string }[] = [
  { key: 'max_contacts', label: 'CRM contacts' },
  { key: 'max_materials', label: 'Materials' },
];

export const planAdminService = {
  async listModules(): Promise<AdminModule[]> {
    const { data, error } = await supabase
      .from('modules')
      .select('slug, name, category, price_tier, enabled')
      .order('category')
      .order('slug');
    if (error) throw error;
    return (data ?? []) as AdminModule[];
  },

  async setModuleTier(slug: string, tier: PlanTier): Promise<void> {
    const { error } = await supabase.from('modules').update({ price_tier: tier }).eq('slug', slug);
    if (error) throw error;
  },

  async listPlans(): Promise<AdminPlan[]> {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('id, name, price, features')
      .order('price', { nullsFirst: true });
    if (error) throw error;
    return (data ?? []).map((p: any) => ({ ...p, features: p.features ?? {} })) as AdminPlan[];
  },

  async setPlanQuota(planId: string, key: string, value: number): Promise<void> {
    // Read-modify-write the features jsonb (small object, no concurrency concern for admin edits).
    const { data: row, error: readErr } = await supabase
      .from('subscription_plans').select('features').eq('id', planId).single();
    if (readErr) throw readErr;
    const features = { ...((row as any)?.features ?? {}), [key]: value };
    const { error } = await supabase.from('subscription_plans').update({ features }).eq('id', planId);
    if (error) throw error;
  },
};

/** rank for tier ordering (free < pro < enterprise); unknown → high so it never auto-satisfies. */
export function tierRank(tier: string | null | undefined): number {
  return tier === 'free' ? 0 : tier === 'pro' ? 1 : tier === 'enterprise' ? 2 : 999;
}

/** Returns the dependency violations for a proposed tier map: a prerequisite tiered ABOVE its
 *  dependent (so unlocking the dependent wouldn't include the prerequisite). */
export function dependencyViolations(tierBySlug: Map<string, string | null>): { module: string; requires: string }[] {
  const out: { module: string; requires: string }[] = [];
  for (const [mod, deps] of Object.entries(MODULE_DEPENDENCIES)) {
    const modTier = tierBySlug.get(mod);
    if (modTier === undefined) continue;
    for (const dep of deps) {
      const depTier = tierBySlug.get(dep);
      if (depTier === undefined) continue;
      if (tierRank(depTier) > tierRank(modTier)) out.push({ module: mod, requires: dep });
    }
  }
  return out;
}
