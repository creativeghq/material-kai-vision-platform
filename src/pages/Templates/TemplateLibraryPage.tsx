import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Copy, ExternalLink, Layers, LayoutTemplate, Loader2, Pencil, Play, Plus, Sparkles, Trash2 } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Input } from '@/components/core/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/core/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';
import { usePermissions } from '@/hooks/usePermissions';
import { useEntitlements } from '@/hooks/useEntitlements';
import { entityTemplatesService, type EntityTemplate } from '@/services/entityTemplatesService';
import { formatDate } from '@/utils/datetime';
import {
  EXTERNAL_TEMPLATE_SOURCES, LIVE_TEMPLATE_TYPES, TEMPLATE_ADAPTERS, getAdapter,
  type LiveTemplateEntityType,
} from '@/services/templates/registry';
import { HubEmptyState } from '@/components/core/hub';

/**
 * Rail values that are not an entity type.
 *
 * `?type=` doubles as the tab param rather than growing a second `?tab=` beside it — the App
 * Launcher already deep-links `/templates?type=invoice` (`config/launcher-sections.ts`), so the
 * types ARE the tabs. Neither value may collide with a `LIVE_TEMPLATE_TYPES` key.
 */
const ALL_TAB = 'all';
/** Everything this workspace saved itself — the starters are the other half of the library. */
const MINE_TAB = 'mine';
const LIBRARIES_TAB = 'libraries';

/**
 * Template Library (issue #322) — the one place that answers "what can I start from?".
 *
 * Generalizes what /blueprints does for scope-of-works to every record type: your saved templates
 * and the platform's starter examples, filtered by type, plus link-outs to the template systems
 * that already have their own manager (blueprints, email, WhatsApp, catalog designs…). Reached
 * from the App Launcher's "More" group.
 *
 * The type filter is a VERTICAL tab rail (the HR / Finance / Stock idiom), not a row of chips:
 * ten types plus the external libraries wrapped to two or three rows of buttons and pushed the
 * grid below the fold. Below `lg` the same list collapses into a horizontal scroll strip via
 * `.finance-tabs-list` in index.css.
 */
export const TemplateLibraryPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const workspaceId = getActiveWorkspaceId(user?.id);
  const { can } = usePermissions();
  const { isModuleAvailable } = useEntitlements();
  const [searchParams, setSearchParams] = useSearchParams();

  /**
   * Types this persona can actually act on. The adapters declare a `capability` / `moduleSlug`;
   * without this they were declared and ignored, so a member with no finance access still saw
   * Invoice templates and a "Use" button that lands on a page they cannot open — the inert-UI
   * shape `navReachability.test.ts` exists to prevent elsewhere.
   */
  const usableTypes = useMemo(
    () => LIVE_TEMPLATE_TYPES.filter((t) => {
      const a = TEMPLATE_ADAPTERS[t];
      if (a.capability && !can(a.capability)) return false;
      if (a.moduleSlug && !isModuleAvailable(a.moduleSlug)) return false;
      return true;
    }),
    [can, isModuleAvailable],
  );

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<EntityTemplate[]>([]);

  /**
   * The selected rail value, DERIVED from the URL rather than mirrored into state: `usableTypes`
   * is empty until permissions and entitlements resolve, and a deep-linked `?type=invoice` has to
   * land on Invoices once they do instead of being rewritten to All on the first render. A type
   * this persona cannot use — or any junk value — falls back to All, which also stops an unknown
   * param from selecting no tab at all and painting a blank page.
   */
  const typeParam = searchParams.get('type');
  const activeTab = useMemo(() => {
    if (typeParam === LIBRARIES_TAB || typeParam === MINE_TAB) return typeParam;
    if (typeParam && (usableTypes as readonly string[]).includes(typeParam)) return typeParam;
    return ALL_TAB;
  }, [typeParam, usableTypes]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates(await entityTemplatesService.list({ workspaceId }));
    } catch (e) {
      toast({ title: 'Failed to load templates', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, workspaceId]);

  useEffect(() => { load(); }, [load]);

  const listed = useMemo(
    () => templates.filter((t) => (usableTypes as readonly string[]).includes(t.entity_type)),
    [templates, usableTypes],
  );

  // Counted over the STARTERS only, because that is what a type tab now shows. A count that
  // includes rows the tab will not render is a number that argues with the screen.
  const countByType = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of listed) if (t.is_platform_starter) m.set(t.entity_type, (m.get(t.entity_type) ?? 0) + 1);
    return m;
  }, [listed]);
  const starterCount = useMemo(() => listed.filter((t) => t.is_platform_starter).length, [listed]);

  /*
    The rail is a SOURCE split first, a type split second. `mine` is everything this workspace saved,
    across all types; every other tab is the starter library, optionally narrowed to one type. Own
    templates used to be repeated under every type tab as well, which put the same card on screen
    twice and pushed the starters below the fold.
  */
  const visible = useMemo(() => {
    if (activeTab === MINE_TAB) return listed.filter((t) => !t.is_platform_starter);
    const catalogue = listed.filter((t) => t.is_platform_starter);
    if (activeTab === ALL_TAB || activeTab === LIBRARIES_TAB) return catalogue;
    return catalogue.filter((t) => t.entity_type === activeTab);
  }, [listed, activeTab]);
  const own = visible.filter((t) => !t.is_platform_starter);
  const starters = visible.filter((t) => t.is_platform_starter);

  const externalSources = useMemo(
    () => EXTERNAL_TEMPLATE_SOURCES.filter((x) => !x.moduleSlug || isModuleAvailable(x.moduleSlug)),
    [isModuleAvailable],
  );

  /** The rail's current entity type, or null when it is on All / Mine / Other libraries. */
  const activeAdapterType = (): LiveTemplateEntityType | null =>
    ((usableTypes as readonly string[]).includes(activeTab) ? activeTab as LiveTemplateEntityType : null);

  const setTab = (v: string) => {
    const p = new URLSearchParams(searchParams);
    if (v === ALL_TAB) p.delete('type'); else p.set('type', v);
    setSearchParams(p, { replace: true });
  };

  const use = async (tpl: EntityTemplate) => {
    if (!workspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    setBusyId(tpl.id);
    try {
      const result = await entityTemplatesService.apply(tpl.id, { workspaceId });
      if (result.message) toast({ title: result.message });
      navigate(result.route);
    } catch (e) {
      toast({ title: 'Could not use this template', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const copyToWorkspace = async (tpl: EntityTemplate) => {
    if (!workspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    setBusyId(tpl.id);
    try {
      const copy = await entityTemplatesService.duplicate(tpl.id, workspaceId);
      toast({ title: 'Copied to your templates' });
      navigate(`/templates/${copy.id}`);
    } catch (e) {
      toast({ title: 'Copy failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  /*
    Add New. Every template until now had to be born from an existing record ("Save as template"),
    which means you could not start one for a type you had no record of yet — a chicken-and-egg the
    empty state named but could not solve. This creates the row with an empty payload and opens the
    editor, where the adapter's `editableFields` are filled in. The type list is `usableTypes`, so
    it can never offer a type this persona could not then use.
  */
  const [creating, setCreating] = useState(false);
  const [newType, setNewType] = useState<string>('');
  const [newTitle, setNewTitle] = useState('');
  const [createBusy, setCreateBusy] = useState(false);

  const openCreate = () => {
    setNewType(activeAdapterType() ?? usableTypes[0] ?? '');
    setNewTitle('');
    setCreating(true);
  };

  const create = async () => {
    if (!workspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    if (!newType || !newTitle.trim()) { toast({ title: 'Pick a type and give it a name', variant: 'destructive' }); return; }
    setCreateBusy(true);
    try {
      const tpl = await entityTemplatesService.create({
        entityType: newType as LiveTemplateEntityType,
        workspaceId,
        title: newTitle.trim(),
      });
      setCreating(false);
      navigate(`/templates/${tpl.id}`);
    } catch (e) {
      toast({ title: 'Could not create the template', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setCreateBusy(false);
    }
  };

  const remove = async (tpl: EntityTemplate) => {
    if (!confirm(`Delete template "${tpl.title}"?`)) return;
    try {
      await entityTemplatesService.remove(tpl.id);
      setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
    } catch (e) {
      toast({ title: 'Delete failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    }
  };

  const Tile = ({ tpl }: { tpl: EntityTemplate }) => {
    const adapter = getAdapter(tpl.entity_type);
    if (!adapter) return null;
    const Icon = adapter.icon;
    let facts: string[] = [];
    try { facts = adapter.summary(tpl.payload as never); } catch { facts = []; }

    return (
      <Card className="dashboard-card">
        <CardContent className="p-4 flex flex-col gap-2 h-full">
          <div className="flex items-start gap-2">
            <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium flex items-center gap-2">
                <span className="truncate">{tpl.title}</span>
                {tpl.is_platform_starter && <Badge variant="outline" className="text-[10px] h-4">Starter</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">{adapter.label}</div>
              {tpl.description && <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{tpl.description}</div>}
            </div>
          </div>

          {facts.length > 0 && (
            <div className="text-xs text-muted-foreground">{facts.join(' · ')}</div>
          )}
          {tpl.usage_count > 0 && (
            <div className="text-[11px] text-muted-foreground">
              Used {tpl.usage_count} time{tpl.usage_count === 1 ? '' : 's'}
              {tpl.last_used_at && ` · last ${formatDate(tpl.last_used_at)}`}
            </div>
          )}

          <div className="mt-auto pt-2 flex items-center gap-2">
            <Button size="sm" className="rounded-full" disabled={busyId === tpl.id} onClick={() => use(tpl)}>
              {busyId === tpl.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
              Use
            </Button>
            {tpl.is_platform_starter ? (
              <Button variant="outline" size="sm" className="rounded-full" disabled={busyId === tpl.id} onClick={() => copyToWorkspace(tpl)}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copy to edit
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => navigate(`/templates/${tpl.id}`)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto" onClick={() => remove(tpl)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const activeAdapter = activeTab !== ALL_TAB && activeTab !== LIBRARIES_TAB && activeTab !== MINE_TAB
    ? TEMPLATE_ADAPTERS[activeTab as LiveTemplateEntityType]
    : null;
  const mineCount = useMemo(() => listed.filter((t) => !t.is_platform_starter).length, [listed]);

  /*
    Radix drops every inactive panel, so the two panel bodies are built ONCE from the active tab
    and handed to whichever <TabsContent> is mounted — not rebuilt per rail entry. Nothing here
    refetches on a tab switch either: `entityTemplatesService.list` loads the workspace's
    templates once and the rail only re-filters what is already in memory.
  */
  const libraryPanel = (
    <>
      <SectionHeader
        icon={activeAdapter?.icon ?? (activeTab === MINE_TAB ? LayoutTemplate : Layers)}
        title={activeAdapter?.plural ?? (activeTab === MINE_TAB ? 'My templates' : 'Starter templates')}
        subtitle={activeAdapter?.description
          ?? (activeTab === MINE_TAB
            ? 'Every template this workspace saved or built, across all types.'
            : 'Platform starters. Copy one into your workspace to edit it.')}
      />

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-6">
          {/* Your own templates belong to the My Templates view and appear ONLY there. Repeating
              them under every type tab meant the same card was on screen twice the moment you had
              saved anything, and pushed the starters — the half you cannot get anywhere else —
              below the fold. */}
          {activeTab === MINE_TAB && (
            <section className="space-y-2">
              {own.length === 0 ? (
                <Card className="dashboard-card"><CardContent className="p-8 text-center text-sm text-muted-foreground">
                  Nothing saved yet. Open any invoice, quote, project or moodboard and
                  choose <span className="font-medium">Save as template</span>, or start one with <span className="font-medium">Add New</span>.
                </CardContent></Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {own.map((t) => <Tile key={t.id} tpl={t} />)}
                </div>
              )}
            </section>
          )}

          {/* No inner "Starter examples" heading: the panel IS the starters now, and the
              SectionHeader above already says so. */}
          {activeTab !== MINE_TAB && (starters.length === 0 ? (
            <Card className="dashboard-card p-0">
              <HubEmptyState
                icon={Layers}
                title="No starter templates for this type yet"
                description="Starters are the ready-made examples we ship. You can still build your own — save any existing record as a template and it appears under My templates."
                action={
                  <Button size="sm" variant="outline" onClick={() => setTab(MINE_TAB)}>
                    See my templates
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {starters.map((t) => <Tile key={t.id} tpl={t} />)}
            </div>
          ))}
        </div>
      )}
    </>
  );

  const librariesPanel = (
    <>
      <SectionHeader
        icon={ExternalLink}
        title="Other template libraries"
        subtitle="These have their own editors — the links go straight there."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {externalSources.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.id} className="dashboard-card cursor-pointer" onClick={() => navigate(s.route)}>
              <CardContent className="p-4 flex items-start gap-2">
                <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium flex items-center gap-1">
                    <span className="truncate">{s.label}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{s.description}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );

  const tabValues: string[] = [MINE_TAB, ALL_TAB, ...usableTypes, LIBRARIES_TAB];

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={Layers}
        title="Templates"
        subtitle="Start from something you already built. Save any record as a template, or begin from a platform starter."
      />

      <main className="px-4 sm:px-6 py-6">
        <Tabs
          value={activeTab}
          onValueChange={setTab}
          orientation="vertical"
          className="flex flex-col gap-4 lg:flex-row lg:items-start"
        >
          {/* Left column: the two verbs first — create one, or look at the ones you already have —
              then the type rail. Both used to be buried: "Add New" did not exist at all, and "your
              templates" was a heading halfway down whichever panel you happened to be on. */}
          <div className="w-full shrink-0 space-y-2 lg:w-56">
            <Button size="sm" className="w-full gap-1.5 rounded-full" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add New
            </Button>

            <TabsList className="finance-tabs-list flex h-auto w-full shrink-0 flex-row flex-wrap gap-1 bg-transparent p-0 lg:w-full lg:flex-col lg:flex-nowrap">
            <TabsTrigger value={MINE_TAB} className="w-full justify-start">
              <LayoutTemplate className="h-4 w-4 mr-2 shrink-0" />
              <span className="truncate">My Templates</span>
              {mineCount > 0 && <span className="ml-auto pl-2 text-xs tabular-nums opacity-70">{mineCount}</span>}
            </TabsTrigger>

            <div className="my-1 h-px w-full bg-border" aria-hidden="true" />

            {/* Labelled for what it holds. It stopped being "All" the moment your own templates
                moved to their own view, and a tab that says All while showing half the library is
                worse than one with a narrower name. */}
            <TabsTrigger value={ALL_TAB} className="w-full justify-start">
              <Sparkles className="h-4 w-4 mr-2 shrink-0" />
              <span className="truncate">Starters</span>
              {starterCount > 0 && <span className="ml-auto pl-2 text-xs tabular-nums opacity-70">{starterCount}</span>}
            </TabsTrigger>

            {usableTypes.map((t: LiveTemplateEntityType) => {
              const adapter = TEMPLATE_ADAPTERS[t];
              const Icon = adapter.icon;
              const count = countByType.get(t) ?? 0;
              return (
                <TabsTrigger key={t} value={t} className="w-full justify-start">
                  <Icon className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">{adapter.plural}</span>
                  {count > 0 && <span className="ml-auto pl-2 text-xs tabular-nums opacity-70">{count}</span>}
                </TabsTrigger>
              );
            })}

            {/* A plain <div> child: `.finance-tabs-list > div` hides it below lg, where a rule
                inside a horizontal chip strip would just be noise. */}
            <div className="my-1 h-px w-full bg-border" aria-hidden="true" />

            <TabsTrigger value={LIBRARIES_TAB} className="w-full justify-start">
              <ExternalLink className="h-4 w-4 mr-2 shrink-0" />
              <span className="truncate">Other libraries</span>
            </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-w-0 flex-1">
            {tabValues.map((v) => (
              <TabsContent key={v} value={v} className="mt-0">
                {v === LIBRARIES_TAB ? librariesPanel : libraryPanel}
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </main>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New template</DialogTitle>
            <DialogDescription>
              Pick what it makes and name it — the next screen is where you fill in the details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="new-template-type" className="text-xs font-medium text-muted-foreground">Type</label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger id="new-template-type"><SelectValue placeholder="Choose a type" /></SelectTrigger>
                <SelectContent>
                  {usableTypes.map((t: LiveTemplateEntityType) => (
                    <SelectItem key={t} value={t}>{TEMPLATE_ADAPTERS[t].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="new-template-title" className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                id="new-template-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Standard kitchen quote"
                onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setCreating(false)}>Cancel</Button>
            <Button className="rounded-full gap-1.5" disabled={createBusy || !newType || !newTitle.trim()} onClick={create}>
              {createBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TemplateLibraryPage;
