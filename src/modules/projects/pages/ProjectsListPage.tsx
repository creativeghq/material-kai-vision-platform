/**
 * /projects — every engagement in the workspace (plus the ones shared with you), as a grid of
 * covers or as a table, inside ONE panel: toolbar on top, rows in the middle, count at the
 * bottom (design-system §7, the list archetype).
 *
 * The cover a card wears is resolved through utils/projectCover.ts: the owner's own picture,
 * else the newest moodboard image, else a library scene picked from what the project is about.
 * The moodboard rung is one RPC for the whole page, never one per card.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList, FolderKanban, LayoutGrid, List as ListIcon, Plus, Tags } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Progress } from '@/components/core/ui/progress';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import {
  HubCellEmpty,
  HubDataTable,
  HubEmptyState,
  HubSegmented,
  type HubColumn,
  type HubSegment,
  type HubSort,
} from '@/components/core/hub';
import { FilterBar, useFilters } from '@/components/core/filters';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/decimal';
import { timeAgo } from '@/utils/datetime';
import { buildProjectFilters } from '../components/projectFilters';
import { CreateProjectModal } from '../components/CreateProjectModal';
import { ProjectCategoryManager } from '../components/ProjectCategoryManager';
import { ProjectCard, projectCoverSrc } from '../components/ProjectCard';
import { PROJECT_STATUS_BADGE, PROJECT_STATUS_LABELS, PROJECT_STATUS_ORDER } from '../projectStatus';
import {
  projectsService,
  type ProjectCoverCandidate,
  type ProjectWithClient,
} from '../services/projectsService';
import { resolveProjectCover } from '../utils/projectCover';
import {
  DEADLINE_TONE_CLASS,
  budgetFigures,
  describeDeadline,
  projectClientLabel,
  projectCoverInput,
} from '../utils/projectPresentation';

type ProjectsView = 'grid' | 'list';
type SortKey = 'updated' | 'deadline' | 'name' | 'budget' | 'created' | 'client' | 'status' | 'moodboards' | 'quotes';
type SortDirection = 'asc' | 'desc';

/** The grid's sort menu. The table sorts by column instead, through the same comparator. */
const GRID_SORTS: ReadonlyArray<{ id: string; label: string; key: SortKey; direction: SortDirection }> = [
  { id: 'updated:desc', label: 'Recently active', key: 'updated', direction: 'desc' },
  { id: 'deadline:asc', label: 'Deadline, soonest first', key: 'deadline', direction: 'asc' },
  { id: 'name:asc', label: 'Name, A to Z', key: 'name', direction: 'asc' },
  { id: 'budget:desc', label: 'Most budget used', key: 'budget', direction: 'desc' },
  { id: 'created:desc', label: 'Newest first', key: 'created', direction: 'desc' },
];

const VIEW_OPTIONS: readonly HubSegment<ProjectsView>[] = [
  { value: 'grid', label: <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />, title: 'Grid' },
  { value: 'list', label: <ListIcon className="h-3.5 w-3.5" aria-hidden="true" />, title: 'List' },
];

const VIEW_PREF = 'projects.view';
const SORT_PREF = 'projects.sort';

function readPref(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writePref(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable — the choice just does not persist */ }
}

/** Compare on one key. Missing values (no deadline, no client) sort LAST whichever way round. */
function hasValue(p: ProjectWithClient, key: SortKey): boolean {
  if (key === 'deadline') return !!p.deadline;
  if (key === 'client') return !!projectClientLabel(p).label;
  if (key === 'budget') return budgetFigures(p).budget > 0;
  return true;
}

function compareProjects(a: ProjectWithClient, b: ProjectWithClient, key: SortKey): number {
  switch (key) {
    case 'name': return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    case 'client': return (projectClientLabel(a).label ?? '').localeCompare(projectClientLabel(b).label ?? '');
    case 'status': return PROJECT_STATUS_ORDER.indexOf(a.status) - PROJECT_STATUS_ORDER.indexOf(b.status);
    case 'budget': return budgetFigures(a).pct - budgetFigures(b).pct;
    case 'deadline': return (a.deadline ?? '').localeCompare(b.deadline ?? '');
    case 'moodboards': return a.moodboard_count - b.moodboard_count;
    case 'quotes': return a.accepted_quote_count - b.accepted_quote_count;
    case 'created': return a.created_at.localeCompare(b.created_at);
    case 'updated':
    default:
      return a.last_activity_at.localeCompare(b.last_activity_at);
  }
}

function sortProjects(rows: ProjectWithClient[], key: SortKey, direction: SortDirection): ProjectWithClient[] {
  const dir = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = hasValue(a, key);
    const bv = hasValue(b, key);
    if (av !== bv) return av ? -1 : 1;
    return compareProjects(a, b, key) * dir || a.name.localeCompare(b.name);
  });
}

export const ProjectsListPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectWithClient[]>([]);
  const [covers, setCovers] = useState<Map<string, ProjectCoverCandidate>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeWorkspaceId } = useWorkspace();

  const [view, setView] = useState<ProjectsView>(() => (readPref(VIEW_PREF) === 'list' ? 'list' : 'grid'));
  const [gridSortId, setGridSortId] = useState<string>(() => {
    const saved = readPref(SORT_PREF);
    return GRID_SORTS.some((s) => s.id === saved) ? (saved as string) : GRID_SORTS[0].id;
  });
  const [tableSort, setTableSort] = useState<HubSort>({ columnId: 'updated', direction: 'desc' });

  // App Launcher deep-link: /projects?new=project opens the New Project modal.
  useEffect(() => {
    if (searchParams.get('new') === 'project') {
      setShowCreate(true);
      const p = new URLSearchParams(searchParams);
      p.delete('new');
      setSearchParams(p, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await projectsService.listProjects();
      // The moodboard rung of the cover ladder, one RPC for every project on the page. Losing it
      // degrades a card to its library scene, so it must never take the list down with it.
      const top = new Map<string, ProjectCoverCandidate>();
      try {
        const m = await projectsService.coverCandidates(data.map((p) => p.id), 1);
        for (const [id, list] of m) if (list[0]) top.set(id, list[0]);
      } catch (err) {
        console.warn('[ProjectsListPage] moodboard covers unavailable:', err);
      }
      setProjects(data);
      setCovers(top);
    } catch (err) {
      console.error('Failed to load projects:', err);
      toast({ title: 'Failed to load projects', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filterGroups = useMemo(() => buildProjectFilters(projects), [projects]);
  // Archived is seeded off so the default view matches the old "Show archived" behaviour.
  const { values: filterValues, setValues: setFilterValues, filtered: visible, previewCount, activeCount } =
    useFilters<ProjectWithClient>(projects, filterGroups, { initial: { archived: false } });

  const gridSort = GRID_SORTS.find((s) => s.id === gridSortId) ?? GRID_SORTS[0];
  const sortKey: SortKey = view === 'grid' ? gridSort.key : (tableSort.columnId as SortKey);
  const sortDirection: SortDirection = view === 'grid' ? gridSort.direction : tableSort.direction;
  const sorted = useMemo(() => sortProjects(visible, sortKey, sortDirection), [visible, sortKey, sortDirection]);

  const coverFor = useCallback(
    (p: ProjectWithClient) => resolveProjectCover(projectCoverInput(p), covers.get(p.id) ?? null),
    [covers],
  );

  const columns = useMemo<HubColumn<ProjectWithClient>[]>(() => [
    {
      id: 'name',
      header: 'Project',
      sortable: true,
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={projectCoverSrc(coverFor(p), 200)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-9 w-16 shrink-0 rounded-xs border border-hairline bg-surface-sunken object-cover"
          />
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">{p.name}</div>
            {(p.category?.label || p.is_mine === false) && (
              <div className="truncate text-[11px] text-muted-foreground">
                {[p.category?.label, p.is_mine === false ? `Owned by ${p.owner_name ?? 'someone else'}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'client',
      header: 'Client',
      sortable: true,
      hideBelow: 'md',
      cell: (p) => projectClientLabel(p).label ?? <HubCellEmpty />,
    },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      cell: (p) => <Badge variant={PROJECT_STATUS_BADGE[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Badge>,
    },
    {
      id: 'budget',
      header: 'Budget used',
      sortable: true,
      align: 'right',
      hideBelow: 'lg',
      cell: (p) => {
        const f = budgetFigures(p);
        if (f.budget <= 0) return <HubCellEmpty />;
        return (
          <div className="ml-auto w-36">
            <div className={cn('flex justify-between gap-2 text-xs tabular-nums', f.overBudget && 'font-semibold text-destructive')}>
              <span>{formatMoney(f.actual, p.budget_currency)}</span>
              <span className={f.overBudget ? undefined : 'text-muted-foreground'}>{f.pct}%</span>
            </div>
            <Progress value={f.pct} className={cn('mt-1 h-1', f.overBudget && '[&>div]:bg-destructive')} />
          </div>
        );
      },
    },
    {
      id: 'deadline',
      header: 'Deadline',
      sortable: true,
      hideBelow: 'sm',
      cell: (p) => {
        const d = describeDeadline(p.deadline);
        return d ? <span className={cn('text-xs font-medium', DEADLINE_TONE_CLASS[d.tone])}>{d.label}</span> : <HubCellEmpty />;
      },
    },
    { id: 'moodboards', header: 'Boards', sortable: true, align: 'right', hideBelow: 'xl', cell: (p) => p.moodboard_count },
    { id: 'quotes', header: 'Quotes', sortable: true, align: 'right', hideBelow: 'xl', cell: (p) => p.accepted_quote_count },
    {
      id: 'updated',
      header: 'Activity',
      sortable: true,
      hideBelow: 'lg',
      cell: (p) => <span className="text-xs text-muted-foreground">{timeAgo(p.last_activity_at)}</span>,
    },
  ], [coverFor]);

  const archivedHidden = filterValues.archived === false;
  const countLabel = loading
    ? 'Loading…'
    : sorted.length === projects.length
      ? `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`
      : `${sorted.length} of ${projects.length} projects`;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={FolderKanban}
        title="Projects"
        subtitle="One place per engagement — rooms, moodboards, quotes, tasks and the money behind them"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/blueprints')}>
              <ClipboardList className="h-4 w-4 mr-2" />
              Blueprints
            </Button>
            {activeWorkspaceId && (
              <Button variant="outline" size="sm" onClick={() => setManagingCategories(true)}>
                <Tags className="h-4 w-4 mr-2" />
                Categories
              </Button>
            )}
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New project
            </Button>
          </>
        }
      />

      <main className="px-4 py-6 sm:px-6">
        <div className="overflow-hidden rounded-md border border-hairline bg-card">
          {/* Toolbar — search and filters narrow the set on the left; how to look at it on the right. */}
          <div className="flex flex-wrap items-center gap-2 border-b border-hairline bg-surface-sunken px-3 py-2">
            {projects.length > 0 && (
              <FilterBar
                groups={filterGroups}
                values={filterValues}
                onChange={setFilterValues}
                previewCount={previewCount}
                title="Filter projects"
                searchPlaceholder="Search projects…"
                className="min-w-0 flex-1"
              />
            )}
            <div className="ml-auto flex items-center gap-2">
              {view === 'grid' && projects.length > 1 && (
                <Select value={gridSortId} onValueChange={(v) => { setGridSortId(v); writePref(SORT_PREF, v); }}>
                  <SelectTrigger className="h-8 w-52 text-xs" aria-label="Sort projects">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRID_SORTS.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <HubSegmented
                options={VIEW_OPTIONS}
                value={view}
                onChange={(v) => { setView(v); writePref(VIEW_PREF, v); }}
                aria-label="View projects as"
              />
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-md border border-hairline">
                  <Skeleton className="aspect-[16/9] w-full rounded-none" />
                  <div className="space-y-2 p-4">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : sorted.length === 0 ? (
            projects.length > 0 && activeCount > 0 ? (
              <HubEmptyState
                variant="filtered"
                icon={FolderKanban}
                title="No projects match your filters"
                description="Widen the search or clear a filter to see the rest."
                action={<Button variant="outline" onClick={() => setFilterValues({})}>Clear filters</Button>}
              />
            ) : (
              <HubEmptyState
                icon={FolderKanban}
                title="No projects yet"
                description="A project is one engagement — its rooms, moodboards, quotes, tasks and budget, kept together and shareable with the client."
                action={(
                  <Button onClick={() => setShowCreate(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    New project
                  </Button>
                )}
              />
            )
          ) : view === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {sorted.map((p) => (
                <ProjectCard key={p.id} project={p} cover={coverFor(p)} />
              ))}
            </div>
          ) : (
            <HubDataTable
              rows={sorted}
              columns={columns}
              rowId={(p) => p.id}
              onRowClick={(p) => navigate(`/projects/${p.id}`)}
              sort={tableSort}
              onSortChange={setTableSort}
              className="rounded-none border-0"
            />
          )}

          {/* Footer band: how many, and the one filter people forget is on. */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline bg-surface-sunken px-3 py-1.5 text-[11px] text-muted-foreground">
            <span className="tabular-nums">{countLabel}</span>
            {archivedHidden && projects.some((p) => p.status === 'archived') && (
              <button
                type="button"
                className="hover:text-foreground hover:underline"
                onClick={() => setFilterValues({ ...filterValues, archived: undefined })}
              >
                Archived projects are hidden — show them
              </button>
            )}
          </div>
        </div>
      </main>

      {showCreate && (
        <CreateProjectModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onSuccess={(id) => navigate(`/projects/${id}`)}
        />
      )}

      {managingCategories && activeWorkspaceId && (
        <ProjectCategoryManager
          workspaceId={activeWorkspaceId}
          onClose={() => setManagingCategories(false)}
          /* A rename or delete changes what every card and the filter facet show, so reload
             rather than patching the rows the manager happened to touch. */
          onChanged={() => { void load(); }}
        />
      )}
    </div>
  );
};
