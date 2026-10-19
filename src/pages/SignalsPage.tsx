import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bell, BellOff, ExternalLink, Loader2, Pause, Pencil, Play, Plus, Radar, Search, Trash2, X,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Checkbox } from '@/components/core/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/core/ui/alert-dialog';
import {
  HubDataTable, HubEmptyState, HubFilterSelect, HubStatGrid, HubStatTile, HubToolbar,
  type HubColumn,
} from '@/components/core/hub';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { ModuleTabGate } from '@/components/core/ModuleTabGate';
import { SignalEditorDialog, type SignalDraft } from '@/components/signals/SignalEditorDialog';
import { SignalValuePicker } from '@/components/signals/SignalValuePicker';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { timeAgo } from '@/utils/datetime';
import { safeHref } from '@/utils/safeUrl';
import {
  describeSignalPayload, signalsService, SIGNAL_FILTER_KEY, SIGNAL_KIND_LABEL, SIGNAL_KIND_MODULE,
  type CorpusCoverage, type SavedSignal, type SignalCandidate, type SignalKind, type SignalMatch,
  type SignalSearchResult, type SignalsDictionary,
} from '@/services/signalsService';

type TabId = 'matches' | 'saved' | 'explore';
const KINDS: SignalKind[] = ['hiring', 'technology', 'intent'];

function SourceLink({ url }: { url: string | null }) {
  const href = safeHref(url, '');
  if (!href) return <span className="text-muted-foreground">—</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      onClick={(e) => e.stopPropagation()}>
      Open <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function watching(s: SavedSignal): string {
  return (s.filter?.[SIGNAL_FILTER_KEY[s.kind]] ?? []).join(', ');
}

export default function SignalsPage() {
  const { activeWorkspaceId } = useWorkspace();
  const { isModuleAvailable, loading: entLoading } = useEntitlements();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();

  const availableKinds = useMemo(
    () => KINDS.filter((k) => isModuleAvailable(SIGNAL_KIND_MODULE[k])),
    [isModuleAvailable],
  );
  const tab = (['matches', 'saved', 'explore'].includes(params.get('tab') ?? '') ? params.get('tab') : 'matches') as TabId;
  const signalFilter = params.get('signal') ?? 'all';

  const [coverage, setCoverage] = useState<CorpusCoverage | null>(null);
  const [dictionary, setDictionary] = useState<SignalsDictionary | null>(null);
  const [signals, setSignals] = useState<SavedSignal[]>([]);
  const [matches, setMatches] = useState<SignalMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; initial: SignalDraft | SavedSignal | null }>({ open: false, initial: null });
  const [deleting, setDeleting] = useState<SavedSignal | null>(null);

  const [exploreKind, setExploreKind] = useState<SignalKind>('hiring');
  const [exploreValues, setExploreValues] = useState<string[]>([]);
  const [exploreDays, setExploreDays] = useState('30');
  const [exploreCrmOnly, setExploreCrmOnly] = useState(false);
  const [exploreResult, setExploreResult] = useState<SignalSearchResult | null>(null);
  const [exploring, setExploring] = useState(false);

  useEffect(() => {
    const k = params.get('kind') as SignalKind | null;
    if (k && availableKinds.includes(k)) setExploreKind(k);
    else if (availableKinds.length && !availableKinds.includes(exploreKind)) setExploreKind(availableKinds[0]);
  }, [availableKinds, params, exploreKind]);

  const setTab = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', id);
    setParams(next, { replace: true });
  };
  const setSignalFilter = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === 'all') next.delete('signal'); else next.set('signal', id);
    setParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [sig, mat, cov, dict] = await Promise.all([
        signalsService.list(activeWorkspaceId),
        signalsService.matches(activeWorkspaceId),
        supabase.rpc('signals_corpus_coverage' as never),
        signalsService.dictionary(),
      ]);
      setSignals(sig);
      setMatches(mat);
      setCoverage((cov.data ?? null) as unknown as CorpusCoverage | null);
      setDictionary(dict);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => { if (!entLoading && availableKinds.length) void load(); }, [entLoading, availableKinds.length, load]);

  const signalById = useMemo(() => new Map(signals.map((s) => [s.id, s])), [signals]);
  const visibleMatches = useMemo(
    () => (signalFilter === 'all' ? matches : matches.filter((m) => m.signal_id === signalFilter)),
    [matches, signalFilter],
  );

  const dismiss = async (m: SignalMatch) => {
    if (!activeWorkspaceId) return;
    try {
      await signalsService.dismissMatch(activeWorkspaceId, m.id);
      setMatches((prev) => prev.filter((x) => x.id !== m.id));
    } catch (e) {
      toast({ title: 'Could not dismiss', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const toggleSignal = async (s: SavedSignal, patch: { isActive?: boolean; notify?: boolean }) => {
    if (!activeWorkspaceId) return;
    try {
      await signalsService.save(activeWorkspaceId, {
        id: s.id, kind: s.kind, name: s.name, filter: s.filter,
        isActive: patch.isActive ?? s.is_active, notify: patch.notify ?? s.notify,
      });
      await load();
    } catch (e) {
      toast({ title: 'Could not update the signal', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!activeWorkspaceId || !deleting) return;
    try {
      await signalsService.remove(activeWorkspaceId, deleting.id);
      toast({ title: 'Signal deleted' });
      setDeleting(null);
      await load();
    } catch (e) {
      toast({ title: 'Could not delete', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const runExplore = async () => {
    if (!activeWorkspaceId || exploreValues.length === 0) return;
    setExploring(true);
    try {
      const result = await signalsService.search(activeWorkspaceId, exploreKind,
        { [SIGNAL_FILTER_KEY[exploreKind]]: exploreValues, crm_only: exploreCrmOnly }, Number(exploreDays), 200);
      setExploreResult(result);
    } catch (e) {
      toast({ title: 'Search failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setExploring(false);
    }
  };

  const matchColumns: HubColumn<SignalMatch>[] = [
    { id: 'company', header: 'Company', cell: (m) => (
      <div className="min-w-0"><div className="font-medium">{(m.payload.company_name as string) || m.company_domain}</div>
        <div className="text-xs text-muted-foreground">{m.company_domain}</div></div>) },
    { id: 'what', header: 'Signal', cell: (m) => {
      const d = describeSignalPayload(m.payload);
      return <div className="min-w-0"><div>{d.what}</div>{d.detail ? <div className="line-clamp-2 text-xs text-muted-foreground">{d.detail}</div> : null}</div>;
    } },
    { id: 'saved', header: 'Saved signal', hideBelow: 'md', cell: (m) => signalById.get(m.signal_id)?.name ?? '—' },
    { id: 'matched', header: 'Matched', hideBelow: 'sm', cell: (m) => timeAgo(m.matched_at) },
    { id: 'source', header: 'Source', cell: (m) => <SourceLink url={describeSignalPayload(m.payload).url} /> },
    { id: 'dismiss', header: '', align: 'right', cell: (m) => (
      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); void dismiss(m); }} aria-label="Dismiss match">
        <X className="h-4 w-4" />
      </Button>) },
  ];

  const signalColumns: HubColumn<SavedSignal>[] = [
    { id: 'name', header: 'Name', cell: (s) => <span className="font-medium">{s.name}</span> },
    { id: 'kind', header: 'Kind', cell: (s) => <Badge variant="neutral">{SIGNAL_KIND_LABEL[s.kind]}</Badge> },
    { id: 'watching', header: 'Watching', hideBelow: 'md', cell: (s) => <span className="line-clamp-1 text-muted-foreground">{watching(s) || '—'}</span> },
    { id: 'status', header: 'Status', cell: (s) => (
      <Badge variant={s.is_active ? 'success' : 'warning'}>{s.is_active ? 'Watching' : 'Paused'}</Badge>) },
    { id: 'checked', header: 'Last checked', hideBelow: 'sm', cell: (s) => (s.last_evaluated_at ? timeAgo(s.last_evaluated_at) : 'Within the hour') },
    { id: 'actions', header: '', align: 'right', cell: (s) => (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" aria-label={s.notify ? 'Mute alerts' : 'Turn on alerts'}
          onClick={(e) => { e.stopPropagation(); void toggleSignal(s, { notify: !s.notify }); }}>
          {s.notify ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="sm" aria-label={s.is_active ? 'Pause' : 'Resume'}
          onClick={(e) => { e.stopPropagation(); void toggleSignal(s, { isActive: !s.is_active }); }}>
          {s.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="sm" aria-label="Edit" onClick={(e) => { e.stopPropagation(); setEditor({ open: true, initial: s }); }}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" aria-label="Delete" onClick={(e) => { e.stopPropagation(); setDeleting(s); }}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>) },
  ];

  const exploreColumns: HubColumn<SignalCandidate>[] = [
    { id: 'company', header: 'Company', cell: (c) => (
      <div className="min-w-0"><div className="font-medium">{c.company_name || c.company_domain}</div>
        <div className="text-xs text-muted-foreground">{c.company_domain}</div></div>) },
    { id: 'what', header: 'Signal', cell: (c) => {
      const d = describeSignalPayload(c.payload);
      return <div className="min-w-0"><div>{d.what}</div>{d.detail ? <div className="line-clamp-2 text-xs text-muted-foreground">{d.detail}</div> : null}</div>;
    } },
    { id: 'seen', header: 'First seen', hideBelow: 'sm', cell: (c) => timeAgo(c.observed_at) },
    { id: 'source', header: 'Source', cell: (c) => <SourceLink url={describeSignalPayload(c.payload).url} /> },
  ];

  const newSignal = availableKinds.length ? (
    <Button onClick={() => setEditor({ open: true, initial: null })}><Plus className="mr-2 h-4 w-4" />New signal</Button>
  ) : null;
  const header = (
    <PageHeader icon={Radar} title="Signals"
      subtitle="Companies that start hiring, adopt a technology or show buying intent — read from their own job boards and websites."
      breadcrumbs={[{ label: 'Tools', to: '/tools' }, { label: 'Signals' }]}
      actions={newSignal} />
  );

  if (entLoading) return <>{header}</>;

  if (!availableKinds.length) {
    return (
      <>
        {header}
        <div className="space-y-6 p-4 sm:p-6">
          <ModuleTabGate moduleSlug="signals-hiring" moduleName="Hiring Signals"
            blurb="Watch the market: who starts hiring for a role, who runs or adopts a technology, who is in market for a use case.">
            <span />
          </ModuleTabGate>
        </div>
      </>
    );
  }

  const coverageHelp = 'Companies come from the CRM websites of every workspace and are re-read monthly. Only companies with a public job board contribute hiring and intent signals.';

  return (
    <>
      {header}
      <div className="space-y-6 p-4 sm:p-6">
        <HubStatGrid>
          <HubStatTile label="Companies tracked" value={coverage ? coverage.companies.toLocaleString() : '—'} help={coverageHelp} />
          <HubStatTile label="Websites read" value={coverage ? coverage.companies_checked.toLocaleString() : '—'}
            help="Homepages and careers pages read so far. The rest are queued." />
          <HubStatTile label="With a readable job board" value={coverage ? coverage.companies_with_board.toLocaleString() : '—'}
            help="Greenhouse, Lever, Ashby, Workable or Teamtailor boards, read daily." />
          <HubStatTile label="Open postings" value={coverage ? coverage.open_postings.toLocaleString() : '—'}
            help={coverage?.last_enumerated_at ? `Last board read ${timeAgo(coverage.last_enumerated_at)}.` : 'Boards are read daily; the first read is still queued.'} />
        </HubStatGrid>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList aria-label="Signals sections">
          <TabsTrigger value="matches">Matches{matches.length ? ` (${matches.length})` : ''}</TabsTrigger>
          <TabsTrigger value="saved">Saved signals{signals.length ? ` (${signals.length})` : ''}</TabsTrigger>
          <TabsTrigger value="explore">Explore</TabsTrigger>
        </TabsList>

        {loadError ? (
          <Card><CardContent className="p-0">
            <HubEmptyState icon={Radar} title="Could not load signals" description={loadError}
              action={<Button variant="outline" onClick={() => void load()}>Try again</Button>} />
          </CardContent></Card>
        ) : null}

        <TabsContent value="matches">
        {!loadError ? (
          <div className="overflow-hidden rounded-md border border-hairline bg-card">
            <HubToolbar filters={signals.length > 1 ? (
              <HubFilterSelect label="Signal" value={signalFilter} onChange={setSignalFilter}
                options={[{ value: 'all', label: 'All signals' }, ...signals.map((s) => ({ value: s.id, label: s.name }))]} />
            ) : undefined} />
            <HubDataTable rows={visibleMatches} columns={matchColumns} rowId={(m) => m.id} loading={loading}
              className="rounded-none border-0"
              empty={signals.length === 0 ? (
                <HubEmptyState icon={Radar} title="No signals yet"
                  description="Save a signal and every new company that matches it lands here."
                  action={newSignal} />
              ) : signalFilter !== 'all' ? (
                <HubEmptyState variant="filtered" icon={Radar} title="This signal has no open matches"
                  action={<Button variant="outline" onClick={() => setSignalFilter('all')}>Show all signals</Button>} />
              ) : (
                <HubEmptyState icon={Radar} title="No new matches"
                  description={`Your signals are checked every hour against ${coverage?.companies_checked ?? 0} companies read so far.`}
                  action={<Button variant="outline" onClick={() => setTab('explore')}>Explore the corpus</Button>} />
              )} />
          </div>
        ) : null}
        </TabsContent>

        <TabsContent value="saved">
        {!loadError ? (
          <div className="overflow-hidden rounded-md border border-hairline bg-card">
            <HubDataTable rows={signals} columns={signalColumns} rowId={(s) => s.id} loading={loading}
              className="rounded-none border-0"
              onRowClick={(s) => { setSignalFilter(s.id); setTab('matches'); }}
              empty={<HubEmptyState icon={Radar} title="No saved signals"
                description="A signal keeps watching the market for you and notifies you on new matches." action={newSignal} />} />
          </div>
        ) : null}
        </TabsContent>

        <TabsContent value="explore">
        {!loadError ? (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Search the corpus</CardTitle>
                <CardDescription>Run a one-off search, then save it as a signal to keep watching.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={exploreKind} onValueChange={(v) => { setExploreKind(v as SignalKind); setExploreValues([]); setExploreResult(null); }}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>{availableKinds.map((k) => <SelectItem key={k} value={k}>{SIGNAL_KIND_LABEL[k]}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={exploreDays} onValueChange={setExploreDays}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">Last 30 days</SelectItem>
                      <SelectItem value="90">Last 90 days</SelectItem>
                      <SelectItem value="365">Last year</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={exploreCrmOnly} onCheckedChange={(v) => setExploreCrmOnly(v === true)} />
                    Only my CRM
                  </label>
                </div>
                <SignalValuePicker kind={exploreKind} dictionary={dictionary} value={exploreValues} onChange={setExploreValues} />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void runExplore()} disabled={exploring || exploreValues.length === 0}>
                    {exploring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Search
                  </Button>
                  <Button variant="secondary" disabled={exploreValues.length === 0}
                    onClick={() => setEditor({ open: true, initial: {
                      kind: exploreKind, name: '',
                      filter: { [SIGNAL_FILTER_KEY[exploreKind]]: exploreValues, crm_only: exploreCrmOnly },
                    } })}>
                    Save as signal
                  </Button>
                </div>
              </CardContent>
            </Card>

            {exploreResult ? (
              <div className="overflow-hidden rounded-md border border-hairline bg-card">
                <HubDataTable rows={exploreResult.results} columns={exploreColumns} rowId={(c) => c.match_key}
                  className="rounded-none border-0"
                  empty={<HubEmptyState variant="filtered" icon={Radar}
                    title={exploreResult.status === 'not_collected' ? 'Nothing has been read yet' : 'No company matched'}
                    description={exploreResult.status === 'not_collected'
                      ? 'The corpus is still being built. Company websites are read hourly.'
                      : `Searched ${exploreResult.coverage.companies_checked} companies read so far, ${exploreResult.coverage.companies_with_board} with a readable job board. Widen the period or the terms.`}
                    action={<Button variant="outline" onClick={() => setExploreDays('365')}>Search the last year</Button>} />} />
              </div>
            ) : null}
          </div>
        ) : null}
        </TabsContent>
        </Tabs>
      </div>

      {activeWorkspaceId ? (
        <SignalEditorDialog open={editor.open} onOpenChange={(open) => setEditor((p) => ({ ...p, open }))}
          workspaceId={activeWorkspaceId} availableKinds={availableKinds} dictionary={dictionary}
          initial={editor.initial} onSaved={() => void load()} />
      ) : null}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this signal?</AlertDialogTitle>
            <AlertDialogDescription>“{deleting?.name}” and all of its matches are removed. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
