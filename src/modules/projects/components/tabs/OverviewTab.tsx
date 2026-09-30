import React, { useEffect, useMemo, useState } from 'react';
import { formatDate as formatDateValue } from '@/utils/datetime';
import {
  Building2,
  User as UserIcon,
  Calendar,
  Wallet,
  Mail,
  Phone,
  CheckCircle,
  Circle,
  Clock,
  AlertTriangle,
  Home,
  Tags,
  Diamond,
  ArrowRight,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import type { HubHeroFact } from '@/components/core/hub';
import { Badge } from '@/components/core/ui/badge';
import { Progress } from '@/components/core/ui/progress';
import {
  projectsService,
  type ProjectCoverCandidate,
  type ProjectWithClient,
  type ProjectRoom,
  type ProjectMember,
} from '../../services/projectsService';
import { ProjectCoverPanel } from '../ProjectCoverPanel';
import { assigneeKey, NO_ASSIGNEE, useProjectTasks } from '../tasks/useProjectTasks';
import { ProjectCostPanel } from '../ProjectCostPanel';
import { ProjectVisitsPanel } from '../ProjectVisitsPanel';
import { ProjectTeamPanel } from '../ProjectTeamPanel';

interface OverviewTabProps {
  project: ProjectWithClient;
  /** When false (collaborator viewing a shared project), hide budget + task internals. */
  isOwner?: boolean;
  /** Newest moodboard image, resolved by the page so the header and the cover panel agree. */
  coverCandidate?: ProjectCoverCandidate | null;
  /**
   * Patch the parent's copy of the project after an edit here. Without it the page header keeps
   * rendering the value this tab just changed until a reload — the kind of disagreement between
   * two views of one fact that reads as a bug.
   */
  onProjectPatched?: (patch: Partial<ProjectWithClient>) => void;
  canFinance?: boolean;
  canEditProject?: boolean;
  onOpenSection?: (tab: string) => void;
  team?: { members: ProjectMember[]; canManage: boolean; onChanged: () => void };
}

import { formatMoney } from '@/utils/decimal';
import { useToast } from '@/hooks/use-toast';
import { useEntitlements } from '@/hooks/useEntitlements';
import { PropertyLinkField } from '@/modules/finance/components/PropertyLinkField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { projectCategoriesService, type ProjectCategory } from '../../services/projectCategoriesService';

/** Callers branch on `null`, so this keeps the null return rather than the canonical dash. */
const formatDate = (d: string | null) => (d ? formatDateValue(d) : null);

const daysUntil = (date: string | null) => {
  if (!date) return null;
  const target = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

export const OverviewTab: React.FC<OverviewTabProps> = ({ project, isOwner = true, coverCandidate = null, onProjectPatched, canFinance = false, canEditProject = isOwner, onOpenSection, team }) => {
  const { toast } = useToast();
  // Buildings are only a sensible answer where the workspace actually has them. A permanently
  // empty picker reads as a broken control rather than a neutral one.
  const { isModuleAvailable } = useEntitlements();
  const realEstate = isModuleAvailable('real-estate');
  const [savingProperty, setSavingProperty] = useState(false);
  const [categories, setCategories] = useState<ProjectCategory[]>([]);
  const [savingCategory, setSavingCategory] = useState(false);
  const [rooms, setRooms] = useState<ProjectRoom[]>([]);
  const [roomBudget, setRoomBudget] = useState<Awaited<ReturnType<typeof projectsService.getRoomBudgetSummary>>>(
    { rooms: [], unassigned: { actual_amount: 0, item_count: 0 } },
  );
  const [roomBudgetFailed, setRoomBudgetFailed] = useState(false);
  const taskState = useProjectTasks(project.id);
  const { tasks } = taskState;

  useEffect(() => {
    projectsService.listRooms(project.id).then(setRooms).catch(() => {});
    // A failed rollup is "spend unknown", never "nothing spent" — an empty array renders every
    // room at zero against its budget, which reads as good news (#358 PQ-6).
    projectsService.getRoomBudgetSummary(project.id)
      .then((rows) => { setRoomBudget(rows); setRoomBudgetFailed(false); })
      .catch((err) => { console.error('[OverviewTab] room budget rollup failed:', err); setRoomBudgetFailed(true); });
  }, [project.id]);

  // Per-room budget card replaces the simple rooms-badge card when any room has either
  // a budget set OR has accepted-quote spend (so the rollup is non-zero on at least one row).
  const hasMeaningfulRoomBudget = roomBudget.rooms.some(r => r.room.budget_amount || r.actual_amount > 0)
    || roomBudget.unassigned.actual_amount > 0;

  const budget = project.budget_amount || 0;
  const actual = Number(project.actual_amount) || 0;
  const pct = budget > 0 ? Math.min(100, Math.round((actual / budget) * 100)) : 0;
  const overBudget = budget > 0 && actual > budget;
  const days = daysUntil(project.deadline);

  const taskStats = useMemo(() => {
    const all = tasks.flatMap(t => [t, ...t.subtasks]);
    return {
      todo: all.filter(t => t.status === 'todo').length,
      in_progress: all.filter(t => t.status === 'in_progress').length,
      done: all.filter(t => t.status === 'done').length,
      blocked: all.filter(t => t.status === 'blocked').length,
      total: all.length,
    };
  }, [tasks]);

  const upcomingTasks = useMemo(() => {
    const all = tasks.flatMap(t => [t, ...t.subtasks]);
    return all
      .filter(t => t.status !== 'done' && t.due_date)
      .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
      .slice(0, 3);
  }, [tasks]);

  const milestones = useMemo(() => tasks
    .flatMap(t => [t, ...t.subtasks])
    .filter(t => t.is_milestone)
    .sort((a, b) => (a.due_date ?? a.end_date ?? '9999').localeCompare(b.due_date ?? b.end_date ?? '9999')), [tasks]);

  const openTasks = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks.flatMap(x => [x, ...x.subtasks])) {
      const key = assigneeKey(t);
      if (key === NO_ASSIGNEE || t.status === 'done') continue;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [tasks]);

  useEffect(() => {
    if (!isOwner) return;
    projectCategoriesService.list(project.workspace_id)
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [isOwner, project.workspace_id]);

  const clientName = project.client_company?.name
    || project.client_contact?.name
    || [project.client_contact?.first_name, project.client_contact?.last_name].filter(Boolean).join(' ').trim()
    || null;
  const clientEmail: string | null = (project.client_company as any)?.email ?? project.client_contact?.email ?? null;
  const clientPhone: string | null = (project.client_company as any)?.phone ?? (project.client_contact as any)?.phone ?? null;

  const facts: HubHeroFact[] = [
    { icon: project.client_company ? Building2 : UserIcon, label: 'Client', value: clientName ?? '—' },
    {
      icon: Calendar,
      label: 'Deadline',
      value: formatDate(project.deadline) ?? '—',
      hint: days === null ? undefined : days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? 'Today' : `${days} days left`,
      alert: days !== null && days < 0,
    },
    ...(isOwner ? [{
      icon: Wallet,
      label: 'Budget',
      value: budget > 0 ? formatMoney(actual, project.budget_currency) : '—',
      hint: budget > 0 ? `${pct}% of ${formatMoney(budget, project.budget_currency)}${overBudget ? ' · over' : ''}` : 'No budget set',
      alert: overBudget,
    }] : []),
    ...(taskStats.total > 0 ? [{
      icon: CheckCircle,
      label: 'Tasks',
      value: `${taskStats.done} / ${taskStats.total}`,
      hint: taskStats.blocked > 0 ? `${taskStats.blocked} blocked` : `${Math.round((taskStats.done / taskStats.total) * 100)}% done`,
      alert: taskStats.blocked > 0,
    }] : []),
  ];

  return (
    <div className="space-y-4">
      {/* The picture the project wears — the same one its card carries on /projects. */}
      <ProjectCoverPanel
        project={project}
        isOwner={canEditProject}
        candidate={coverCandidate}
        onProjectPatched={onProjectPatched}
        facts={facts}
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {canFinance && onOpenSection && <ProjectCostPanel projectId={project.id} onOpenSection={onOpenSection} />}

          {/* Rooms summary — switches between simple badge list and per-room budget rollup
              based on whether any room actually has budget/spend data to show. */}
          {rooms.length > 0 && !hasMeaningfulRoomBudget && (
            <Card className="dashboard-card">
              <CardHeader>
                <CardTitle className="font-medium flex items-center gap-2">
                  <Home className="h-4 w-4 text-primary" />
                  Rooms ({rooms.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {rooms.map(r => (
                    <Badge key={r.id} variant="outline" className="text-sm py-1 px-3">
                      {r.name}
                      {r.room_type && <span className="ml-1.5 text-xs text-muted-foreground capitalize">· {r.room_type}</span>}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {roomBudgetFailed && isOwner && (
            <Card className="dashboard-card">
              <CardContent className="py-6 text-sm text-amber-800 dark:text-amber-400">
                Budget by room could not be loaded. Spend against each room is unknown — this is not
                the same as nothing having been spent.
              </CardContent>
            </Card>
          )}

          {hasMeaningfulRoomBudget && isOwner && !roomBudgetFailed && (
            <Card className="dashboard-card">
              <CardHeader>
                <CardTitle className="font-medium flex items-center gap-2">
                  <Home className="h-4 w-4 text-primary" />
                  Budget by Room
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  {roomBudget.rooms.map(({ room, actual_amount, item_count }) => {
                    const budget = Number(room.budget_amount) || 0;
                    const pct = budget > 0 ? Math.min(100, Math.round((actual_amount / budget) * 100)) : 0;
                    const over = budget > 0 && actual_amount > budget;
                    return (
                      <div key={room.id} className="min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate">
                            {room.name}
                            {room.room_type && <span className="ml-1.5 text-xs text-muted-foreground capitalize">· {room.room_type}</span>}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                            {formatMoney(actual_amount, project.budget_currency)}
                            {budget > 0 && <> / {formatMoney(budget, project.budget_currency)}</>}
                          </span>
                        </div>
                        {budget > 0 && (
                          <Progress value={pct} className={over ? '[&>div]:bg-destructive' : ''} />
                        )}
                        {item_count > 0 && (
                          <p className="text-[11px] text-muted-foreground">{item_count} {item_count === 1 ? 'item' : 'items'}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Accepted-quote LINE totals; the project figure is SUM(grand_total) with upsells,
                    cash discount and VAT, so naming what is missing keeps the breakdown honest. */}
                {roomBudget.unassigned.actual_amount > 0 && (
                  <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3 text-sm">
                    <span className="text-muted-foreground">Not assigned to a room</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatMoney(roomBudget.unassigned.actual_amount, project.budget_currency)}
                      {roomBudget.unassigned.item_count > 0 && (
                        <> · {roomBudget.unassigned.item_count} {roomBudget.unassigned.item_count === 1 ? 'item' : 'items'}</>
                      )}
                    </span>
                  </div>
                )}
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Accepted-quote line totals. VAT, upsells and any cash discount sit outside these
                  figures, so they will not add up to the project total above.
                </p>
              </CardContent>
            </Card>
          )}

          <ProjectVisitsPanel project={project} isOwner={isOwner} />
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="dashboard-card">
            <CardHeader>
              <CardTitle className="font-medium">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="min-w-0 space-y-1">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  {project.client_company ? <Building2 className="h-3.5 w-3.5" /> : <UserIcon className="h-3.5 w-3.5" />}
                  Client
                </p>
                {clientName ? (
                  <>
                    <p className="text-sm font-medium">{clientName}</p>
                    {clientEmail && (
                      <a href={`mailto:${clientEmail}`} className="flex items-center gap-1.5 truncate text-xs text-muted-foreground hover:text-foreground">
                        <Mail className="h-3.5 w-3.5 shrink-0" />{clientEmail}
                      </a>
                    )}
                    {clientPhone && (
                      <a href={`tel:${clientPhone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                        <Phone className="h-3.5 w-3.5 shrink-0" />{clientPhone}
                      </a>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No client assigned yet.</p>
                )}
              </div>

              {/* Owner-only: a collaborator sees the delivery, not how the business files it. */}
              {isOwner && (
                <div className="space-y-1.5 border-t border-hairline pt-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Tags className="h-3.5 w-3.5" />Category
                  </p>
                  <Select
                    value={project.category_id ?? 'none'}
                    disabled={savingCategory || !canEditProject}
                    onValueChange={async (v) => {
                      const nextId = v === 'none' ? null : v;
                      setSavingCategory(true);
                      try {
                        await projectsService.updateProject(project.id, { category_id: nextId });
                        onProjectPatched?.({
                          category_id: nextId,
                          category: nextId
                            ? (() => {
                                const c = categories.find((x) => x.id === nextId);
                                return c ? { id: c.id, key: c.key, label: c.label } : null;
                              })()
                            : null,
                        });
                        toast({ title: nextId ? 'Category updated' : 'Category cleared' });
                      } catch (e) {
                        toast({ title: 'Failed to update the category', description: (e as Error).message, variant: 'destructive' });
                      } finally { setSavingCategory(false); }
                    }}
                  >
                    <SelectTrigger className="h-9"><SelectValue placeholder="No category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No category</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* The building this job is at (#378 N4). Self-hiding without the module: a
                  permanently empty control reads as broken, not as neutral. */}
              {canEditProject && realEstate && project.workspace_id && (
                <div className="border-t border-hairline pt-3">
                  <PropertyLinkField
                    workspaceId={project.workspace_id}
                    propertyId={project.property_id ?? null}
                    disabled={savingProperty}
                    compact
                    onChange={async (propertyId) => {
                      setSavingProperty(true);
                      try {
                        await projectsService.updateProject(project.id, { property_id: propertyId });
                        toast({ title: propertyId ? 'Project attached to the property' : 'Project detached from its property' });
                      } catch (e) {
                        toast({ title: 'Failed to update the property', description: (e as Error).message, variant: 'destructive' });
                      } finally { setSavingProperty(false); }
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {taskStats.total > 0 && (
            <Card className="dashboard-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="font-medium">Tasks</CardTitle>
                {onOpenSection && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onOpenSection('tasks')}>
                    Open<ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted-foreground">{taskStats.done} of {taskStats.total} done</span>
                    <span className="tabular-nums font-semibold">{Math.round((taskStats.done / taskStats.total) * 100)}%</span>
                  </div>
                  <Progress value={(taskStats.done / taskStats.total) * 100} />
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <Stat label="Todo" value={taskStats.todo} icon={<Circle className="h-3.5 w-3.5" />} />
                  <Stat label="Active" value={taskStats.in_progress} icon={<Clock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" />} />
                  <Stat label="Done" value={taskStats.done} icon={<CheckCircle className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />} />
                  <Stat label="Blocked" value={taskStats.blocked} icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-800 dark:text-amber-300" />} />
                </div>
                {upcomingTasks.length > 0 && (
                  <div className="pt-2 border-t border-hairline">
                    <p className="text-xs text-muted-foreground mb-2">Next due</p>
                    <ul className="space-y-1.5">
                      {upcomingTasks.map(t => {
                        const d = daysUntil(t.due_date);
                        return (
                          <li key={t.id} className="flex items-center gap-2 text-sm">
                            <Circle className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="truncate flex-1">{t.title}</span>
                            <span className={`text-xs shrink-0 ${d !== null && d < 0 ? 'text-destructive' : d !== null && d <= 3 ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}>
                              {d === null ? '' : d < 0 ? `${Math.abs(d)}d over` : d === 0 ? 'Today' : `${d}d`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {milestones.length > 0 && (
                  <div className="pt-2 border-t border-hairline">
                    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Diamond className="h-3 w-3" />Milestones</span>
                      <span className="tabular-nums">{milestones.filter(m => m.status === 'done').length}/{milestones.length} reached</span>
                    </div>
                    <div className="flex gap-1" aria-hidden="true">
                      {milestones.map(m => (
                        <span key={m.id} title={m.title} className={`h-1.5 flex-1 rounded-sm ${m.status === 'done' ? 'bg-primary' : 'bg-surface-sunken border border-hairline'}`} />
                      ))}
                    </div>
                    {milestones.find(m => m.status !== 'done') && (
                      <p className="mt-1.5 truncate text-xs">
                        Next: {milestones.find(m => m.status !== 'done')!.title}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {team && (
            <ProjectTeamPanel
              project={project}
              members={team.members}
              canManage={team.canManage}
              openTasks={openTasks}
              assignees={taskState.assignees}
              assigneesFailed={taskState.assigneesFailed}
              onChanged={team.onChanged}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-center gap-1.5">
      {icon}
      <span className="text-lg font-light">{value}</span>
    </div>
    <p className="text-xs text-muted-foreground">{label}</p>
  </div>
);
