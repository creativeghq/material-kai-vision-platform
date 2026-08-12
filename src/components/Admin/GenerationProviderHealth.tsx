/**
 * Generation provider health — the Operations-page answer to "why is nothing generating?".
 *
 * THE BUG THIS PANEL EXISTS FOR (issue #4). Replicate returned 402 Insufficient credit on every
 * model from 2026-06-26, and Operations reported it HEALTHY for two months. `get_provider_health`
 * derives failure from ai_usage_logs, where the row is written BEFORE the upstream call and never
 * corrected — 0 of 22 generation rows carry a `success` key, so a 100% failure rate computed as
 * 0.000 and rendered green. Nothing on this page could have told you the account was empty.
 *
 * So this panel reads generation_models.last_probe_*, written by the model-health-check background
 * agent, which actually asks the provider on a schedule rather than inferring from traffic. The
 * distinction it exists to make visible:
 *
 *   credit_exhausted (402)  the ACCOUNT is empty  → add funds; the models are fine
 *   auth_failed (401/403)   the TOKEN is wrong    → funding changes nothing
 *   not_found (404)         the model is DELETED  → no amount of money brings it back
 *
 * Those three are indistinguishable from the user's side — every one is just "generation failed" —
 * and they have three different remedies. Collapsing them is how a four-model deletion and a
 * billing outage looked like the same event for two months.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/utils/datetime';

type ProbeStatus =
  | 'ok' | 'credit_exhausted' | 'not_found' | 'schema_rejected'
  | 'auth_failed' | 'error' | 'timeout';

interface ModelRow {
  id: string;
  display_name: string;
  provider: string;
  capability: string;
  enabled: boolean;
  status: string;
  last_probe_at: string | null;
  last_probe_status: ProbeStatus | null;
  last_probe_error: string | null;
  last_verified_at: string | null;
}

interface ProviderSummary {
  provider: string;
  total: number;
  byStatus: Partial<Record<ProbeStatus | 'never', number>>;
  lastProbeAt: string | null;
  sampleError: string | null;
  verdict: { tone: 'critical' | 'warning' | 'ok' | 'unknown'; headline: string; action: string };
}

/** Where an operator goes to actually fix each verdict. Only providers we can link usefully. */
const BILLING_URL: Record<string, string> = {
  replicate: 'https://replicate.com/account/billing#billing',
};

function summarise(provider: string, rows: ModelRow[]): ProviderSummary {
  const byStatus: Partial<Record<ProbeStatus | 'never', number>> = {};
  for (const r of rows) {
    const k = (r.last_probe_status ?? 'never') as ProbeStatus | 'never';
    byStatus[k] = (byStatus[k] ?? 0) + 1;
  }
  const probed = rows.filter((r) => r.last_probe_at);
  const lastProbeAt = probed.length
    ? probed.map((r) => r.last_probe_at!).sort().slice(-1)[0]
    : null;

  const credit = byStatus.credit_exhausted ?? 0;
  const auth   = byStatus.auth_failed ?? 0;
  const gone   = byStatus.not_found ?? 0;
  const never  = byStatus.never ?? 0;

  let verdict: ProviderSummary['verdict'];
  if (credit > 0) {
    verdict = {
      tone: 'critical',
      headline: `Out of credit — ${credit} of ${rows.length} models refused`,
      action: 'Add funds. Every model on this provider is down until then. Users are refunded, but each request still burns one failed call per model in the fan-out.',
    };
  } else if (auth > 0) {
    verdict = {
      tone: 'critical',
      headline: `Credentials rejected on ${auth} model${auth === 1 ? '' : 's'}`,
      action: 'Check the API token. This is not a funding problem — the account was never reached.',
    };
  } else if (gone > 0) {
    verdict = {
      tone: 'warning',
      headline: `${gone} model${gone === 1 ? '' : 's'} deleted upstream`,
      action: 'Remove them from the registry and from any picker still offering them. Funding changes nothing here.',
    };
  } else if (never === rows.length) {
    verdict = {
      tone: 'unknown',
      headline: 'Never probed',
      action: 'No probe has ever run for this provider, so "healthy" here means "unasked". Only Replicate is probed today.',
    };
  } else {
    verdict = { tone: 'ok', headline: 'Reachable', action: 'The last probe was accepted by the provider.' };
  }
  return { provider, total: rows.length, byStatus, lastProbeAt, sampleError: rows.find((r) => r.last_probe_error)?.last_probe_error ?? null, verdict };
}

/** Status renders as a plain coloured word — never a pill. See the design system. */
const TONE_CLASS: Record<ProviderSummary['verdict']['tone'], string> = {
  critical: 'text-destructive',
  warning:  'text-amber-600 dark:text-amber-400',
  ok:       'text-emerald-600 dark:text-emerald-400',
  unknown:  'text-muted-foreground',
};

const PROBE_LABEL: Record<ProbeStatus | 'never', string> = {
  ok: 'reachable',
  credit_exhausted: 'out of credit',
  not_found: 'deleted upstream',
  schema_rejected: 'input rejected',
  auth_failed: 'credentials rejected',
  error: 'error',
  timeout: 'timed out',
  never: 'never probed',
};

export function GenerationProviderHealth() {
  const [rows, setRows] = useState<ModelRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('generation_models')
      .select('id, display_name, provider, capability, enabled, status, last_probe_at, last_probe_status, last_probe_error, last_verified_at')
      .eq('enabled', true)
      .order('provider')
      .order('sort_order');
    if (err) setError(err.message);
    else setRows((data ?? []) as ModelRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const providers = rows
    ? Object.entries(
        rows.reduce<Record<string, ModelRow[]>>((acc, r) => {
          (acc[r.provider] ??= []).push(r);
          return acc;
        }, {}),
      )
        .map(([p, rs]) => summarise(p, rs))
        // Worst first — an operator opening this page should not have to hunt for the outage.
        .sort((a, b) => {
          const rank = { critical: 0, warning: 1, unknown: 2, ok: 3 } as const;
          return rank[a.verdict.tone] - rank[b.verdict.tone] || a.provider.localeCompare(b.provider);
        })
    : [];

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle>Generation providers</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            What each provider said when we last asked it directly. This does not infer health from
            traffic — a provider with no traffic and no funds looked healthy for two months that way.
          </p>
        </div>
        <Button variant="outline" size="sm" className="rounded-full shrink-0" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
          Refresh
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {error && <p className="px-6 pb-4 text-sm text-destructive">Could not load: {error}</p>}
        {loading && !rows && <p className="px-6 pb-4 text-sm text-muted-foreground">Loading…</p>}
        {rows && providers.length === 0 && (
          <p className="px-6 pb-4 text-sm text-muted-foreground">No enabled generation models are registered.</p>
        )}

        {providers.map((p) => (
          <div key={p.provider} className="border-t border-border/60 px-6 py-4 first:border-t-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="flex items-baseline gap-3">
                <span className="font-medium capitalize">{p.provider}</span>
                <span className={cn('text-sm font-medium', TONE_CLASS[p.verdict.tone])}>
                  {p.verdict.headline}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {p.lastProbeAt
                  ? `probed ${formatDate(p.lastProbeAt, { withTime: true })}`
                  : 'never probed'}
                {' · '}{p.total} model{p.total === 1 ? '' : 's'}
              </span>
            </div>

            <p className="mt-1 text-sm text-muted-foreground">{p.verdict.action}</p>

            {p.verdict.tone === 'critical' && BILLING_URL[p.provider] && (
              <Button asChild size="sm" className="mt-3 rounded-full">
                <a href={BILLING_URL[p.provider]} target="_blank" rel="noopener noreferrer">
                  Add funds at {p.provider}
                  <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </a>
              </Button>
            )}

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {Object.entries(p.byStatus).map(([k, n]) => (
                <span key={k}>
                  {PROBE_LABEL[k as ProbeStatus | 'never'] ?? k}: {n}
                </span>
              ))}
            </div>

            {p.sampleError && (
              <p className="mt-2 break-words font-mono text-xs text-muted-foreground/80">
                {p.sampleError.slice(0, 220)}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default GenerationProviderHealth;
