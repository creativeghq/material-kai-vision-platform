import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FolderKanban,
  Plus,
  Loader2,
  Building2,
  User as UserIcon,
  Calendar,
  Palette,
  FileText,
  AlertTriangle,
  ClipboardList,
} from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Progress } from '@/components/core/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { FilterBar, useFilters } from '@/components/core/filters';
import { buildProjectFilters } from '../components/projectFilters';
import {
  projectsService,
  type ProjectWithClient,
  type ProjectStatus,
} from '../services/projectsService';
import { CreateProjectModal } from '../components/CreateProjectModal';

const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planning',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
};

const STATUS_TONES: Record<ProjectStatus, string> = {
  planning: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  in_progress: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  on_hold: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  completed: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  archived: 'bg-muted text-muted-foreground border-border',
};

const formatMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);

const daysUntil = (date: string | null) => {
  if (!date) return null;
  const target = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
};

const clientLabel = (p: ProjectWithClient): { kind: 'company' | 'contact' | null; label: string | null } => {
  if (p.client_company?.name) return { kind: 'company', label: p.client_company.name };
  if (p.client_contact) {
    const c = p.client_contact;
    const name = c.name || [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email || null;
    return { kind: 'contact', label: name };
  }
  return { kind: null, label: null };
};

export const ProjectsListPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // #251 App Launcher deep-link: /projects?new=project opens the New Project modal.
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
      setProjects(data);
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

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={FolderKanban}
        title="Projects"
        subtitle="Container above moodboards and quotes — rooms, budget vs actual, tasks"
        actions={
          <>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => navigate('/blueprints')}>
              <ClipboardList className="h-4 w-4 mr-2" />
              Blueprints
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)} className="rounded-full">
              <Plus className="h-4 w-4 mr-2" />
              New project
            </Button>
          </>
        }
      />

      <main className="px-4 sm:px-6 py-6 space-y-4">
        {!loading && projects.length > 0 && (
          <FilterBar
            groups={filterGroups}
            values={filterValues}
            onChange={setFilterValues}
            previewCount={previewCount}
            title="Filter projects"
            searchPlaceholder="Search projects…"
          />
        )}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : visible.length === 0 ? (
          <Card className="dashboard-card">
            <CardContent className="py-16 text-center">
              <FolderKanban className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              {projects.length > 0 && activeCount > 0 ? (
                <>
                  <h3 className="text-lg font-light text-foreground mb-1">No projects match your filters</h3>
                  <p className="text-sm text-muted-foreground mb-4">Clear a constraint to widen the list.</p>
                  <Button variant="outline" onClick={() => setFilterValues({})} className="rounded-full">
                    Clear filters
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-light text-foreground mb-1">No projects yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    A project is a container for one engagement — its rooms, moodboards, quotes, and tasks.
                  </p>
                  <Button onClick={() => setShowCreate(true)} className="rounded-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Create your first project
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map(p => {
              const client = clientLabel(p);
              const days = daysUntil(p.deadline);
              const budget = p.budget_amount || 0;
              const actual = Number(p.actual_amount) || 0;
              const pct = budget > 0 ? Math.min(100, Math.round((actual / budget) * 100)) : 0;
              const overBudget = budget > 0 && actual > budget;

              return (
                <Card
                  key={p.id}
                  className="dashboard-card cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-light truncate flex-1">{p.name}</h3>
                      {/* The list now includes projects shared via an active collaborator grant —
                          mark them so they aren't mistaken for your own. */}
                      {p.is_mine === false && (
                        <Badge variant="secondary" className="shrink-0 text-xs" title={p.owner_name ? `Owned by ${p.owner_name}` : 'Shared with you'}>
                          Shared
                        </Badge>
                      )}
                      <Badge variant="outline" className={`shrink-0 text-xs ${STATUS_TONES[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </Badge>
                    </div>

                    {client.label && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        {client.kind === 'company' ? <Building2 className="h-3.5 w-3.5" /> : <UserIcon className="h-3.5 w-3.5" />}
                        <span className="truncate">{client.label}</span>
                      </div>
                    )}

                    {budget > 0 && (
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">
                            {formatMoney(actual, p.budget_currency)} / {formatMoney(budget, p.budget_currency)}
                          </span>
                          <span className={overBudget ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                            {pct}%
                          </span>
                        </div>
                        <Progress
                          value={pct}
                          className={overBudget ? '[&>div]:bg-destructive' : ''}
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                      <span className="flex items-center gap-1">
                        <Palette className="h-3.5 w-3.5" />
                        {p.moodboard_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        {p.accepted_quote_count}
                      </span>
                      {p.deadline && (
                        <span className={`flex items-center gap-1 ml-auto ${days !== null && days < 0 ? 'text-destructive' : days !== null && days <= 7 ? 'text-amber-300' : ''}`}>
                          {days !== null && days < 0 && <AlertTriangle className="h-3.5 w-3.5" />}
                          {days === null ? null : <Calendar className="h-3.5 w-3.5" />}
                          {days !== null && (days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d left`)}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {showCreate && (
        <CreateProjectModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onSuccess={(id) => navigate(`/projects/${id}`)}
        />
      )}
    </div>
  );
};
