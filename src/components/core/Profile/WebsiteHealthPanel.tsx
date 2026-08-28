import React, { useEffect, useState } from 'react';
import { timeAgo } from '@/utils/datetime';
import { Loader2, RefreshCw, Gauge, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { useToast } from '@/hooks/use-toast';
import { userWebsitesService, type UserWebsite, type WebsiteHealth } from '@/services/userWebsitesService';
import { Badge } from '@/components/core/ui/badge';
import { CHECK_GROUPS, buildCheckInventory, type CheckGroup } from './seo/onPageChecks';


const scoreColor = (s: number | null) =>
  s == null ? 'text-muted-foreground'
    : s >= 90 ? 'text-emerald-600 dark:text-emerald-400'
    : s >= 50 ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-500';

function Gauge100({ label, score }: { label: string; score: number | null }) {
  const s = score ?? 0;
  const ring = score == null ? 'stroke-muted' : s >= 90 ? 'stroke-emerald-500' : s >= 50 ? 'stroke-amber-500' : 'stroke-red-500';
  const c = 2 * Math.PI * 26;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-[72px] h-[72px]">
        <svg viewBox="0 0 60 60" className="w-full h-full -rotate-90">
          <circle cx="30" cy="30" r="26" fill="none" className="stroke-muted" strokeWidth="5" opacity="0.35" />
          <circle cx="30" cy="30" r="26" fill="none" className={ring} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c - (s / 100) * c} />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums ${scoreColor(score)}`}>
          {score == null ? '—' : score}
        </span>
      </div>
      <span className="text-xs text-muted-foreground text-center">{label}</span>
    </div>
  );
}

/** Site Health tab — homepage Lighthouse (Core Web Vitals) + on-page issues. */
export const WebsiteHealthPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const [health, setHealth] = useState<WebsiteHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setHealth(await userWebsitesService.healthLatest(website.id)); }
    catch (e: any) { toast({ title: 'Could not load Site Health', description: e.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [website.id]);

  const run = async () => {
    setRunning(true);
    try {
      await userWebsitesService.healthRun(website.id);
      toast({ title: 'Site Health checked' });
      load();
    } catch (e: any) {
      toast({ title: 'Audit failed', description: e.message, variant: 'destructive' });
    } finally { setRunning(false); }
  };

  if (loading) {
    return <Card className="dashboard-card"><CardContent className="flex items-center justify-center py-14"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Gauge className="w-4 h-4 text-primary" />Site Health</CardTitle>
            <CardDescription>
              Homepage Lighthouse (Core Web Vitals) + on-page audit.
              {health ? <> · last checked {timeAgo(health.created_at)}</> : null}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={run} disabled={running}>
            {running ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            {health ? 'Re-check' : 'Run check'}
          </Button>
        </CardHeader>
        <CardContent>
          {!health ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No Site Health check yet. Run one to score the homepage — or the nightly audit will populate it.
            </div>
          ) : health.status === 'error' ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
              <span className="break-all">{health.error || 'Audit failed'}</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-6 justify-center sm:justify-start">
              {/* Every gauge is ALWAYS rendered. Hiding the Lighthouse three when they
                  were null is what made a broken Lighthouse call look like a design
                  choice: the request asked for `best-practices` where DataForSEO wants
                  `best_practices`, the whole task 40501'd, and all three scores were
                  NULL on every audit ever taken. A missing score now says so. */}
              <Gauge100 label="On-page SEO" score={health.seo_score} />
              <Gauge100 label="Performance" score={health.perf_score} />
              <Gauge100 label="Accessibility" score={health.a11y_score} />
              <Gauge100 label="Best practices" score={health.bp_score} />
              {health.perf_score == null && (
                <p className="max-w-[26ch] text-xs text-muted-foreground">
                  Lighthouse returned nothing on this audit, so speed and accessibility are
                  unknown — not zero. Re-check to fetch them.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── What was actually CHECKED ────────────────────────────────────────
          52 booleans have always been stored on every audit and none of them
          were ever shown. The panel listed failures only, so a clean audit
          rendered as an empty box — visually identical to an audit that never
          ran, and it never told anyone what had been verified. */}
      {health?.status === 'ok' && (() => {
        const inv = buildCheckInventory(health.onpage?.checks);
        if (inv.verdicts.length === 0) return null;
        const groups = new Map<CheckGroup, typeof inv.verdicts>();
        for (const v of inv.verdicts) {
          const list = groups.get(v.check.group) ?? [];
          list.push(v);
          groups.set(v.check.group, list);
        }
        return (
          <Card className="dashboard-card">
            <CardHeader>
              <CardTitle className="text-base">What we checked</CardTitle>
              <CardDescription>
                {inv.passed} passed · {inv.failed} need attention. Failures are listed first in each
                group, with what the problem costs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {[...groups.entries()].map(([group, list]) => {
                // Failures first: a list sorted by anything else buries the only rows
                // anyone needs to act on.
                const sorted = [...list].sort((a, b) => Number(a.passed) - Number(b.passed));
                const failed = list.filter((v) => !v.passed).length;
                return (
                  <div key={group}>
                    <div className="mb-2 flex items-baseline gap-2">
                      <p className="text-xs font-semibold text-muted-foreground">{CHECK_GROUPS[group]}</p>
                      {failed > 0
                        ? <Badge variant="warning">{failed} to fix</Badge>
                        : <Badge variant="success">all clear</Badge>}
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {sorted.map(({ check, passed }) => (
                        <div
                          key={check.key}
                          className={`flex items-start gap-2 rounded-sm border p-2 ${
                            passed ? 'border-hairline bg-surface-sunken' : 'border-amber-500/30 bg-amber-500/10'
                          }`}
                        >
                          {passed
                            ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--success))]" aria-hidden="true" />
                            : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />}
                          <div className="min-w-0">
                            <p className={`text-xs ${passed ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>
                              {check.label}
                            </p>
                            {!passed && check.cost && (
                              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{check.cost}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {inv.unclassified.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                    Returned but not yet classified
                  </p>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    The provider returned these and this build has no verdict for them. Listed rather
                    than guessed — a confident wrong verdict is worse than an honest gap.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {inv.unclassified.map((k) => (
                      <Badge key={k} variant="neutral">{k.replace(/_/g, ' ')}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

    </div>
  );
};

export default WebsiteHealthPanel;
