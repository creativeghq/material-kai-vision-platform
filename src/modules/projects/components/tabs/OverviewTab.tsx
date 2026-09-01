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
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Progress } from '@/components/core/ui/progress';
import {
  projectsService,
  type ProjectWithClient,
  type ProjectRoom,
  type ProjectTaskWithSubtasks,
} from '../../services/projectsService';

interface OverviewTabProps {
  project: ProjectWithClient;
  /** When false (collaborator viewing a shared project), hide budget + task internals. */
  isOwner?: boolean;
  /**
   * Patch the parent's copy of the project after an edit here. Without it the page header keeps
   * rendering the value this tab just changed until a reload — the kind of disagreement between
   * two views of one fact that reads as a bug.
   */
  onProjectPatched?: (patch: Partial<ProjectWithClient>) => void;
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

export const OverviewTab: React.FC<OverviewTabProps> = ({ project, isOwner = true, onProjectPatched }) => {
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
  const [tasks, setTasks] = useState<ProjectTaskWithSubtasks[]>([]);

  useEffect(() => {
    projectsService.listRooms(project.id).then(setRooms).catch(() => {});
    // A failed rollup is "spend unknown", never "nothing spent" — an empty array renders every
    // room at zero against its budget, which reads as good news (#358 PQ-6).
    projectsService.getRoomBudgetSummary(project.id)
      .then((rows) => { setRoomBudget(rows); setRoomBudgetFailed(false); })
      .catch((err) => { console.error('[OverviewTab] room budget rollup failed:', err); setRoomBudgetFailed(true); });
    projectsService.listTasks(project.id).then(setTasks).catch(() => {});
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

  useEffect(() => {
    if (!isOwner) return;
    projectCategoriesService.list(project.workspace_id)
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [isOwner, project.workspace_id]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* What kind of job this is. Owner-only: a collaborator on a shared project sees the
          delivery, not how the business files it. */}
      {isOwner && (
        <Card className="dashboard-card lg:col-span-3">
          <CardContent className="p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Tags className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Category</span>
              </div>
              <Select
                value={project.category_id ?? 'none'}
                disabled={savingCategory}
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
                <SelectTrigger className="sm:w-64"><SelectValue placeholder="No category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* The building this job is at (#378 N4). A deal could point at a property OR a project;
          the property and the project could not point at each other, so a renovation, a
          development or a fit-out -- the actual work these customers do -- could not be attached
          to the building it happens in. Owner-only and self-hiding without the module: a
          permanently empty control reads as broken, not as neutral. */}
      {isOwner && realEstate && project.workspace_id && (
        <Card className="dashboard-card lg:col-span-3">
          <CardContent className="p-4">
            <PropertyLinkField
              workspaceId={project.workspace_id}
              propertyId={project.property_id ?? null}
              disabled={savingProperty}
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
          </CardContent>
        </Card>
      )}

      {/* Client */}
      <Card className="dashboard-card lg:col-span-1">
        <CardHeader>
          <CardTitle className="font-medium flex items-center gap-2">
            {project.client_company ? <Building2 className="h-4 w-4 text-primary" /> : <UserIcon className="h-4 w-4 text-primary" />}
            Client
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!project.client_company && !project.client_contact ? (
            <p className="text-sm text-muted-foreground">No client assigned yet.</p>
          ) : project.client_company ? (
            <div className="space-y-2">
              <p className="font-medium">{project.client_company.name}</p>
              {(project.client_company as any).email && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  {(project.client_company as any).email}
                </p>
              )}
              {(project.client_company as any).phone && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {(project.client_company as any).phone}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-medium">
                {project.client_contact?.name ||
                  [project.client_contact?.first_name, project.client_contact?.last_name].filter(Boolean).join(' ').trim() ||
                  'Unnamed contact'}
              </p>
              {project.client_contact?.email && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  {project.client_contact.email}
                </p>
              )}
              {(project.client_contact as any)?.phone && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {(project.client_contact as any).phone}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Budget — owner only. Collaborators (shared client view) don't see financial internals. */}
      {isOwner && (
        <Card className="dashboard-card lg:col-span-1">
          <CardHeader>
            <CardTitle className="font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              Budget
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {budget === 0 ? (
              <p className="text-sm text-muted-foreground">No budget set.</p>
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-light">{formatMoney(actual, project.budget_currency)}</span>
                  <span className="text-sm text-muted-foreground">of {formatMoney(budget, project.budget_currency)}</span>
                </div>
                <Progress value={pct} className={overBudget ? '[&>div]:bg-destructive' : ''} />
                <p className={`text-xs ${overBudget ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {pct}% spent — {project.accepted_quote_count} accepted {project.accepted_quote_count === 1 ? 'quote' : 'quotes'}
                  {overBudget && ' (over budget)'}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Deadline */}
      <Card className="dashboard-card lg:col-span-1">
        <CardHeader>
          <CardTitle className="font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Deadline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!project.deadline ? (
            <p className="text-sm text-muted-foreground">No deadline set.</p>
          ) : (
            <>
              <p className="text-2xl font-light">{formatDate(project.deadline)}</p>
              {days !== null && (
                <p className={`text-sm mt-1 ${days < 0 ? 'text-destructive' : days <= 7 ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}>
                  {days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? 'Today' : `${days} days left`}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Rooms summary — switches between simple badge list and per-room budget rollup
          based on whether any room actually has budget/spend data to show. */}
      {rooms.length > 0 && !hasMeaningfulRoomBudget && (
        <Card className="dashboard-card lg:col-span-2">
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
        <Card className="dashboard-card lg:col-span-2">
          <CardContent className="py-6 text-sm text-amber-800 dark:text-amber-400">
            Budget by room could not be loaded. Spend against each room is unknown — this is not
            the same as nothing having been spent.
          </CardContent>
        </Card>
      )}

      {hasMeaningfulRoomBudget && isOwner && !roomBudgetFailed && (
        <Card className="dashboard-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-medium flex items-center gap-2">
              <Home className="h-4 w-4 text-primary" />
              Budget by Room
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {roomBudget.rooms.map(({ room, actual_amount, item_count }) => {
                const budget = Number(room.budget_amount) || 0;
                const pct = budget > 0 ? Math.min(100, Math.round((actual_amount / budget) * 100)) : 0;
                const over = budget > 0 && actual_amount > budget;
                return (
                  <div key={room.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate">
                        {room.name}
                        {room.room_type && <span className="ml-1.5 text-xs text-muted-foreground capitalize">· {room.room_type}</span>}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatMoney(actual_amount, project.budget_currency)}
                        {budget > 0 && <> / {formatMoney(budget, project.budget_currency)}</>}
                        {item_count > 0 && <> · {item_count} {item_count === 1 ? 'item' : 'items'}</>}
                      </span>
                    </div>
                    {budget > 0 && (
                      <Progress value={pct} className={over ? '[&>div]:bg-destructive' : ''} />
                    )}
                  </div>
                );
              })}
              {/* The rows above are accepted-quote LINE totals on a room. The project figure at the
                  top of this page is SUM(grand_total), which also carries accepted upsells, the
                  cash discount and VAT — so these can never add up to it. Naming what is missing
                  is the difference between a breakdown and a breakdown with a hole in it. */}
              {roomBudget.unassigned.actual_amount > 0 && (
                <div className="flex items-center justify-between border-t border-hairline pt-3 text-sm">
                  <span className="text-muted-foreground">Not assigned to a room</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatMoney(roomBudget.unassigned.actual_amount, project.budget_currency)}
                    {roomBudget.unassigned.item_count > 0 && (
                      <> · {roomBudget.unassigned.item_count} {roomBudget.unassigned.item_count === 1 ? 'item' : 'items'}</>
                    )}
                  </span>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Accepted-quote line totals. VAT, upsells and any cash discount sit outside these
                figures, so they will not add up to the project total above.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Task summary widget */}
      {taskStats.total > 0 && (
        <Card className={`dashboard-card ${rooms.length > 0 ? 'lg:col-span-1' : 'lg:col-span-3'}`}>
          <CardHeader>
            <CardTitle className="font-medium">Tasks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
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
          </CardContent>
        </Card>
      )}

      {project.description && (
        <Card className="dashboard-card lg:col-span-3">
          <CardHeader>
            <CardTitle className="font-medium">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{project.description}</p>
          </CardContent>
        </Card>
      )}
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
