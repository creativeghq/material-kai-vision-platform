import React, { useEffect, useState } from 'react';
import { timeAgo } from '@/utils/datetime';
import { Loader2, RefreshCw, Gauge, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { useToast } from '@/hooks/use-toast';
import { userWebsitesService, type UserWebsite, type WebsiteHealth } from '@/services/userWebsitesService';


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
              <Gauge100 label="On-page SEO" score={health.seo_score} />
              {/* Lighthouse (Core Web Vitals) — only when present (DataForSEO Lighthouse is async). */}
              {health.perf_score != null && <Gauge100 label="Performance" score={health.perf_score} />}
              {health.a11y_score != null && <Gauge100 label="Accessibility" score={health.a11y_score} />}
              {health.bp_score != null && <Gauge100 label="Best practices" score={health.bp_score} />}
              <p className="text-xs text-muted-foreground max-w-[24ch]">
                On-page score + issues are live. For full Core Web Vitals, ask the agent to run a site crawl.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {health?.status === 'ok' && (health.issues?.length ?? 0) > 0 && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="text-base">Issues to fix ({health.issues!.length})</CardTitle>
            <CardDescription>On-page problems detected on the homepage.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {health.issues!.map((it, i) => (
              <div key={i} className="flex items-start gap-2 p-2 border rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{it.title}</p>
                  {it.display_value && <p className="text-xs text-muted-foreground">{it.display_value}</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {health?.status === 'ok' && (health.issues?.length ?? 0) === 0 && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 px-1">
          <CheckCircle2 className="w-4 h-4" /> No on-page issues on the homepage. For a full multi-page crawl, ask the agent to "run a site crawl".
        </div>
      )}
    </div>
  );
};

export default WebsiteHealthPanel;
