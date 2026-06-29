import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Activity,
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  GitBranch,
  Palette,
  FileText,
  Home,
  Wallet,
  Calendar,
  Tag,
  FolderKanban,
} from 'lucide-react';

import { Card, CardContent } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { projectsService, type ProjectEvent } from '../../services/projectsService';
import { humanizeLabel } from '@/utils/humanize';

interface TimelineTabProps {
  projectId: string;
}

// Filter chip groups (matches the trigger-emitted event_types from the Phase 3 migration)
const FILTER_GROUPS: Array<{ label: string; events: string[] }> = [
  { label: 'Project', events: ['project.created', 'project.status_changed', 'project.budget_changed', 'project.deadline_changed'] },
  { label: 'Rooms', events: ['room.added', 'room.removed'] },
  { label: 'Moodboards', events: ['moodboard.attached', 'moodboard.detached'] },
  { label: 'Quotes', events: ['quote.attached', 'quote.detached', 'quote.status_changed', 'quote.revised'] },
  { label: 'Tasks', events: ['task.created', 'task.completed', 'task.deleted', 'subtask.created', 'subtask.completed', 'subtask.deleted'] },
];

const EVENT_ICON: Record<string, React.ReactNode> = {
  'project.created': <FolderKanban className="h-3.5 w-3.5 text-primary" />,
  'project.status_changed': <Tag className="h-3.5 w-3.5 text-blue-300" />,
  'project.budget_changed': <Wallet className="h-3.5 w-3.5 text-emerald-300" />,
  'project.deadline_changed': <Calendar className="h-3.5 w-3.5 text-amber-300" />,
  'room.added': <Home className="h-3.5 w-3.5 text-primary" />,
  'room.removed': <Home className="h-3.5 w-3.5 text-muted-foreground" />,
  'moodboard.attached': <Palette className="h-3.5 w-3.5 text-primary" />,
  'moodboard.detached': <Palette className="h-3.5 w-3.5 text-muted-foreground" />,
  'quote.attached': <FileText className="h-3.5 w-3.5 text-primary" />,
  'quote.detached': <FileText className="h-3.5 w-3.5 text-muted-foreground" />,
  'quote.status_changed': <FileText className="h-3.5 w-3.5 text-blue-300" />,
  'quote.revised': <GitBranch className="h-3.5 w-3.5 text-primary" />,
  'task.created': <Plus className="h-3.5 w-3.5 text-muted-foreground" />,
  'task.completed': <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />,
  'task.deleted': <Trash2 className="h-3.5 w-3.5 text-destructive" />,
  'subtask.created': <Plus className="h-3.5 w-3.5 text-muted-foreground" />,
  'subtask.completed': <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />,
  'subtask.deleted': <Trash2 className="h-3.5 w-3.5 text-destructive" />,
};

const describe = (e: ProjectEvent): string => {
  const p = e.payload || {};
  switch (e.event_type) {
    case 'project.created': return `Project created — "${p.name}"`;
    case 'project.status_changed': return `Status changed: ${p.from} → ${p.to}`;
    case 'project.budget_changed': return `Budget changed: ${formatMoney(p.from, p.currency)} → ${formatMoney(p.to, p.currency)}`;
    case 'project.deadline_changed': return `Deadline changed: ${formatDate(p.from)} → ${formatDate(p.to)}`;
    case 'room.added': return `Room added — "${p.name}"${p.room_type ? ` (${p.room_type})` : ''}`;
    case 'room.removed': return `Room removed — "${p.name}"`;
    case 'moodboard.attached': return `Moodboard attached — "${p.title}"`;
    case 'moodboard.detached': return `Moodboard detached — "${p.title}"`;
    case 'quote.attached': return `Quote attached — "${p.name || 'Untitled'}" (${humanizeLabel(p.status)})`;
    case 'quote.detached': return `Quote detached — "${p.name || 'Untitled'}"`;
    case 'quote.status_changed': return `Quote "${p.name || 'Untitled'}": ${p.from} → ${p.to}${p.grand_total ? ` (${formatMoney(p.grand_total, p.currency)})` : ''}`;
    case 'quote.revised': return `Quote revision ${p.revision_number} issued — "${p.name}"`;
    case 'task.created': return `Task created — "${p.title}"`;
    case 'task.completed': return `Task completed — "${p.title}"`;
    case 'task.deleted': return `Task deleted — "${p.title}"`;
    case 'subtask.created': return `Subtask added — "${p.title}"`;
    case 'subtask.completed': return `Subtask completed — "${p.title}"`;
    case 'subtask.deleted': return `Subtask deleted — "${p.title}"`;
    default: return e.event_type;
  }
};

const formatMoney = (v: any, currency: any) => {
  if (v == null) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'EUR' }).format(Number(v));
  } catch {
    return String(v);
  }
};

const formatDate = (v: any) => {
  if (!v) return '—';
  return new Date(v).toLocaleDateString();
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

export const TimelineTab: React.FC<TimelineTabProps> = ({ projectId }) => {
  const { toast } = useToast();
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await projectsService.listEvents(projectId, { limit: 200 });
      setEvents(data);
    } catch (err) {
      toast({ title: 'Failed to load timeline', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => { load(); }, [load]);

  const toggleFilter = (label: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const visible = useMemo(() => {
    if (activeFilters.size === 0) return events;
    const allowed = new Set<string>();
    for (const g of FILTER_GROUPS) {
      if (activeFilters.has(g.label)) g.events.forEach(e => allowed.add(e));
    }
    return events.filter(e => allowed.has(e.event_type));
  }, [events, activeFilters]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTER_GROUPS.map(g => {
          const active = activeFilters.has(g.label);
          return (
            <button
              key={g.label}
              type="button"
              onClick={() => toggleFilter(g.label)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-muted/60'
              }`}
            >
              {g.label}
            </button>
          );
        })}
        {activeFilters.size > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setActiveFilters(new Set())}
            className="h-7 text-xs"
          >
            Clear
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : visible.length === 0 ? (
        <Card className="dashboard-card">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            {events.length === 0
              ? 'No activity yet. Events will appear here as you work.'
              : 'No events match the active filter.'}
          </CardContent>
        </Card>
      ) : (
        <Card className="dashboard-card">
          <CardContent className="p-0">
            <ul className="divide-y divide-white/8">
              {visible.map(e => (
                <li key={e.id} className="p-3 sm:p-4 flex items-start gap-3 hover:bg-muted/40 transition-colors">
                  <div className="mt-0.5 shrink-0">
                    {EVENT_ICON[e.event_type] || <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{describe(e)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatTime(e.occurred_at)}
                      <span className="ml-2 opacity-50">· {e.event_type}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
