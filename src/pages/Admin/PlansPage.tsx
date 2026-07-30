/**
 * #214 — operator console for plans × modules + per-plan quotas.
 *  • Grid: each module's plan tier (the lowest plan that unlocks it) — writes modules.price_tier.
 *  • Quota editor: per-plan limits (max_contacts, …) — writes subscription_plans.features. -1 = ∞.
 * Dependency-aware: warns when a prerequisite is tiered above its dependent.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Home, Layers, AlertTriangle, Loader2, Infinity as InfinityIcon } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/core/ui/radio-group';
import { PageHeader } from '@/components/shared/PageHeader';
import { useToast } from '@/hooks/use-toast';
import {
  planAdminService, PLAN_TIERS, QUOTA_KEYS, dependencyViolations, MODULE_DEPENDENCIES,
  type AdminModule, type AdminPlan, type PlanTier,
} from '@/services/planAdminService';

const PlansPage: React.FC = () => {
  const { toast } = useToast();
  const [modules, setModules] = useState<AdminModule[]>([]);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const [m, p] = await Promise.all([planAdminService.listModules(), planAdminService.listPlans()]);
      setModules(m);
      setPlans(p);
    } catch (err: any) {
      toast({ title: 'Failed to load', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const tierBySlug = useMemo(() => new Map(modules.map((m) => [m.slug, m.price_tier])), [modules]);
  const violations = useMemo(() => dependencyViolations(tierBySlug), [tierBySlug]);

  const setTier = async (slug: string, tier: PlanTier) => {
    setBusy(`mod:${slug}`);
    // optimistic
    setModules((ms) => ms.map((m) => m.slug === slug ? { ...m, price_tier: tier } : m));
    try { await planAdminService.setModuleTier(slug, tier); }
    catch (err: any) { toast({ title: 'Update failed', description: err?.message, variant: 'destructive' }); await load(); }
    finally { setBusy(null); }
  };

  const setQuota = async (plan: AdminPlan, key: string, raw: string) => {
    const value = raw.trim() === '' || raw.trim().toLowerCase() === '∞' ? -1 : parseInt(raw, 10);
    if (Number.isNaN(value)) return;
    setBusy(`quota:${plan.id}:${key}`);
    setPlans((ps) => ps.map((p) => p.id === plan.id ? { ...p, features: { ...p.features, [key]: value } } : p));
    try { await planAdminService.setPlanQuota(plan.id, key, value); }
    catch (err: any) { toast({ title: 'Quota update failed', description: err?.message, variant: 'destructive' }); await load(); }
    finally { setBusy(null); }
  };

  return (
    <div>
      <PageHeader
        icon={Layers}
        title="Plans &amp; Pricing"
        subtitle="Assign each module to the lowest plan that unlocks it, and set per-plan usage limits. Changes take effect immediately."
        actions={
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link to="/admin"><Home className="h-4 w-4" /> Back to Admin</Link>
          </Button>
        }
      />

      <div className="space-y-6 p-3 sm:p-6">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {violations.length > 0 && (
              <Card className="border-amber-500/40 bg-amber-500/5">
                <CardHeader className="flex-row items-start gap-2 space-y-0">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
                  <div>
                    <CardTitle>Dependency Warnings</CardTitle>
                    <CardDescription>
                      A module can&apos;t work unless its prerequisite is on the same or a lower plan. Fix these:
                      <ul className="mt-1 list-disc pl-5">
                        {violations.map((v, i) => (
                          <li key={i}><b>{v.module}</b> is tiered above <b>{v.requires}</b> (which it needs).</li>
                        ))}
                      </ul>
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            )}

            {/* Plans × modules grid */}
            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3">
                <CardTitle>Module → Plan</CardTitle>
                <CardDescription className="text-xs">The lowest plan that includes each module. A plan also includes everything below it.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <th className="px-4 py-2 text-left">Module</th>
                      {PLAN_TIERS.map((t) => <th key={t} className="px-4 py-2 text-center capitalize">{t}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((m) => {
                      const dep = MODULE_DEPENDENCIES[m.slug];
                      return (
                        // The row IS the radio group (one tier per module), so the group renders
                        // AS the <tr> — a wrapper div between tbody and td is not valid table markup.
                        <RadioGroup
                          asChild
                          key={m.slug}
                          value={m.price_tier ?? ''}
                          onValueChange={(t) => setTier(m.slug, t as (typeof PLAN_TIERS)[number])}
                        >
                          <tr className="border-b border-border/30">
                            <td className="px-4 py-2">
                              <div className="font-medium">{m.name}</div>
                              <div className="text-[11px] text-muted-foreground">
                                {m.category}{!m.enabled ? ' · disabled' : ''}{dep ? ` · needs ${dep.join(', ')}` : ''}
                              </div>
                            </td>
                            {PLAN_TIERS.map((t) => (
                              <td key={t} className="px-4 py-2">
                                <RadioGroupItem
                                  value={t}
                                  disabled={busy === `mod:${m.slug}`}
                                  aria-label={`${m.name} on ${t}`}
                                  className="mx-auto"
                                />
                              </td>
                            ))}
                          </tr>
                        </RadioGroup>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Per-plan quotas */}
            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3">
                <CardTitle>Per-Plan Limits</CardTitle>
                <CardDescription className="text-xs">Usage caps per plan. Leave blank or enter <code>-1</code> for unlimited (∞).</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <th className="px-4 py-2 text-left">Limit</th>
                      {plans.map((p) => <th key={p.id} className="px-4 py-2 text-center capitalize">{p.name}{p.price != null ? ` · €${p.price}` : ''}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {QUOTA_KEYS.map((q) => (
                      <tr key={q.key} className="border-b border-border/30">
                        <td className="px-4 py-2 font-medium">{q.label}</td>
                        {plans.map((p) => {
                          const v = Number((p.features as any)?.[q.key] ?? -1);
                          const unlimited = v < 0;
                          return (
                            <td key={p.id} className="px-4 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Input
                                  className="h-8 w-20 text-center text-xs"
                                  defaultValue={unlimited ? '' : String(v)}
                                  placeholder="∞"
                                  disabled={busy === `quota:${p.id}:${q.key}`}
                                  onBlur={(e) => { if (e.target.value !== (unlimited ? '' : String(v))) void setQuota(p, q.key, e.target.value); }}
                                />
                                {unlimited && <InfinityIcon className="h-3.5 w-3.5 text-muted-foreground" />}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground">
              Modules are enabled/disabled platform-wide in <Link to="/admin/modules" className="text-primary">Modules</Link>.
              A workspace&apos;s plan = its owner&apos;s active subscription; the operator (root) always has everything.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default PlansPage;
