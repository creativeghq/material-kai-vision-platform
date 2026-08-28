import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSearch, Loader2, Plus, RefreshCw, Trash2, Check, ExternalLink, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/core/ui/dialog';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import {
  pageWatchService,
  PAGE_WATCH_CATEGORY_LABELS,
  PAGE_WATCH_SCHEDULES,
  type PageWatch,
  type PageWatchCategory,
  type PageWatchChange,
} from '@/services/pageWatchService';

/**
 * Page monitoring (#331) — watch pages that are not product pages.
 *
 * Deliberately separate from price monitoring. There is no discovery here and no
 * identity to classify: the operator names one URL and we report when it changes.
 * The whole value is the diff, so the diff is the thing the UI puts on screen —
 * not a status pill saying something happened.
 */

/** Plain coloured words, never a filled pill — per the design system's table rule. */
const STATUS_TONE: Record<string, string> = {
  changed: 'text-amber-600 dark:text-amber-400',
  new: 'text-emerald-600 dark:text-emerald-400',
  removed: 'text-rose-600 dark:text-rose-400',
  error: 'text-rose-600 dark:text-rose-400',
  same: 'text-muted-foreground',
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

function relative(iso: string | null): string {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const EMPTY_FORM = {
  name: '',
  url: '',
  category: 'supplier_terms' as PageWatchCategory,
  goal: '',
  schedule_text: 'every day at 09:00',
};

export default function PageWatchesPage() {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();

  const [watches, setWatches] = useState<PageWatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<{ watch: PageWatch; changes: PageWatchChange[] } | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    try {
      setWatches(await pageWatchService.list(activeWorkspaceId));
    } catch (e) {
      toast({
        title: 'Could not load watched pages',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally { setLoading(false); }
  }, [activeWorkspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const pendingTotal = useMemo(
    () => watches.reduce((n, w) => n + (w.unacknowledged_changes ?? 0), 0),
    [watches],
  );

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
        description: 'Firecrawl takes a baseline snapshot within a minute or two; after that you hear about changes only.',
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

  async function acknowledge(changeId: string) {
    if (!activeWorkspaceId || !open) return;
    await pageWatchService.acknowledge(activeWorkspaceId, changeId);
    setOpen({
      ...open,
      changes: open.changes.map((c) =>
        c.id === changeId ? { ...c, acknowledged_at: new Date().toISOString() } : c),
    });
    void load();
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <SectionHeader
        icon={FileSearch}
        title="Page monitoring"
        subtitle="Watch the pages that quietly change under you — supplier terms, regulatory notices, partner API docs, competitor pages. You get the diff, not just a nudge."
      />

      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Watched pages</CardTitle>
            <p className="text-xs text-muted-foreground">
              {pendingTotal > 0
                ? `${pendingTotal} change${pendingTotal === 1 ? '' : 's'} waiting to be reviewed.`
                : 'Every detected change has been reviewed.'}
            </p>
          </div>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" /> Watch a page
          </Button>
        </CardHeader>

        <CardContent className={watches.length ? 'p-0' : undefined}>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : watches.length === 0 ? (
            <div className="flex items-start gap-2 py-10 px-4 text-sm text-muted-foreground">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              Nothing is being watched yet. Add a supplier&apos;s terms page or a regulatory
              notice and you will hear about it the day it changes.
            </div>
          ) : (
            <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left font-medium px-4 py-2">Page</th>
                  <th className="text-left font-medium px-4 py-2">Kind</th>
                  <th className="text-left font-medium px-4 py-2">Last checked</th>
                  <th className="text-left font-medium px-4 py-2">State</th>
                  <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {watches.map((w) => (
                  <tr key={w.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        className="text-left font-medium hover:underline"
                        onClick={() => void openChanges(w)}
                      >
                        {w.name}
                      </button>
                      <a
                        href={w.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                      >
                        {w.url.replace(/^https:\/\//, '').slice(0, 60)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {PAGE_WATCH_CATEGORY_LABELS[w.category]}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{relative(w.last_check_at)}</td>
                    <td className="px-4 py-2">
                      {!w.is_active ? (
                        <span className="text-muted-foreground">paused</span>
                      ) : w.cache_status === 'failed' ? (
                        // A failed check is NOT "no change" — the distinction the
                        // cache_status column exists to preserve.
                        <span className="text-rose-600 dark:text-rose-400" title={w.last_error ?? undefined}>
                          check failed
                        </span>
                      ) : (w.unacknowledged_changes ?? 0) > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          {w.unacknowledged_changes} to review
                        </span>
                      ) : (
                        <span className="text-muted-foreground">up to date</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm" variant="ghost" className="h-8"
                          disabled={busyId === w.id}
                          onClick={() => void act(w.id, () => pageWatchService.run(activeWorkspaceId!, w.id), 'Check started')}
                          title="Check now (uses one Firecrawl credit)"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${busyId === w.id ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="h-8"
                          disabled={busyId === w.id}
                          onClick={() => void act(
                            w.id,
                            () => pageWatchService.update(activeWorkspaceId!, w.id, { is_active: !w.is_active }),
                            w.is_active ? 'Watch paused' : 'Watch resumed',
                          )}
                        >
                          {w.is_active ? 'Pause' : 'Resume'}
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="h-8 text-destructive"
                          disabled={busyId === w.id}
                          onClick={() => void act(w.id, () => pageWatchService.remove(activeWorkspaceId!, w.id), 'Watch removed')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Add ── */}
      <Dialog open={adding} onOpenChange={(o) => { if (!o) { setAdding(false); setForm(EMPTY_FORM); } }}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader><DialogTitle>Watch a page</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw-name">What is it</Label>
              <Input
                id="pw-name" value={form.name} placeholder="Acme Tiles — payment terms"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw-url">Page URL</Label>
              <Input
                id="pw-url" type="url" value={form.url} placeholder="https://supplier.example.com/terms"
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Must be https.</p>
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw-goal">What counts as a change worth hearing about?</Label>
              <Textarea
                id="pw-goal" rows={2} value={form.goal}
                placeholder="Payment terms, minimum order quantity or lead times changing. Ignore typos and layout."
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Optional. Describing this turns on the change judge, which labels each diff as
                meaningful or not — one extra credit per changed page. You still see every change either way.
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
              <p className="text-xs text-muted-foreground">One credit per check.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              disabled={saving || !form.name.trim() || !form.url.trim()}
              onClick={() => void submit()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Start watching
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Change history ── */}
      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className="sm:max-w-[820px] max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{open?.watch.name}</DialogTitle></DialogHeader>
          {open && open.changes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">
              No checks have reported back yet.
            </p>
          ) : (
            <div className="space-y-4">
              {open?.changes.map((c) => (
                <div key={c.id} className="border-b pb-4 last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <span className={STATUS_TONE[c.status] ?? 'text-muted-foreground'}>{c.status}</span>
                      <span className="text-muted-foreground"> · {relative(c.detected_at)}</span>
                      {c.is_meaningful === false && (
                        <span className="text-muted-foreground"> · judged not meaningful</span>
                      )}
                      {c.is_meaningful === true && (
                        <span className="text-amber-600 dark:text-amber-400"> · judged meaningful</span>
                      )}
                      {c.judge_confidence && (
                        <span className="text-muted-foreground"> ({c.judge_confidence} confidence)</span>
                      )}
                    </div>
                    {c.acknowledged_at ? (
                      <span className="text-xs text-muted-foreground">reviewed</span>
                    ) : (
                      <Button
                        size="sm" variant="outline" className="h-8"
                        onClick={() => void acknowledge(c.id)}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" /> Mark reviewed
                      </Button>
                    )}
                  </div>
                  {c.judge_reason && <p className="text-sm mt-1">{c.judge_reason}</p>}
                  {meaningfulChanges(c).map((m, i) => (
                    // The judge's structured before/after. This is what an operator
                    // reads first — "30 days → 14 days" — with the unified diff below
                    // as the evidence.
                    <p key={i} className="text-xs mt-1 text-muted-foreground">
                      <span className="text-foreground">{m.before || '—'}</span>
                      {' → '}
                      <span className="text-foreground">{m.after || '—'}</span>
                      {m.reason ? ` · ${m.reason}` : ''}
                    </p>
                  ))}
                  {c.error && <p className="text-sm mt-1 text-rose-600 dark:text-rose-400">{c.error}</p>}
                  {c.diff_text && (
                    // The diff is the product. Rendered as text in a <pre>, never as HTML —
                    // this is scraped third-party content (invariant 11).
                    <pre className="mt-2 text-xs bg-muted/40 rounded-md p-3 overflow-x-auto whitespace-pre-wrap max-h-64">
                      {c.diff_text.slice(0, 8000)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
