import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Plus, LayoutTemplate, Layers, Sparkles, Trash2, Pencil, Copy, Eye, ChevronLeft } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';
import { blueprintsService, type Blueprint } from '@/services/blueprintsService';

/**
 * Rail values. The axis is the blueprint's SOURCE — yours vs the platform's — because that is the
 * only stable one this record has. `project_type` looks like the obvious grouping and is not: it is
 * free text (PlanTab writes the plan's own title into it), so a rail built from it would be a
 * different rail in every workspace and would rename itself whenever someone renamed a plan.
 *
 * `status: 'archived'` is deliberately NOT a tab either. Nothing in the UI ever sets it — `remove()`
 * is a hard delete — so the tab would be permanently empty, which is the inert-UI shape the nav
 * guard exists to prevent elsewhere. Give it a tab when something can actually archive.
 */
const ALL_TAB = 'all';
const MINE_TAB = 'mine';
const STARTERS_TAB = 'starters';

/**
 * The rail, as a catalog rather than three hand-written triggers. Order here is the order rendered.
 * The literal `value:` strings also let deepLinkTargets.test.ts resolve `/blueprints?tab=mine`
 * against this page — it reads panes out of the source, and a value it can only reach through a
 * `const` is a value it reports as "renders no tabs at all".
 */
type BlueprintTab = typeof MINE_TAB | typeof ALL_TAB | typeof STARTERS_TAB;

const BLUEPRINT_TABS = [
  { value: 'mine', label: 'My Blueprints', icon: LayoutTemplate },
  { value: 'all', label: 'All', icon: Layers },
  { value: 'starters', label: 'Starters', icon: Sparkles },
] as const satisfies readonly { value: BlueprintTab; label: string; icon: LucideIcon }[];

const TAB_VALUES: string[] = BLUEPRINT_TABS.map((t) => t.value);

/**
 * Blueprint Library — workspace-owned reusable scope-of-works templates +
 * platform starters. Create, edit (→ editor page), duplicate a starter into your
 * workspace, delete. Importing into a project happens from the project Plan tab.
 *
 * Same three-column idiom as /templates: create verb and source filter in a left rail, content on
 * the right. The two lived as a top-bar button and a pair of scrolling headings before.
 */
export const BlueprintLibraryPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const workspaceId = getActiveWorkspaceId(user?.id);

  const [loading, setLoading] = useState(true);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBlueprints(await blueprintsService.list({ includeStarters: true }));
    } catch (e) {
      toast({ title: 'Failed to load blueprints', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Import-after-signup: the public /tools/project-plan estimator stashes a chosen
  // starter + dimensions in localStorage; once the now-logged-in user lands here
  // with an active workspace, materialize it as an editable blueprint (once).
  useEffect(() => {
    const raw = (() => { try { return localStorage.getItem('mk_pending_blueprint'); } catch { return null; } })();
    if (!raw || !workspaceId) return;
    let pending: { starter_id?: string; title?: string; dimensions?: Record<string, number>; dimensions_schema?: any[]; items?: any[]; source_currency?: string };
    try { pending = JSON.parse(raw); } catch { localStorage.removeItem('mk_pending_blueprint'); return; }
    localStorage.removeItem('mk_pending_blueprint'); // consume once (guards double-invoke)
    if (!pending?.starter_id && !pending?.items?.length) return;
    (async () => {
      try {
        // If the user edited the plan on the public tool, recreate exactly what they
        // built; otherwise duplicate the starter with their entered measurements.
        const bp = pending.items?.length
          ? await blueprintsService.createFromItems({ workspace_id: workspaceId, title: pending.title || 'Imported plan', source_currency: pending.source_currency, dimensions_schema: pending.dimensions_schema, items: pending.items })
          : await blueprintsService.duplicate(pending.starter_id!, workspaceId, { title: pending.title, dimensionValues: pending.dimensions });
        toast({ title: 'Imported your plan', description: 'Your saved estimate is now an editable blueprint.' });
        navigate(`/blueprints/${bp.id}`);
      } catch (e) {
        toast({ title: 'Could not import your saved plan', description: String((e as Error)?.message ?? e), variant: 'destructive' });
      }
    })();
  }, [workspaceId, navigate, toast]);

  const own = useMemo(() => blueprints.filter((b) => !b.is_platform_starter), [blueprints]);
  const starters = useMemo(() => blueprints.filter((b) => b.is_platform_starter), [blueprints]);

  // Rail selection is URL-driven so the App Launcher can deep-link a sub-area, and so an unknown
  // value falls back to All rather than selecting no tab and painting an empty body.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = TAB_VALUES.includes(tabParam ?? '') ? tabParam! : ALL_TAB;
  const setTab = (v: string) => {
    const p = new URLSearchParams(searchParams);
    if (v === ALL_TAB) p.delete('tab'); else p.set('tab', v);
    setSearchParams(p, { replace: true });
  };

  const createBlueprint = async () => {
    if (!workspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    if (!title.trim()) return;
    setBusy(true);
    try {
      const bp = await blueprintsService.create({ workspace_id: workspaceId, title: title.trim() });
      setCreateOpen(false); setTitle('');
      navigate(`/blueprints/${bp.id}`);
    } catch (e) {
      toast({ title: 'Create failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const duplicateStarter = async (starter: Blueprint) => {
    if (!workspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const bp = await blueprintsService.duplicate(starter.id, workspaceId);
      toast({ title: 'Copied to your library' });
      navigate(`/blueprints/${bp.id}`);
    } catch (e) {
      toast({ title: 'Copy failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const remove = async (bp: Blueprint) => {
    if (!confirm(`Delete blueprint "${bp.title}"?`)) return;
    try {
      await blueprintsService.remove(bp.id);
      setBlueprints((prev) => prev.filter((b) => b.id !== bp.id));
    } catch (e) {
      toast({ title: 'Delete failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    }
  };

  const Tile = ({ b }: { b: Blueprint }) => (
    <Card className="dashboard-card">
      <CardContent className="p-4 flex flex-col gap-2 h-full">
        <div className="flex items-start gap-2">
          <LayoutTemplate className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium flex items-center gap-2">
              <span className="truncate">{b.title}</span>
              {b.is_platform_starter && <Badge variant="outline" className="text-[10px] h-4">Starter</Badge>}
            </div>
            {b.description && <div className="text-xs text-muted-foreground line-clamp-2">{b.description}</div>}
          </div>
        </div>
        <div className="mt-auto pt-2 flex items-center gap-2">
          {b.is_platform_starter ? (
            <>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => navigate(`/blueprints/${b.id}`)}>
                <Eye className="h-3.5 w-3.5 mr-1" /> View
              </Button>
              <Button variant="outline" size="sm" className="rounded-full" disabled={busy} onClick={() => duplicateStarter(b)}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copy to my library
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => navigate(`/blueprints/${b.id}`)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto" onClick={() => remove(b)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );

  /*
    One panel body, built from the active tab and handed to whichever <TabsContent> Radix mounts —
    not rebuilt per rail entry. Nothing refetches on a tab switch: `list()` loads once and the rail
    re-filters what is already in memory.
  */
  const emptyOwn = (
    <Card className="dashboard-card"><CardContent className="p-8 text-center text-sm text-muted-foreground">
      No blueprints yet. Create one with <span className="font-medium">Add New</span>, or copy a starter.
    </CardContent></Card>
  );

  const grid = (list: Blueprint[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{list.map((b) => <Tile key={b.id} b={b} />)}</div>
  );

  const panel = loading ? (
    <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  ) : (
    <>
      <SectionHeader
        icon={activeTab === STARTERS_TAB ? Sparkles : activeTab === MINE_TAB ? LayoutTemplate : Layers}
        title={activeTab === STARTERS_TAB ? 'Starter blueprints' : activeTab === MINE_TAB ? 'My blueprints' : 'All blueprints'}
        subtitle={activeTab === STARTERS_TAB
          ? 'Platform-built scopes. Copy one into your library to edit it.'
          : activeTab === MINE_TAB
            ? 'Everything this workspace built or copied.'
            : 'Everything in this workspace, plus the platform starters you can copy and edit.'}
      />
      {activeTab === MINE_TAB && (own.length === 0 ? emptyOwn : grid(own))}
      {activeTab === STARTERS_TAB && grid(starters)}
      {activeTab === ALL_TAB && (
        <div className="space-y-6">
          <section className="space-y-2">
            <div className="text-sm font-medium">Your blueprints</div>
            {own.length === 0 ? emptyOwn : grid(own)}
          </section>
          {starters.length > 0 && (
            <section className="space-y-2">
              <div className="text-sm font-medium flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Starter blueprints</div>
              {grid(starters)}
            </section>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={LayoutTemplate}
        title="Blueprints"
        subtitle="Reusable scope-of-works templates. Build once, reuse on every project."
        actions={
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => navigate('/projects')}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Projects
          </Button>
        }
      />

      <main className="px-4 sm:px-6 py-6">
        <Tabs
          value={activeTab}
          onValueChange={setTab}
          orientation="vertical"
          className="flex flex-col gap-4 lg:flex-row lg:items-start"
        >
          {/* Left column: create first, then the source filter — the /templates layout. */}
          <div className="w-full shrink-0 space-y-2 lg:w-56">
            <Button size="sm" className="w-full gap-1.5 rounded-full" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Add New
            </Button>

            <TabsList className="finance-tabs-list flex h-auto w-full flex-row flex-wrap gap-1 bg-transparent p-0 lg:flex-col lg:flex-nowrap">
              {BLUEPRINT_TABS.map((t) => {
                const count = t.value === MINE_TAB ? own.length : t.value === STARTERS_TAB ? starters.length : blueprints.length;
                return (
                  <React.Fragment key={t.value}>
                    {t.value === ALL_TAB && (
                      /* A plain <div> child: `.finance-tabs-list > div` hides it below lg, where a
                         rule inside a horizontal chip strip would just be noise. */
                      <div className="my-1 h-px w-full bg-border" aria-hidden="true" />
                    )}
                    <TabsTrigger value={t.value} className="w-full justify-start">
                      <t.icon className="h-4 w-4 mr-2 shrink-0" />
                      <span className="truncate">{t.label}</span>
                      {count > 0 && <span className="ml-auto pl-2 text-xs tabular-nums opacity-70">{count}</span>}
                    </TabsTrigger>
                  </React.Fragment>
                );
              })}
            </TabsList>
          </div>

          <div className="min-w-0 flex-1">
            {TAB_VALUES.map((v) => (
              <TabsContent key={v} value={v} className="mt-0">
                {panel}
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Blueprint</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bathroom Renovation" autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') createBlueprint(); }} />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button className="rounded-full" disabled={busy || !title.trim()} onClick={createBlueprint}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BlueprintLibraryPage;
