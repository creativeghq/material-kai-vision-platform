/**
 * Project plan estimator (/tools/project-plan) — anonymous lead-gen tool (#242).
 *
 * Pick a starter blueprint, enter a few measurements, and get a structured,
 * priced scope of works (read-only). Turnstile-gated + metered against the shared
 * public-tools daily quota. Backed by the in-repo `public-project-plan` edge fn
 * (pure compute — no paid upstream). CTA: sign up to make it editable + quote it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ClipboardList, Loader2, Shield, Sparkles, Calculator } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { TurnstileWidget, type TurnstileHandle } from '@/components/features/turnstile/TurnstileWidget';
import { fetchQuota } from '@/services/publicToolsService';
import { edgeError } from '@/utils/edgeError';
import { ToolsShell, QuotaBadge, UpsellCard, useToolsQuota } from './toolsShared';

interface DimDef { key: string; label: string; unit?: string; default?: number }
interface Starter { id: string; title: string; description: string | null; project_type: string | null; dimensions_schema: DimDef[]; source_currency: string }
interface EstimateTask { label: string; unit: string | null; quantity: number; unit_price: number; line_total: number; is_allowance: boolean; selected: boolean }
interface EstimateSection { label: string; total: number; tasks: EstimateTask[] }
interface EstimateResult { blueprint: { id: string; title: string }; currency: string; subtotal: number; sections: EstimateSection[]; ungrouped: EstimateTask[] }

const money = (v: number, currency: string) => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v); }
  catch { return `${currency} ${v.toFixed(0)}`; }
};

export default function ProjectPlanPage() {
  const { user, session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const isAuthenticated = !!user;
  const { quota, setQuota, quotaError } = useToolsQuota(accessToken);

  const [starters, setStarters] = useState<Starter[]>([]);
  const [startersLoading, setStartersLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');
  const [dims, setDims] = useState<Record<string, string>>({});

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EstimateResult | null>(null);

  const selected = useMemo(() => starters.find((s) => s.id === selectedId) ?? null, [starters, selectedId]);
  const limitReached = !isAuthenticated && quota?.remaining === 0;

  useEffect(() => {
    supabase.functions.invoke('public-project-plan', { body: { action: 'starters' } })
      .then(({ data, error }) => {
        if (error) return;
        const list = (data?.starters ?? []) as Starter[];
        // Lead with the Full Home Renovation blueprint — it's the most complete
        // estimate, so it's the default selection and shows first.
        const isFull = (s: Starter) => s.project_type === 'full_home_renovation';
        list.sort((a, b) => (isFull(a) ? 0 : 1) - (isFull(b) ? 0 : 1));
        setStarters(list);
        const preferred = list.find(isFull) ?? list[0];
        if (preferred) setSelectedId(preferred.id);
      })
      .finally(() => setStartersLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    const next: Record<string, string> = {};
    for (const d of selected.dimensions_schema ?? []) next[d.key] = String(d.default ?? 0);
    setDims(next);
    setResult(null);
  }, [selected]);

  // Stash the current selection so we can import it into the user's library after
  // they sign up (the public tool has no workspace to save into). Picked up by
  // BlueprintLibraryPage on the post-login landing.
  const saveAndSignUp = () => {
    if (!selected) return;
    const numericDims: Record<string, number> = {};
    for (const [k, v] of Object.entries(dims)) numericDims[k] = Number(String(v).replace(',', '.')) || 0;
    try {
      localStorage.setItem('mk_pending_blueprint', JSON.stringify({
        starter_id: selected.id, title: selected.title, dimensions: numericDims, savedAt: Date.now(),
      }));
    } catch { /* private mode / storage full — fall through to plain signup */ }
    // Already signed in? skip the auth bounce — /blueprints imports the pending plan on mount.
    window.location.href = isAuthenticated ? '/blueprints' : '/auth?mode=signup&redirect=/blueprints';
  };

  const handleVerify = useCallback((t: string) => { setTurnstileToken(t); setTurnstileError(null); }, []);
  const resetCaptcha = () => { setTurnstileToken(null); turnstileRef.current?.reset(); };

  const run = async () => {
    if (!selected) return;
    if (!turnstileToken) { setError('Please complete the bot check first.'); return; }
    setRunning(true); setError(null); setResult(null);
    try {
      const numericDims: Record<string, number> = {};
      for (const [k, v] of Object.entries(dims)) numericDims[k] = Number(String(v).replace(',', '.')) || 0;
      const { data, error: invErr } = await supabase.functions.invoke('public-project-plan', {
        body: { action: 'estimate', blueprint_id: selected.id, dimensions: numericDims, turnstile_token: turnstileToken },
      });
      if (invErr) throw await edgeError(invErr, 'Estimate failed');
      if (data?.error === 'quota_exceeded') { await fetchQuota(accessToken).then(setQuota).catch(() => {}); return; }
      if (!data?.success) throw new Error(data?.error || 'Estimate failed');
      setResult(data.result as EstimateResult);
      await fetchQuota(accessToken).then(setQuota).catch(() => {});
    } catch (e) {
      setError((e as Error)?.message ?? 'Estimate failed');
    } finally {
      setRunning(false);
      resetCaptcha();
    }
  };

  return (
    <ToolsShell headerRight={<QuotaBadge quota={quota} isAuthenticated={isAuthenticated} />}>
      <div className="text-center mb-8">
        <h1 className="text-3xl font-semibold tracking-tight mb-2 flex items-center justify-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />
          Project plan estimator
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Pick a project type, enter a few measurements, and get a structured scope of works with a ballpark price — in seconds.
        </p>
      </div>

      {quotaError && (
        <Card className="mb-6 border-destructive/40"><CardContent className="py-4 flex items-center gap-3 text-sm">
          <AlertCircle className="h-5 w-5 text-destructive" /><span>Could not load quota: {quotaError}</span>
        </CardContent></Card>
      )}

      {limitReached && quota ? (
        <UpsellCard quota={quota} isAuthenticated={isAuthenticated} />
      ) : (
        <Card className="dashboard-card">
          <CardHeader>
            {startersLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading project types…</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>Project type</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {starters.map((s) => (
                      <button key={s.id} onClick={() => setSelectedId(s.id)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${selectedId === s.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/40'}`}>
                        {s.title}
                      </button>
                    ))}
                  </div>
                </div>
                {selected && (selected.dimensions_schema?.length ?? 0) > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {selected.dimensions_schema.map((d) => (
                      <div key={d.key} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{d.label}{d.unit ? ` (${d.unit})` : ''}</Label>
                        <Input inputMode="decimal" value={dims[d.key] ?? ''} onChange={(e) => setDims((s) => ({ ...s, [d.key]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {quota?.turnstile_site_key ? (
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                  <Label className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><Shield className="h-3.5 w-3.5" /> Bot check — required before each estimate</Label>
                  <TurnstileWidget ref={turnstileRef} siteKey={quota.turnstile_site_key} action="project_plan_scan"
                    onVerify={handleVerify} onExpired={() => setTurnstileToken(null)}
                    onError={(c) => { setTurnstileError(c); setTurnstileToken(null); }} />
                  {turnstileError && <p className="text-xs text-destructive mt-1">Captcha error: {turnstileError}</p>}
                </div>
                <Button onClick={run} disabled={running || !turnstileToken || !selected} className="gap-2 min-w-[160px]" size="lg">
                  {running ? <><Loader2 className="h-4 w-4 animate-spin" /> Estimating…</> : <><Calculator className="h-4 w-4" /> Estimate</>}
                </Button>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading bot check…</div>
            )}

            {error && <div className="flex items-start gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /><span>{error}</span></div>}
            {quota && !isAuthenticated && quota.remaining > 0 && (
              <p className="text-xs text-muted-foreground">{quota.remaining} of {quota.limit} free estimates remaining today.</p>
            )}
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="mt-6 dashboard-card overflow-hidden">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <CardTitle className="text-lg flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /> {result.blueprint.title}</CardTitle>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Estimated total</div>
                <div className="text-2xl font-semibold">{money(result.subtotal, result.currency)}</div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.sections.filter((s) => s.tasks.some((t) => t.selected)).map((s, i) => (
              <div key={i} className="rounded-lg border border-border/50">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30 text-sm font-medium">
                  <span>{s.label}</span><span className="tabular-nums">{money(s.total, result.currency)}</span>
                </div>
                <div className="divide-y divide-border/40">
                  {s.tasks.filter((t) => t.selected).map((t, j) => (
                    <div key={j} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-muted-foreground">
                        {t.label}
                        {t.is_allowance ? <Badge variant="outline" className="ml-2 text-[10px] h-4">allowance</Badge>
                          : <span className="text-xs text-muted-foreground/70"> · {t.quantity}{t.unit ? ` ${t.unit}` : ''}</span>}
                      </span>
                      <span className="tabular-nums">{money(t.line_total, result.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <Card className="border-primary/30 bg-primary/[0.03]">
              <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <Sparkles className="h-5 w-5 text-primary shrink-0" />
                <div className="text-sm flex-1">
                  <div className="font-medium">Save &amp; make this yours</div>
                  <div className="text-muted-foreground">We'll keep this plan and import it into your library after you sign up — then edit every line, use your own rates, and turn it into a client quote.</div>
                </div>
                <Button className="rounded-full whitespace-nowrap" onClick={saveAndSignUp}>Save &amp; create free account</Button>
              </CardContent>
            </Card>
            <p className="text-[11px] text-muted-foreground text-center">Ballpark estimate using standard rates — your actual pricing will differ.</p>
          </CardContent>
        </Card>
      )}
    </ToolsShell>
  );
}
