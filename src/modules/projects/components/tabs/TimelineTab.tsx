import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
  MessageSquare,
  MessageCircle,
  ClipboardCheck,
  AlertTriangle,
} from 'lucide-react';

import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { FilterBar, useFilters } from '@/components/core/filters';
import { buildTimelineFilters, timelineCategoryOf } from './timelineFilters';
import type { ProjectEvent } from '../../services/projectsService';
import { listProjectActivity } from '../../services/projectActivityService';
import { projectSectionPath } from '../../projectSections';
import { humanizeLabel } from '@/utils/humanize';
import { formatMoney as formatMoneyValue } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';

interface TimelineTabProps {
  projectId: string;
}

const EVENT_ICON: Record<string, React.ReactNode> = {
  'project.created': <FolderKanban className="h-3.5 w-3.5 text-primary" />,
  'project.status_changed': <Tag className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" />,
  'project.budget_changed': <Wallet className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />,
  'project.deadline_changed': <Calendar className="h-3.5 w-3.5 text-amber-800 dark:text-amber-300" />,
  'room.added': <Home className="h-3.5 w-3.5 text-primary" />,
  'room.removed': <Home className="h-3.5 w-3.5 text-muted-foreground" />,
  'moodboard.attached': <Palette className="h-3.5 w-3.5 text-primary" />,
  'moodboard.detached': <Palette className="h-3.5 w-3.5 text-muted-foreground" />,
  'quote.attached': <FileText className="h-3.5 w-3.5 text-primary" />,
  'quote.detached': <FileText className="h-3.5 w-3.5 text-muted-foreground" />,
  'quote.status_changed': <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" />,
  'quote.revised': <GitBranch className="h-3.5 w-3.5 text-primary" />,
  'task.created': <Plus className="h-3.5 w-3.5 text-muted-foreground" />,
  'task.completed': <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />,
  'task.deleted': <Trash2 className="h-3.5 w-3.5 text-destructive" />,
  'subtask.created': <Plus className="h-3.5 w-3.5 text-muted-foreground" />,
  'subtask.completed': <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />,
  'subtask.deleted': <Trash2 className="h-3.5 w-3.5 text-destructive" />,
  'request.raised': <MessageSquare className="h-3.5 w-3.5 text-primary" />,
  'request.closed': <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />,
  'request.client_message': <MessageCircle className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" />,
  'inspection.created': <ClipboardCheck className="h-3.5 w-3.5 text-primary" />,
  'inspection.signed_off': <ClipboardCheck className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />,
  'snag.raised': <AlertTriangle className="h-3.5 w-3.5 text-amber-800 dark:text-amber-300" />,
  'snag.resolved': <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />,
};

const requestName = (p: Record<string, any>) => `${p.reference ? `${p.reference} · ` : ''}"${p.title}"`;

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
    case 'request.raised': return `${humanizeLabel(p.kind)} raised${p.by ? ` by ${p.by}` : ''} — ${requestName(p)}${p.client_visible ? '' : ' (internal)'}`;
    case 'request.closed': {
      const verdict = p.approval_decision || p.review_decision;
      return `Request ${humanizeLabel(p.status).toLowerCase()}${verdict ? ` (${humanizeLabel(verdict).toLowerCase()})` : ''} — ${requestName(p)}`;
    }
    case 'request.client_message': return `${p.by || 'Client'} replied on ${requestName(p)}${p.excerpt ? `: ${p.excerpt}` : ''}`;
    case 'inspection.created': return `Inspection scheduled — "${p.title}"${p.inspection_date ? ` for ${formatDate(p.inspection_date)}` : ''}`;
    case 'inspection.signed_off': return `Inspection signed off — "${p.title}"${p.by ? ` by ${p.by}` : ''}`;
    case 'snag.raised': return `Snag raised — "${p.title}"${p.severity ? ` (${humanizeLabel(p.severity).toLowerCase()})` : ''}`;
    case 'snag.resolved': return `Snag ${humanizeLabel(p.status).toLowerCase() || 'resolved'} — "${p.title}"`;
    default: return humanizeLabel(e.event_type.replace(/\./g, '_'));
  }
};

/** Where a derived event's record lives; trigger-written events have no single target. */
const linkOf = (projectId: string, e: ProjectEvent): string | null => {
  const p = e.payload || {};
  if (p.request_id) return projectSectionPath(projectId, 'requests', { request: String(p.request_id) });
  if (e.event_type.startsWith('inspection.') || e.event_type.startsWith('snag.')) return projectSectionPath(projectId, 'site');
  return null;
};

/** Timeline payloads are untyped JSON, so coerce before handing to the canonical formatter. */
const formatMoney = (v: any, currency: any) => formatMoneyValue(v == null ? null : Number(v), currency || 'EUR');

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

export const TimelineTab: React.FC<TimelineTabProps> = ({ projectId }) => {
  const { toast } = useToast();
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const filterGroups = useMemo(() => buildTimelineFilters(events, describe), [events]);
  const { values: filterValues, setValues: setFilterValues, filtered: visible, previewCount, reset: resetFilters } =
    useFilters<ProjectEvent>(events, filterGroups);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setEvents(await listProjectActivity(projectId, 200));
    } catch (_err) {
      toast({ title: 'Failed to load timeline', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <FilterBar
        groups={filterGroups}
        values={filterValues}
        onChange={setFilterValues}
        previewCount={previewCount}
        title="Filter activity"
        searchPlaceholder="Search activity…"
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : visible.length === 0 ? (
        <Card className="dashboard-card p-0">
          {events.length === 0 ? (
            <HubEmptyState
              icon={Activity}
              title="No activity yet"
              description="Every change lands here in order: status, budget and deadline changes, rooms, moodboards, quotes and tasks, client requests and their replies, inspections and snags."
            />
          ) : (
            <HubEmptyState
              variant="filtered"
              icon={Activity}
              title="No events match the active filter"
              description="Widen the search or clear a filter to see the rest."
              action={<Button variant="outline" onClick={resetFilters}>Clear filters</Button>}
            />
          )}
        </Card>
      ) : (
        <Card className="dashboard-card">
          <CardContent className="p-0">
            <ul className="divide-y divide-hairline">
              {visible.map(e => {
                const href = linkOf(projectId, e);
                const category = timelineCategoryOf(e.event_type);
                return (
                  <li key={e.id} className="p-3 sm:p-4 flex items-start gap-3 hover:bg-muted/40 transition-colors">
                    <div className="mt-0.5 shrink-0">
                      {EVENT_ICON[e.event_type] || <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      {href
                        ? <Link to={href} className="text-sm hover:text-primary hover:underline break-words">{describe(e)}</Link>
                        : <p className="text-sm break-words">{describe(e)}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatTime(e.occurred_at)}{category ? ` · ${category}` : ''}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
