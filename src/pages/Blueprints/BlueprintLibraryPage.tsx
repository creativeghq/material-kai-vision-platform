import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Plus, LayoutTemplate, Sparkles, Trash2, Pencil, Copy, Eye, ChevronLeft } from 'lucide-react';
import { HubEmptyState } from '@/components/core/hub';

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
import { blueprintsService, type Blueprint, type BlueprintItem } from '@/services/blueprintsService';
import { blueprintIcon } from '@/components/features/blueprint/blueprintIcon';
import { BlueprintScope } from '@/components/features/blueprint/BlueprintScope';

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
const MINE_TAB = 'mine';

/**
 * The rail is "My Blueprints", then every starter BY NAME. There is deliberately no "All" or
 * "Starters" bucket above them: with the starters named individually, a bucket collecting the same
 * five rows was a click that led to a grid of what the rail already showed. The named entry IS the
 * way in.
 */
const BLUEPRINT_TABS = [
  { value: 'mine', label: 'My Blueprints', icon: LayoutTemplate },
] as const satisfies readonly { value: typeof MINE_TAB; label: string; icon: LucideIcon }[];

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
  const activeTab = MINE_TAB;
  const setTab = () => {
    // Selecting the only rail tab just clears any previewed blueprint.
    const p = new URLSearchParams(searchParams);
    p.delete('bp');
    p.delete('tab');
    setSearchParams(p, { replace: true });
  };

  /*
    A named rail entry selects one blueprint into the preview. It rides in `?bp=` rather than `?tab=`
    so the tab param keeps a small closed vocabulary the deep-link guard can check — an id is not a
    pane, and putting it in `?tab=` would make every future guard run report an unknown tab.
  */
  const selectedId = searchParams.get('bp');
  const selected = useMemo(() => blueprints.find((b) => b.id === selectedId) ?? null, [blueprints, selectedId]);
  const [preview, setPreview] = useState<BlueprintItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const selectBlueprint = (id: string) => {
    const p = new URLSearchParams(searchParams);
    p.set('bp', id);
    p.delete('tab');
    setSearchParams(p, { replace: true });
  };

  useEffect(() => {
    if (!selectedId) { setPreview([]); return; }
    let cancelled = false;
    setPreviewLoading(true);
    blueprintsService.listItems(selectedId)
      .then((its) => { if (!cancelled) setPreview(its); })
      .catch(() => { if (!cancelled) setPreview([]); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

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
          {React.createElement(blueprintIcon(b), { className: 'h-4 w-4 mt-0.5 text-muted-foreground shrink-0' })}
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
              <Button variant="outline" size="sm" onClick={() => navigate(`/blueprints/${b.id}`)}>
                <Eye className="h-3.5 w-3.5 mr-1" /> View
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => duplicateStarter(b)}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copy to my library
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate(`/blueprints/${b.id}`)}>
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
    <Card className="dashboard-card"><CardContent className="p-0">
      <HubEmptyState
        icon={LayoutTemplate}
        title="No blueprints yet"
        description="A blueprint turns a room into a priced plan — zones, module rows and rate tables, so a kitchen quote is derived rather than typed."
        action={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add new</Button>}
      />
    </CardContent></Card>
  );

  const grid = (list: Blueprint[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{list.map((b) => <Tile key={b.id} b={b} />)}</div>
  );

  /* Read-only preview of one blueprint: its sections and the tasks under each, with the copy verb
     at the TOP where the decision is made — you decide from the scope, not after scrolling it. */
  const previewPanel = selected && (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          icon={selected.is_platform_starter ? Sparkles : LayoutTemplate}
          title={selected.title}
          subtitle={selected.description || (selected.is_platform_starter
            ? 'A platform starter. Copy it into your library to edit it.'
            : 'Your blueprint.')}
        />
        <div className="flex shrink-0 items-center gap-2 pt-1">
          {selected.is_platform_starter ? (
            <Button size="sm" disabled={busy} onClick={() => duplicateStarter(selected)}>
              <Copy className="h-4 w-4 mr-1" /> Copy to my library
            </Button>
          ) : (
            <Button size="sm" onClick={() => navigate(`/blueprints/${selected.id}`)}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate(`/blueprints/${selected.id}`)}>
            <Eye className="h-4 w-4 mr-1" /> Open
          </Button>
        </div>
      </div>

      {previewLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        /* The editor's own screen, disabled — same component, `readOnly`. A preview that showed
           only section names and quantities hid the formulas, rates, margin and options, which are
           exactly what you weigh before copying a starter. */
        <BlueprintScope schema={selected.dimensions_schema ?? []} items={preview} readOnly />
      )}
    </>
  );

  const panel = loading ? (
    <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  ) : (
    <>
      <SectionHeader
        icon={LayoutTemplate}
        title="My blueprints"
        subtitle="Everything this workspace built or copied. Pick a starter from the rail to preview and copy one."
      />
      {own.length === 0 ? emptyOwn : grid(own)}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={LayoutTemplate}
        title="Blueprints"
        subtitle="Reusable scope-of-works templates. Build once, reuse on every project."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/projects')}>
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
            <Button size="sm" className="w-full gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Add New
            </Button>

            <TabsList className="finance-tabs-list flex h-auto w-full flex-row flex-wrap gap-1 bg-transparent p-0 lg:flex-col lg:flex-nowrap">
              {BLUEPRINT_TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="w-full justify-start">
                  <t.icon className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">{t.label}</span>
                  {own.length > 0 && <span className="ml-auto pl-2 text-xs tabular-nums opacity-70">{own.length}</span>}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Starters by NAME. Deliberately plain buttons rather than TabsTriggers: the rail
                selection they drive is `?bp=<id>`, not a tab pane, and a TabsTrigger whose value
                matched no TabsContent would leave Radix with nothing selected. */}
            {starters.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="px-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Starters
                </div>
                {starters.map((b) => {
                  const Icon = blueprintIcon(b);
                  return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => selectBlueprint(b.id)}
                    className={[
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      b.id === selectedId
                        ? 'bg-accent text-foreground font-medium'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    ].join(' ')}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="min-w-0 truncate">{b.title}</span>
                  </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {selected ? previewPanel : TAB_VALUES.map((v) => (
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
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={busy || !title.trim()} onClick={createBlueprint}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BlueprintLibraryPage;
