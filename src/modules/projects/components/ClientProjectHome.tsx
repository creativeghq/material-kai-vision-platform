/** What a client (or a guest architect / subcontractor) sees of a project: one page, not the team's workspace. */
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarDays, Eye, FolderKanban, Inbox } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubTabNav, type HubTabItem } from '@/components/core/hub';
import { formatDate } from '@/utils/datetime';
import type { CollaboratorRole, ProjectWithClient } from '../services/projectsService';
import { projectRequestsService, type ProjectRequestWithMessages } from '../services/projectRequestsService';
import { REQUEST_CLOSED_STATUSES } from '../requestVocabulary';
import { PROJECT_STATUS_BADGE, PROJECT_STATUS_LABELS } from '../projectStatus';
import { ClientTimelinePanel } from './ClientTimelinePanel';
import { RequestsTab } from './tabs/RequestsTab';
import { MoodboardsTab } from './tabs/MoodboardsTab';
import { PresentationsTab } from './tabs/PresentationsTab';
import { QuotesTab } from './tabs/QuotesTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { TasksAndScheduleTab } from './tabs/TasksAndScheduleTab';
import { RoomsTab } from './tabs/RoomsTab';

type Section = 'updates' | 'requests' | 'design' | 'quotes' | 'documents' | 'progress';

/** A request is waiting on the guest when it asks for their decision, or the team has answered it. */
const waitsOnGuest = (r: ProjectRequestWithMessages): boolean =>
  !REQUEST_CLOSED_STATUSES.includes(r.status)
  && ((r.kind === 'approval_request' && !r.approval_decision) || r.status === 'answered');

export const ClientProjectHome: React.FC<{
  project: ProjectWithClient;
  collabRole: CollaboratorRole | null;
}> = ({ project, collabRole }) => {
  const [sp, setSp] = useSearchParams();
  const [waiting, setWaiting] = useState<ProjectRequestWithMessages[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    projectRequestsService.list(project.id)
      .then((rows) => { if (!cancelled) setWaiting(rows.filter(waitsOnGuest)); })
      .catch(() => { if (!cancelled) setWaiting(null); });
    return () => { cancelled = true; };
  }, [project.id]);

  const items = useMemo<HubTabItem[]>(() => [
    { id: 'updates', label: 'Updates' },
    { id: 'requests', label: 'Requests', count: waiting?.length ?? 0 },
    { id: 'design', label: 'Design' },
    ...(collabRole === 'client' ? [{ id: 'quotes', label: 'Quotes' }] : []),
    { id: 'documents', label: 'Documents' },
    { id: 'progress', label: 'Progress' },
  ], [collabRole, waiting]);

  const raw = sp.get('tab');
  // Team links (`?tab=requests&request=…`) land on the matching guest section.
  const section: Section = raw === 'requests' || sp.get('request') ? 'requests'
    : items.some((i) => i.id === raw) ? (raw as Section)
      : raw === 'moodboards' || raw === 'sheets' || raw === 'rooms' ? 'design'
        : raw === 'tasks' || raw === 'site' ? 'progress'
          : 'updates';
  const go = (id: string) => setSp((prev) => {
    const p = new URLSearchParams(prev);
    if (id === 'updates') p.delete('tab'); else p.set('tab', id);
    p.delete('request');
    return p;
  }, { replace: true });

  const owner = project.client_company?.name || project.client_contact?.name || null;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={FolderKanban}
        recordTitle
        title={project.name}
        subtitle={project.description || undefined}
        actions={
          <>
            <Badge variant="info" className="hidden sm:inline-flex"><Eye className="h-3 w-3 mr-1" />Shared with you</Badge>
            <Badge variant={PROJECT_STATUS_BADGE[project.status]} className="hidden sm:inline-flex">
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
          </>
        }
      />
      <main className="space-y-4 px-4 py-6 sm:px-6">
        <HubTabNav items={items} activeId={section} onSelect={go} aria-label="Project sections" />

        {section === 'updates' && (
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2"><ClientTimelinePanel projectId={project.id} /></div>
            <div className="min-w-0 space-y-4">
              <Card className="dashboard-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-medium"><Inbox className="h-4 w-4 text-primary" />Waiting on You</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {waiting === null ? (
                    <p className="text-muted-foreground">Requests could not be loaded.</p>
                  ) : waiting.length === 0 ? (
                    <p className="text-muted-foreground">Nothing needs your answer right now.</p>
                  ) : (
                    <>
                      <ul className="space-y-1.5">
                        {waiting.slice(0, 5).map((r) => (
                          <li key={r.id} className="truncate">
                            {r.reference && <span className="mr-1.5 text-xs text-muted-foreground">{r.reference}</span>}
                            {r.title}
                          </li>
                        ))}
                      </ul>
                      <Button size="sm" variant="outline" onClick={() => go('requests')}>
                        Open requests<ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
              <Card className="dashboard-card">
                <CardHeader><CardTitle className="font-medium">Details</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {owner && <p><span className="text-muted-foreground">Client: </span>{owner}</p>}
                  <p className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Deadline:</span> {project.deadline ? formatDate(project.deadline) : '—'}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {section === 'requests' && (
          <RequestsTab projectId={project.id} isOwner={false} collabRole={collabRole} focusRequestId={sp.get('request')} showUpdates={false} />
        )}
        {section === 'design' && (
          <div className="space-y-6">
            <RoomsTab projectId={project.id} budgetCurrency={project.budget_currency} isOwner={false} showBudget={false} />
            <MoodboardsTab projectId={project.id} canCreate={false} />
            <PresentationsTab projectId={project.id} projectName={project.name} isOwner={false} />
          </div>
        )}
        {section === 'quotes' && (
          <QuotesTab projectId={project.id} canManage={false} />
        )}
        {section === 'documents' && <DocumentsTab projectId={project.id} isOwner={false} />}
        {section === 'progress' && <TasksAndScheduleTab projectId={project.id} isOwner={false} />}
      </main>
    </div>
  );
};
