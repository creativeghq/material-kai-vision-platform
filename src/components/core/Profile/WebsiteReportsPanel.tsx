import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, FileBarChart, Loader2, Play, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Checkbox } from '@/components/core/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { formatDate, timeAgo } from '@/utils/datetime';
import {
  userWebsitesService,
  type SeoReportRow,
  type SeoReportRunRow,
  type UserWebsite,
} from '@/services/userWebsitesService';

/**
 * Websites → Reports.
 *
 * A report is a SELECTION and a SCHEDULE, not a second copy of the numbers. Every
 * section is one of the derivations the dashboard already reads, so a figure in the
 * report and the same figure on screen cannot disagree — and they would, quickly, if
 * the report re-implemented any of them. The report is the copy that goes to a
 * client, so it is the worse of the two to have drift.
 *
 * Each run is a frozen snapshot: opening last month's report shows what was true
 * last month. That is the whole point of a report, and re-deriving on open would
 * quietly destroy it.
 */

/** Section keys must match `build_website_seo_report`'s CASE arms verbatim. */
const SECTIONS: { key: string; label: string; note: string }[] = [
  { key: 'search_presence', label: 'Search presence', note: 'Keywords, traffic, backlinks and their movement' },
  { key: 'rankings', label: 'Rank tracker', note: 'The keywords you chose, and how they moved' },
  { key: 'search_console', label: 'Search Console', note: 'Clicks, impressions, CTR and average position' },
  { key: 'analytics', label: 'Analytics', note: 'Sessions, users and conversions by channel' },
  { key: 'site_health', label: 'Site health', note: 'Lighthouse scores for the homepage' },
  { key: 'crawl', label: 'Full site crawl', note: 'Broken links, redirect chains, duplicates' },
  { key: 'ai_visibility', label: 'AI visibility', note: 'What AI assistants say when asked' },
  { key: 'competitors', label: 'Competitors', note: 'Your line beside theirs' },
  { key: 'cannibalisation', label: 'Competing pages', note: 'Where your own pages split a query' },
];

const DEFAULT_SECTIONS = ['search_presence', 'rankings', 'search_console', 'site_health'];

export const WebsiteReportsPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const [reports, setReports] = useState<SeoReportRow[]>([]);
  const [runs, setRuns] = useState<Record<string, SeoReportRunRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('Monthly SEO report');
  const [cadence, setCadence] = useState('monthly');
  const [chosen, setChosen] = useState<string[]>(DEFAULT_SECTIONS);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await userWebsitesService.listReports(website.id);
      setReports(list);
      const pairs = await Promise.all(
        list.map(async (r) => [r.id, await userWebsitesService.listReportRuns(r.id, 6)] as const),
      );
      setRuns(Object.fromEntries(pairs));
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [website.id]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!website.workspace_id) return;
    if (chosen.length === 0) {
      toast({ title: 'Pick at least one section', description: 'A report with nothing in it has nothing to say.', variant: 'destructive' });
      return;
    }
    setBusy('create');
    try {
      await userWebsitesService.createReport(website.id, website.workspace_id, name, chosen, cadence);
      setCreating(false);
      toast({ title: 'Report created', description: cadence === 'none' ? 'Build it whenever you need it.' : 'The first one builds on the next run.' });
      await load();
    } catch (e: any) {
      toast({ title: 'Could not create it', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const run = async (id: string) => {
    setBusy(id);
    try {
      await userWebsitesService.runReport(id);
      toast({ title: 'Report built' });
      await load();
    } catch (e: any) {
      toast({ title: 'Could not build it', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    try {
      await userWebsitesService.deleteReport(id);
      await load();
    } catch (e: any) {
      toast({ title: 'Could not delete it', description: e?.message, variant: 'destructive' });
    }
  };

  const toggle = (key: string) =>
    setChosen((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  if (loading) {
    return (
      <Card className="dashboard-card">
        <CardContent className="flex justify-center py-14"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent>
      </Card>
    );
  }

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileBarChart className="h-4 w-4 text-primary" />
            Reports
          </CardTitle>
          <CardDescription>
            A saved selection of sections on a schedule. Each build is kept as it was, so an old
            report still shows the period it covered.
          </CardDescription>
        </div>
        {!creating && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" />New report
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {creating && (
          <div className="space-y-3 rounded-sm border border-hairline bg-surface-sunken p-3">
            <div className="flex flex-wrap gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 max-w-[280px]" placeholder="Report name" />
              <Select value={cadence} onValueChange={setCadence}>
                <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Every month</SelectItem>
                  <SelectItem value="weekly">Every week</SelectItem>
                  <SelectItem value="none">Only when I ask</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {SECTIONS.map((s) => (
                <label key={s.key} className="flex cursor-pointer items-start gap-2 rounded-sm border border-hairline bg-card p-2">
                  <Checkbox
                    checked={chosen.includes(s.key)}
                    onCheckedChange={() => toggle(s.key)}
                    className="mt-0.5"
                    aria-label={s.label}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-foreground">{s.label}</span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">{s.note}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={create} disabled={busy === 'create'}>
                {busy === 'create' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Create report
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {reports.length === 0 && !creating ? (
          <HubEmptyState
            variant="empty"
            title="No reports yet"
            description="Pick the sections that matter and a cadence. Each build is kept, so you can hand someone last month's exactly as it was."
            action={<Button size="sm" onClick={() => setCreating(true)}>New report</Button>}
          />
        ) : (
          <div className="space-y-2">
            {reports.map((r) => {
              const history = runs[r.id] ?? [];
              const lastFailed = history[0]?.status === 'failed';
              return (
                <div key={r.id} className="rounded-sm border border-hairline p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{r.name}</span>
                      <Badge variant={r.cadence === 'none' ? 'neutral' : 'secondary'}>
                        {r.cadence === 'none' ? 'manual' : r.cadence}
                      </Badge>
                      {lastFailed && <Badge variant="error">last build failed</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => run(r.id)} disabled={busy === r.id}>
                        {busy === r.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                        Build now
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => remove(r.id)} aria-label={`Delete ${r.name}`}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {r.sections.map((k) => SECTIONS.find((s) => s.key === k)?.label ?? k).join(' · ')}
                  </p>

                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <CalendarClock className="h-3 w-3" aria-hidden="true" />
                    {r.last_sent_at ? <>last built {timeAgo(r.last_sent_at)}</> : <>never built</>}
                    {r.cadence !== 'none' && r.next_due_at ? <> · next {formatDate(r.next_due_at)}</> : null}
                  </p>

                  {lastFailed && history[0]?.error && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                      {history[0].error}
                    </p>
                  )}

                  {history.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {history.map((h) => (
                        <li key={h.id}>
                          <Badge variant={h.status === 'failed' ? 'error' : 'neutral'}>
                            {h.period_end ? formatDate(h.period_end) : formatDate(h.generated_at)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WebsiteReportsPanel;
