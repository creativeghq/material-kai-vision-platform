import React, { useCallback, useEffect, useState } from 'react';
import { Compass, Loader2 } from 'lucide-react';

import { HubEmptyState } from '@/components/core/hub';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { timeAgo } from '@/utils/datetime';
import { edgeErrorMessage } from '@/utils/edgeError';
import { PresencePlatforms, type PresenceVerdict } from './PresencePlatforms';

interface Plan { id: string; brand: string; keywords: string[]; platforms: PresenceVerdict[]; created_at: string }
interface Estimate { keywords: string[]; brand: string; calls: number; max_credits: number | null }

async function callPlan<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('seo-api', { body: { action: 'presence_plan', ...body } });
  if (error) throw new Error(await edgeErrorMessage(error, 'The presence plan failed'));
  if (data?.success === false) throw new Error(String(data.error ?? 'The presence plan failed'));
  return data.data as T;
}

/** Website → AI Citations: where the brand appears beyond Google, built on a button, with the cost stated first. */
export const PresencePlanCard: React.FC<{ websiteId: string }> = ({ websiteId }) => {
  const { toast } = useToast();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchPlan = useCallback(async () => {
    const { data, error } = await supabase.from('seo_presence_plans' as never)
      .select('id, brand, keywords, platforms, created_at').eq('website_id', websiteId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Plan | null) ?? null;
  }, [websiteId]);
  const loadPlan = useCallback(async () => {
    try {
      setPlan(await fetchPlan());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [fetchPlan]);
  useEffect(() => {
    let cancelled = false;
    setPlan(undefined);
    setEstimate(null);
    setLoadError(null);
    fetchPlan().then(
      (p) => { if (!cancelled) setPlan(p); },
      (e: unknown) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e)); },
    );
    callPlan<Estimate>({ website_id: websiteId, estimate: true }).then(
      (est) => { if (!cancelled) setEstimate(est); },
      () => { if (!cancelled) setEstimate(null); },
    );
    return () => { cancelled = true; };
  }, [fetchPlan, websiteId]);

  const build = async () => {
    setBusy(true);
    try {
      await callPlan({ website_id: websiteId });
    } catch (e) {
      toast({ title: 'Plan not built', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      await loadPlan();
      setBusy(false);
    }
  };

  const noKeywords = estimate !== null && estimate.keywords.length === 0;
  const button = (
    <Button size="sm" onClick={() => void build()} disabled={busy || noKeywords}>
      {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Compass className="mr-1.5 h-3.5 w-3.5" />}
      {plan ? 'Rebuild the plan' : 'Build the plan'}
    </Button>
  );

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Compass className="h-4 w-4 text-primary" /> Presence beyond Google</CardTitle>
        <CardDescription>
          AI assistants quote YouTube, Reddit, Pinterest and review sites. This searches your top non-branded queries
          there, says where you appear, and lists what to do on each.
        </CardDescription>
        {estimate && (
          <p className="text-xs text-muted-foreground">
            {noKeywords
              ? 'No non-branded Search Console query or tracked keyword yet, so there is nothing to search for.'
              : `Searches ${estimate.keywords.map((k) => `"${k}"`).join(', ')} and "${estimate.brand}": ${estimate.calls} lookups${estimate.max_credits != null ? `, up to ${estimate.max_credits} credits, charged at the real cost` : ''}.`}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {loadError ? (
          <p className="text-sm text-destructive">Could not load the saved plan: {loadError}</p>
        ) : plan === undefined ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : plan ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Built {timeAgo(plan.created_at)} for {plan.keywords.map((k) => `"${k}"`).join(', ')}</span>
              {button}
            </div>
            <PresencePlatforms platforms={plan.platforms} />
          </>
        ) : (
          <HubEmptyState icon={Compass} title="No plan yet" description="Build one to see where the brand shows up beyond Google." action={button} />
        )}
      </CardContent>
    </Card>
  );
};
