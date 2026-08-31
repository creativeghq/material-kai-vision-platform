import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Check, CheckCheck, ExternalLink, FileSearch, Filter, Globe, Info,
  LineChart, Loader2, MoreHorizontal, Pause, Play, Plus, RefreshCw, Trash2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/core/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/core/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import {
  HubDataTable, HubEmptyState, HubFilterSelect, HubToolbar,
  type HubColumn, type HubSort,
} from '@/components/core/hub';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useModule } from '@/modules/_core/useEnabledModules';
import { useToast } from '@/hooks/use-toast';
import { timeAgo } from '@/utils/datetime';
import {
  pageWatchService,
  PAGE_WATCH_CATEGORY_LABELS,
  PAGE_WATCH_SCHEDULES,
  type PageWatch,
  type PageWatchCategory,
  type PageWatchChange,
  type PageWatchChangeStatus,
} from '@/services/pageWatchService';

/**
 * Page monitoring (#331) — watch a page you do NOT control and read what changed.
 *
 * Deliberately separate from the two surfaces it keeps being confused with, and the
 * page now says so out loud rather than leaving an operator to guess:
 *
 *   • **Price monitoring** tracks what retailers charge for OUR products. It has a
 *     product identity to resolve and a structured price to compare.
 *   • **Websites** (Profile → Websites) crawls domains we OWN, whole, for SEO.
 *
 * This has neither: no discovery, no identity, no schema. Somebody names one URL and
 * we report the diff. The whole value IS the diff, so the diff is what the UI puts on
 * screen — coloured per line, not summarised into a status word.
 *
 * The explainer panel is not decoration. Every question it answers — what a check
 * costs, who hears about a change, why this is not under Websites — was previously
 * answerable only by reading this file.
 */

const MODULE_SLUG = 'page-monitoring';

/** Remembers whether the operator has collapsed the explainer. Per-viewer, best-effort. */
const EXPLAINER_KEY = 'page-watches:explainer-open';

function readExplainerPref(): boolean | null {
  try {
    const v = window.localStorage.getItem(EXPLAINER_KEY);
    return v === null ? null : v === '1';
  } catch { return null; }
}

function writeExplainerPref(open: boolean): void {
  try { window.localStorage.setItem(EXPLAINER_KEY, open ? '1' : '0'); } catch { /* private mode */ }
}

type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/**
 * What a WATCH is currently doing.
 *
 * Six answers, not four. The two that were missing are the two that matter most: a
 * watch that has never been checked used to render as "up to date" (it is not — nothing
 * has looked at it yet), and a row saved locally whose Firecrawl monitor was never
 * created rendered the same way (nothing is watching it at all). Both are the silent-zero
 * shape: a plausible absence of news standing in for "we do not know". `rank` floats
 * trouble to the top when the State column is sorted.
 */
function watchState(w: PageWatch): { label: string; tone: Tone; hint?: string; rank: number } {
  if (!w.is_active) {
    return { label: 'Paused', tone: 'neutral', rank: -1, hint: 'Not being checked at all. Resume to start again.' };
  }
  if (w.cache_status === 'failed') {
    return { label: 'Check failed', tone: 'error', rank: 4, hint: w.last_error ?? 'The last check did not complete.' };
  }
  if (!w.firecrawl_monitor_id) {
    return {
      label: 'Not scheduled', tone: 'error', rank: 3,
      hint: 'Saved here, but nothing upstream is watching it yet — use Resume to relink it.',
    };
  }
  const pending = w.unacknowledged_changes ?? 0;
  if (pending > 0) {
    return { label: `${pending} to review`, tone: 'warning', rank: 2 };
  }
  if (!w.last_check_at) {
    return {
      label: 'Awaiting first check', tone: 'info', rank: 1,
      hint: 'The baseline snapshot is usually taken within a minute or two of adding the watch.',
    };
  }
  return { label: 'No changes', tone: 'neutral', rank: 0 };
}

/** What a detected CHANGE was. `same` and `error` mean opposite things — never merge them. */
const CHANGE_STATUS: Record<PageWatchChangeStatus, { label: string; tone: Tone }> = {
  changed: { label: 'Changed', tone: 'warning' },
  new: { label: 'First snapshot', tone: 'info' },
  removed: { label: 'Page gone', tone: 'error' },
  error: { label: 'Check failed', tone: 'error' },
  same: { label: 'No change', tone: 'neutral' },
};

/**
 * The judge's per-change list, which arrives in `diff_json` because git-diff mode
 * has no structured diff of its own. Stored data is untrusted shape — narrow it
 * rather than casting.
 */
function meaningfulChanges(c: PageWatchChange): { before?: string; after?: string; reason?: string }[] {
  const raw = (c.diff_json as { meaningful_changes?: unknown } | null)?.meaningful_changes;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .map((m) => ({
      before: typeof m.before === 'string' ? m.before : undefined,
      after: typeof m.after === 'string' ? m.after : undefined,
      reason: typeof m.reason === 'string' ? m.reason : undefined,
    }))
    .slice(0, 12);
}

/**
 * A unified diff, coloured per line.
 *
 * Rendered as TEXT nodes inside a <pre>, never as an HTML string — this is scraped
 * third-party content (invariant 11). The light shades are the measured-safe ends of the
 * ramp (`emerald-700` / `red-700`): the cream light themes render the 400–600 band below
 * WCAG AA, which is what src/utils/statusTone.ts exists to record.
 */
const DiffBlock: React.FC<{ text: string }> = ({ text }) => (
  <pre className="mt-2 max-h-72 overflow-auto rounded-sm border border-hairline bg-surface-sunken p-3 text-xs leading-relaxed">
    {text.slice(0, 8000).split('\n').map((line, i) => (
      <div
        key={i}
        className={cn(
          'whitespace-pre-wrap break-words',
          line.startsWith('+') && !line.startsWith('+++') && 'text-emerald-700 dark:text-emerald-400',
          line.startsWith('-') && !line.startsWith('---') && 'text-red-700 dark:text-red-400',
          line.startsWith('@@') && 'text-muted-foreground',
        )}
      >
        {line || ' '}
      </div>
    ))}
  </pre>
);

const EMPTY_FORM = {
  name: '',
  url: '',
  category: 'supplier_terms' as PageWatchCategory,
  goal: '',
  schedule_text: 'every day at 09:00',
};

const STATE_FILTERS = [
  { value: 'all', label: 'Any state' },
  { value: 'review', label: 'Needs review' },
  { value: 'trouble', label: 'Not running' },
  { value: 'quiet', label: 'Running, quiet' },
  { value: 'paused', label: 'Paused' },
] as const;

const HOW_IT_WORKS = [
  {
    n: 1,
    title: 'You name one page',
    body: 'Any public https page. One URL per watch, with a plain-English name, because that name is what the alert will be called a month from now.',
  },
  {
    n: 2,
    title: 'We re-fetch it on your schedule',
    body: 'A baseline snapshot is taken within a minute or two, then every check is diffed against the last one. You hear about changes only — never "still the same".',
  },
  {
    n: 3,
    title: 'You read the diff',
    body: 'The exact lines that moved, kept for 90 days. Mark one reviewed and it stops counting against the watch.',
  },
];

export default function PageWatchesPage() {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const { enabled: moduleEnabled, isLoading: moduleLoading } = useModule(MODULE_SLUG);

  const [watches, setWatches] = useState<PageWatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PageWatch | null>(null);
  const [open, setOpen] = useState<{ watch: PageWatch; changes: PageWatchChange[] } | null>(null);
  const [explainerOpen, setExplainerOpen] = useState<boolean>(() => readExplainerPref() ?? true);

  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [sort, setSort] = useState<HubSort>({ columnId: 'state', direction: 'desc' });

  const load = useCallback(async () => {
    if (!activeWorkspaceId || moduleLoading || !moduleEnabled) { setLoading(false); return; }
    setLoading(true);
    try {
      setWatches(await pageWatchService.list(activeWorkspaceId));
      setLoadError(null);
    } catch (e) {
      // A failed read is NOT an empty list. Keep the reason and render it, or the screen
      // says "nothing is being watched yet" about a request that never landed.
      setLoadError(e instanceof Error ? e.message : 'The watched pages could not be loaded.');
      setWatches([]);
    } finally { setLoading(false); }
  }, [activeWorkspaceId, moduleEnabled, moduleLoading]);

  useEffect(() => { void load(); }, [load]);

  const toggleExplainer = () => {
    setExplainerOpen((prev) => { writeExplainerPref(!prev); return !prev; });
  };

  const clearFilters = () => { setSearch(''); setKind('all'); setStateFilter('all'); };

  const pendingTotal = useMemo(
    () => watches.reduce((n, w) => n + (w.unacknowledged_changes ?? 0), 0),
    [watches],
  );
  const troubleTotal = useMemo(
    () => watches.filter((w) => watchState(w).rank >= 3).length,
    [watches],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = watches.filter((w) => {
      if (q && !`${w.name} ${w.url}`.toLowerCase().includes(q)) return false;
      if (kind !== 'all' && w.category !== kind) return false;
      if (stateFilter !== 'all') {
        const { rank } = watchState(w);
        if (stateFilter === 'review' && rank !== 2) return false;
        if (stateFilter === 'trouble' && rank < 3) return false;
        if (stateFilter === 'quiet' && rank !== 0 && rank !== 1) return false;
        if (stateFilter === 'paused' && rank !== -1) return false;
      }
      return true;
    });

    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sort.columnId) {
        case 'kind':
          return dir * PAGE_WATCH_CATEGORY_LABELS[a.category]
            .localeCompare(PAGE_WATCH_CATEGORY_LABELS[b.category]);
        case 'checked':
          return dir * ((a.last_check_at ? Date.parse(a.last_check_at) : 0)
            - (b.last_check_at ? Date.parse(b.last_check_at) : 0));
        case 'state':
          return dir * (watchState(a).rank - watchState(b).rank);
        default:
          return dir * a.name.localeCompare(b.name);
      }
    });
  }, [watches, search, kind, stateFilter, sort]);

  const filtersActive = search.trim() !== '' || kind !== 'all' || stateFilter !== 'all';

  async function submit() {
    if (!activeWorkspaceId) return;
    setSaving(true);
    try {
      await pageWatchService.create(activeWorkspaceId, {
        name: form.name.trim(),
        url: form.url.trim(),
        category: form.category,
        goal: form.goal.trim() || undefined,
        schedule_text: form.schedule_text.trim() || undefined,
      });
      setForm(EMPTY_FORM);
      setAdding(false);
      await load();
      toast({
        title: 'Watching that page',
        description: 'The baseline snapshot is taken within a minute or two. After that you hear about changes only.',
      });
    } catch (e) {
      toast({
        title: 'Could not add the watch',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally { setSaving(false); }
  }

  async function act(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusyId(id);
    try {
      await fn();
      await load();
      toast({ title: ok });
    } catch (e) {
      toast({
        title: 'That did not work',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally { setBusyId(null); }
  }

  async function openChanges(watch: PageWatch) {
    if (!activeWorkspaceId) return;
    setBusyId(watch.id);
    try {
      setOpen({ watch, changes: await pageWatchService.changes(activeWorkspaceId, watch.id) });
    } catch (e) {
      toast({
        title: 'Could not load the change history',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally { setBusyId(null); }
  }

  async function acknowledge(changeIds: string[]) {
    if (!activeWorkspaceId || changeIds.length === 0) return;
    try {
      // Sequential on purpose: acknowledging is one edge call per change, and a burst
      // of parallel ones against a rate-limited function is how "Mark all reviewed"
      // ends up half-applied with no sign of which half.
      for (const id of changeIds) {
        await pageWatchService.acknowledge(activeWorkspaceId, id);
      }
      const now = new Date().toISOString();
      const done = new Set(changeIds);
      setOpen((prev) => (prev
        ? { ...prev, changes: prev.changes.map((c) => (done.has(c.id) ? { ...c, acknowledged_at: now } : c)) }
        : prev));
    } catch (e) {
      // This used to have no catch at all, so a failure left the counter unchanged
      // and the button looking inert.
      toast({
        title: 'Could not mark that reviewed',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      void load();
    }
  }

  const columns: HubColumn<PageWatch>[] = [
    {
      id: 'page',
      header: 'Page',
      sortable: true,
      cell: (w) => (
        <div className="min-w-0">
          <button
            type="button"
            className="block max-w-full truncate text-left font-medium text-primary hover:underline"
            onClick={(e) => { e.stopPropagation(); void openChanges(w); }}
          >
            {w.name}
          </button>
          <a
            href={w.url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            <span className="truncate">{w.url.replace(/^https:\/\//, '')}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </div>
      ),
    },
    {
      id: 'kind',
      header: 'Kind',
      sortable: true,
      hideBelow: 'md',
      cell: (w) => <span className="text-muted-foreground">{PAGE_WATCH_CATEGORY_LABELS[w.category]}</span>,
    },
    {
      id: 'cadence',
      header: 'Runs',
      hideBelow: 'lg',
      // The cadence was on no surface at all before, so "why have I heard nothing in a
      // week" had no answer without reopening the form.
      cell: (w) => <span className="text-muted-foreground">{w.schedule_text}</span>,
    },
    {
      id: 'checked',
      header: 'Last check',
      sortable: true,
      hideBelow: 'sm',
      cell: (w) => <span className="text-muted-foreground">{timeAgo(w.last_check_at)}</span>,
    },
    {
      id: 'state',
      header: 'State',
      sortable: true,
      cell: (w) => {
        const s = watchState(w);
        return (
          <Badge variant={s.tone} title={s.hint}>
            {s.tone === 'error' && <AlertTriangle className="h-3 w-3" />}
            {s.label}
          </Badge>
        );
      },
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      width: 'w-12',
      cell: (w) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={busyId === w.id}>
              {busyId === w.id
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <MoreHorizontal className="h-4 w-4" />}
              <span className="sr-only">Actions for {w.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={() => void openChanges(w)}>
              <FileSearch className="h-4 w-4" /> View changes
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => void act(w.id, () => pageWatchService.run(activeWorkspaceId!, w.id), 'Check started')}
            >
              <RefreshCw className="h-4 w-4" /> Check now (1 credit)
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => void act(
                w.id,
                () => pageWatchService.update(activeWorkspaceId!, w.id, { is_active: !w.is_active }),
                w.is_active ? 'Watch paused' : 'Watch resumed',
              )}
            >
              {w.is_active
                ? <><Pause className="h-4 w-4" /> Pause</>
                : <><Play className="h-4 w-4" /> Resume</>}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onSelect={() => setConfirmDelete(w)}>
              <Trash2 className="h-4 w-4" /> Stop watching
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  /* ── The operator has the module switched off ─────────────────────────────────────
     Every action here — including simply LISTING what is watched — is refused by the
     edge function while `modules.page-monitoring` is disabled. Rendering the normal
     list against that produced an empty table reading "nothing is being watched yet",
     which is a confident answer to a question nobody was allowed to ask. */
  if (!moduleLoading && !moduleEnabled) {
    return (
      <>
        <PageHeader
          icon={FileSearch}
          title="Page monitoring"
          subtitle="Watch a page you do not control and read exactly what changed"
          breadcrumbs={[{ label: 'Tools', to: '/tools' }, { label: 'Page monitoring' }]}
        />
        <div className="space-y-6 p-4 sm:p-6">
          <Card>
            <HubEmptyState
              icon={AlertTriangle}
              title="Page monitoring is switched off for this platform"
              description={'Nothing here runs until an operator enables the "page-monitoring" module. '
                + 'Until then every action on this page is refused, including listing what is already watched.'}
              action={
                <Button size="sm" asChild>
                  <Link to="/admin/modules">Open module settings</Link>
                </Button>
              }
            />
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        icon={FileSearch}
        title="Page monitoring"
        subtitle="Watch a page you do not control and read exactly what changed"
        breadcrumbs={[{ label: 'Tools', to: '/tools' }, { label: 'Page monitoring' }]}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={toggleExplainer}>
              <Info className="h-4 w-4" />
              {explainerOpen ? 'Hide how it works' : 'How it works'}
            </Button>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Watch a page
            </Button>
          </>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        {/* ── What this is, what it costs, and what it is NOT ─────────────────────── */}
        {explainerOpen && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">How page monitoring works</CardTitle>
              <p className="text-xs text-muted-foreground">
                Some of the facts your business runs on live on somebody else&apos;s website — a
                supplier&apos;s payment terms, a regulator&apos;s notice, a partner&apos;s API changelog,
                a competitor&apos;s spec sheet. Nobody tells you when those change. This watches them
                for you and shows you the lines that moved.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <ol className="grid gap-4 sm:grid-cols-3">
                {HOW_IT_WORKS.map((step) => (
                  <li key={step.n} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-xs font-semibold text-primary">
                      {step.n}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{step.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="grid gap-4 border-t border-hairline pt-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold">What a check costs</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    One credit per page per check, plus one more when the change judge runs on a
                    page that actually moved. <span className="text-foreground">Every hour</span> is
                    24 checks a day; <span className="text-foreground">every day at 09:00</span> is
                    one. Pick the slowest cadence you can live with.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold">Who hears about a change</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    A detected change raises the{' '}
                    <span className="text-foreground">Watched Page Changed</span> automation, which
                    notifies the workspace owner. Change who it reaches — or add an email, a task, a
                    message — in{' '}
                    <Link to="/automations" className="text-primary hover:underline">Automations</Link>.
                  </p>
                </div>
              </div>

              {/* The question this page kept being asked. Answer it on the page. */}
              <div className="border-t border-hairline pt-4">
                <p className="text-sm font-semibold">Why this is not part of Websites or Price monitoring</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  All three watch a web page on a schedule. What separates them is whose page it is,
                  and that decides which one you actually want.
                </p>
                <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-sm border border-hairline bg-surface-sunken p-3">
                    <dt className="flex items-center gap-1.5 text-xs font-semibold">
                      <FileSearch className="h-3.5 w-3.5 text-primary" /> Page monitoring
                    </dt>
                    <dd className="mt-1 text-xs text-muted-foreground">
                      One page <span className="text-foreground">someone else owns</span>. There is no
                      schema to extract from a terms page, so the answer is a text diff. You are here.
                    </dd>
                  </div>
                  <div className="rounded-sm border border-hairline bg-surface-sunken p-3">
                    <dt className="flex items-center gap-1.5 text-xs font-semibold">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground" /> Websites
                    </dt>
                    <dd className="mt-1 text-xs text-muted-foreground">
                      Domains <span className="text-foreground">you own</span>, crawled whole for SEO —
                      articles, keywords, audits, Search Console.{' '}
                      <Link to="/profile?tab=websites" className="text-primary hover:underline">
                        Profile → Websites
                      </Link>
                    </dd>
                  </div>
                  <div className="rounded-sm border border-hairline bg-surface-sunken p-3">
                    <dt className="flex items-center gap-1.5 text-xs font-semibold">
                      <LineChart className="h-3.5 w-3.5 text-muted-foreground" /> Price monitoring
                    </dt>
                    <dd className="mt-1 text-xs text-muted-foreground">
                      What retailers charge for{' '}
                      <span className="text-foreground">your products</span> — a resolved product and
                      a number to compare, not a diff to read.{' '}
                      <Link to="/admin/monitoring?tab=price" className="text-primary hover:underline">
                        Monitoring → Price
                      </Link>
                    </dd>
                  </div>
                </dl>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── The list: toolbar and table are ONE object ──────────────────────────── */}
        <div className="overflow-hidden rounded-md border border-hairline bg-card">
          <HubToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search name or URL"
            filters={
              <>
                <HubFilterSelect
                  label="Kind"
                  value={kind}
                  onChange={setKind}
                  options={[
                    { value: 'all', label: 'Any kind' },
                    ...(Object.keys(PAGE_WATCH_CATEGORY_LABELS) as PageWatchCategory[])
                      .map((c) => ({ value: c, label: PAGE_WATCH_CATEGORY_LABELS[c] })),
                  ]}
                />
                <HubFilterSelect
                  label="State"
                  value={stateFilter}
                  onChange={setStateFilter}
                  options={STATE_FILTERS.map((f) => {
                    if (f.value === 'review' && pendingTotal > 0) return { value: f.value, label: `Needs review (${pendingTotal})` };
                    if (f.value === 'trouble' && troubleTotal > 0) return { value: f.value, label: `Not running (${troubleTotal})` };
                    return { value: f.value, label: f.label };
                  })}
                />
                {filtersActive && (
                  <Button variant="link" size="sm" className="h-8 text-xs" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </>
            }
            actions={
              <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
              </Button>
            }
          />

          <HubDataTable
            rows={rows}
            columns={columns}
            rowId={(w) => w.id}
            onRowClick={(w) => void openChanges(w)}
            sort={sort}
            onSortChange={setSort}
            loading={loading}
            className="rounded-none border-0"
            empty={
              loadError ? (
                // A stated reason, never a zero: "nothing is watched yet" about a request
                // that never landed is exactly the lie the metric rule exists to stop.
                <HubEmptyState
                  icon={AlertTriangle}
                  title="The watched pages could not be loaded"
                  description={loadError}
                  action={<Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button>}
                />
              ) : filtersActive ? (
                <HubEmptyState
                  variant="filtered"
                  icon={Filter}
                  title="No watched page matches"
                  description="Widen the search or clear a filter."
                  action={<Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>}
                />
              ) : (
                <HubEmptyState
                  icon={FileSearch}
                  title="Nothing is being watched yet"
                  description="Start with the supplier whose terms you would most hate to learn about late — their payment terms or price list page. You will hear about it the day it changes."
                  action={
                    <Button size="sm" onClick={() => setAdding(true)}>
                      <Plus className="h-4 w-4" /> Watch a page
                    </Button>
                  }
                />
              )
            }
            footer={
              <>
                <span>
                  {rows.length === watches.length
                    ? `${watches.length} watched page${watches.length === 1 ? '' : 's'}`
                    : `${rows.length} of ${watches.length} watched pages`}
                </span>
                {pendingTotal > 0 && (
                  <span className="text-amber-800 dark:text-amber-400">
                    · {pendingTotal} change{pendingTotal === 1 ? '' : 's'} to review
                  </span>
                )}
                {troubleTotal > 0 && (
                  <span className="text-red-700 dark:text-red-400">· {troubleTotal} not running</span>
                )}
              </>
            }
          />
        </div>
      </div>

      {/* ── Add ── */}
      <Dialog open={adding} onOpenChange={(o) => { if (!o) { setAdding(false); setForm(EMPTY_FORM); } }}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Watch a page</DialogTitle>
            <DialogDescription>
              We snapshot the page now, then re-fetch it on the cadence you pick and tell you what
              moved between the two.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw-name">What is it</Label>
              <Input
                id="pw-name" value={form.name} placeholder="Acme Tiles — payment terms"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                This is what the alert will be called, so write it the way you would say it out loud.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw-url">Page URL</Label>
              <Input
                id="pw-url" type="url" value={form.url} placeholder="https://supplier.example.com/terms"
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Must be https, and must be readable without signing in — a page behind a login
                cannot be watched.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Kind</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v as PageWatchCategory })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAGE_WATCH_CATEGORY_LABELS) as PageWatchCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>{PAGE_WATCH_CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Groups the list and shapes the wording of the alert. Nothing else depends on it.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw-goal">What counts as a change worth hearing about?</Label>
              <Textarea
                id="pw-goal" rows={2} value={form.goal}
                placeholder="Payment terms, minimum order quantity or lead times changing. Ignore typos and layout."
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Optional. Describing this turns on the change judge, which labels each diff
                meaningful or not — one extra credit per changed page. It annotates a change; it
                never hides one, so you see every diff either way.
              </p>
            </div>
            <div className="space-y-2">
              <Label>How often</Label>
              {/* A fixed list, not free text: Firecrawl rejects most natural-language
                  cadences, and a rejected schedule means a saved watch that never runs. */}
              <Select
                value={form.schedule_text}
                onValueChange={(v) => setForm({ ...form, schedule_text: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_WATCH_SCHEDULES.map((sched) => (
                    <SelectItem key={sched} value={sched}>{sched}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                One credit per check. A terms page that changes twice a year does not need an
                hourly watch.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              disabled={saving || !form.name.trim() || !form.url.trim()}
              onClick={() => void submit()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Start watching
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Stop watching ── */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop watching “{confirmDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The schedule is cancelled and every change already recorded for this page goes with
              it. If you only want it to go quiet for a while, pause it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = confirmDelete;
                setConfirmDelete(null);
                if (target) {
                  void act(target.id, () => pageWatchService.remove(activeWorkspaceId!, target.id), 'Watch removed');
                }
              }}
            >
              Stop watching
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Change history: the diff IS the product ── */}
      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[820px]">
          <DialogHeader>
            <DialogTitle>{open?.watch.name}</DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <a
                  href={open?.watch.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
                >
                  <span className="truncate">{open?.watch.url.replace(/^https:\/\//, '')}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
                <span>· runs {open?.watch.schedule_text}</span>
                <span>· last check {timeAgo(open?.watch.last_check_at ?? null)}</span>
              </div>
            </DialogDescription>
          </DialogHeader>

          {open && open.changes.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              {open.watch.last_check_at
                ? 'Checked, with nothing to report — the page has not moved since the baseline snapshot.'
                : 'No check has reported back yet. The baseline snapshot is usually taken within a minute or two of adding the watch.'}
            </p>
          ) : (
            <div className="space-y-4">
              {open && open.changes.some((c) => !c.acknowledged_at && c.status !== 'same') && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void acknowledge(
                      open.changes.filter((c) => !c.acknowledged_at && c.status !== 'same').map((c) => c.id),
                    )}
                  >
                    <CheckCheck className="h-3.5 w-3.5" /> Mark all reviewed
                  </Button>
                </div>
              )}

              {open?.changes.map((c) => {
                const s = CHANGE_STATUS[c.status] ?? { label: c.status, tone: 'neutral' as Tone };
                return (
                  <div key={c.id} className="border-b border-hairline pb-4 last:border-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={s.tone}>{s.label}</Badge>
                        <span className="text-xs text-muted-foreground">{timeAgo(c.detected_at)}</span>
                        {c.is_meaningful === true && (
                          <Badge variant="warning">
                            Judged meaningful{c.judge_confidence ? ` · ${c.judge_confidence} confidence` : ''}
                          </Badge>
                        )}
                        {c.is_meaningful === false && (
                          <Badge variant="neutral">
                            Judged not meaningful{c.judge_confidence ? ` · ${c.judge_confidence} confidence` : ''}
                          </Badge>
                        )}
                      </div>
                      {c.acknowledged_at ? (
                        <span className="text-xs text-muted-foreground">Reviewed</span>
                      ) : c.status === 'same' ? null : (
                        <Button
                          size="sm" variant="outline" className="h-8"
                          onClick={() => void acknowledge([c.id])}
                        >
                          <Check className="h-3.5 w-3.5" /> Mark reviewed
                        </Button>
                      )}
                    </div>

                    {c.judge_reason && <p className="mt-2 text-sm">{c.judge_reason}</p>}

                    {meaningfulChanges(c).map((m, i) => (
                      // The judge's structured before/after. This is what an operator reads
                      // first — "30 days → 14 days" — with the unified diff below as evidence.
                      <p key={i} className="mt-1 text-xs text-muted-foreground">
                        <span className="text-foreground">{m.before || '—'}</span>
                        {' → '}
                        <span className="text-foreground">{m.after || '—'}</span>
                        {m.reason ? ` · ${m.reason}` : ''}
                      </p>
                    ))}

                    {c.error && <p className="mt-1 text-sm text-red-700 dark:text-red-400">{c.error}</p>}
                    {c.diff_text && <DiffBlock text={c.diff_text} />}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
