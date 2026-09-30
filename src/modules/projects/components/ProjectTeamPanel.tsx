import React, { useMemo, useState } from 'react';
import { Crown, Loader2, LogOut, UserPlus, Users, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  projectsService, type ProjectMember, type ProjectMemberRole, type ProjectWithClient,
} from '../services/projectsService';
import { AssigneeDot } from './tasks/taskBits';
import type { TaskAssignee } from './tasks/useProjectTasks';

const ROLE_LABEL: Record<ProjectMemberRole, string> = { manager: 'Manager', member: 'Member' };
const ROLE_HINT: Record<ProjectMemberRole, string> = {
  manager: 'Works on everything, sees the money, edits the project and manages its team',
  member: 'Works on tasks, rooms, documents, site and requests',
};

const PersonRow: React.FC<{
  name: string | null; missingLabel: string; open: number; badge?: React.ReactNode; actions?: React.ReactNode;
}> = ({ name, missingLabel, open, badge, actions }) => (
  <li className="flex items-center gap-2.5 py-2">
    <AssigneeDot name={name ?? '?'} className="h-7 w-7" />
    <div className="min-w-0 flex-1">
      <p className={cn('truncate text-sm', !name && 'text-muted-foreground')}>{name ?? missingLabel}</p>
      <p className="text-xs text-muted-foreground tabular-nums">{open} open {open === 1 ? 'task' : 'tasks'}</p>
    </div>
    {badge}
    {actions}
  </li>
);

export const ProjectTeamPanel: React.FC<{
  project: ProjectWithClient;
  members: ProjectMember[];
  canManage: boolean;
  openTasks: Map<string, number>;
  assignees: TaskAssignee[];
  assigneesFailed: boolean;
  onChanged: () => void;
  className?: string;
}> = ({ project, members, canManage, openTasks, assignees, assigneesFailed, onChanged, className }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pick, setPick] = useState('');
  const [pickRole, setPickRole] = useState<ProjectMemberRole>('member');
  const [busy, setBusy] = useState(false);

  const nameByKey = useMemo(() => new Map(assignees.map((a) => [`${a.kind}:${a.id}`, a.name])), [assignees]);
  const nameOf = (userId: string) => (userId === user?.id ? 'You' : nameByKey.get(`member:${userId}`) ?? null);
  const missingLabel = assigneesFailed ? 'Name could not be loaded' : 'No longer in the workspace';
  const teamKeys = useMemo(() => new Set([project.user_id, ...members.map((m) => m.user_id)].map((id) => `member:${id}`)), [project.user_id, members]);
  const candidates = assignees.filter((a) => a.kind === 'member' && !teamKeys.has(`member:${a.id}`));
  // People holding open work on this project who are not on its team: HR roster or a one-off assignee.
  const outside = [...openTasks.entries()].filter(([key, n]) => n > 0 && !teamKeys.has(key));

  const run = async (fn: () => Promise<void>, failure: string) => {
    setBusy(true);
    try { await fn(); onChanged(); } catch (err) {
      toast({ title: failure, description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Card className={cn('dashboard-card', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-medium"><Users className="h-4 w-4 text-primary" />Team</CardTitle>
        <p className="text-xs text-muted-foreground">
          People from your workspace working on this project. Clients are invited separately and only see what you share.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y divide-hairline">
          <PersonRow
            name={nameOf(project.user_id)}
            missingLabel={missingLabel}
            open={openTasks.get(`member:${project.user_id}`) ?? 0}
            badge={<Badge variant="secondary" className="gap-1 text-[11px]"><Crown className="h-3 w-3" />Owner</Badge>}
          />
          {members.map((m) => {
            const self = m.user_id === user?.id;
            const name = nameOf(m.user_id);
            return (
              <PersonRow
                key={m.id}
                name={name}
                missingLabel={missingLabel}
                open={openTasks.get(`member:${m.user_id}`) ?? 0}
                badge={canManage && !self ? (
                  <Select value={m.role} disabled={busy} onValueChange={(v) => void run(() => projectsService.setProjectMemberRole(m.id, v as ProjectMemberRole), 'Could not change the role')}>
                    <SelectTrigger className="h-7 w-[110px] text-xs" aria-label="Role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['manager', 'member'] as const).map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : <Badge variant={m.role === 'manager' ? 'info' : 'neutral'} className="text-[11px]">{ROLE_LABEL[m.role]}</Badge>}
                actions={self ? (
                  <Button variant="ghost" size="sm" disabled={busy} title="Leave this project" aria-label="Leave this project"
                    onClick={() => { if (confirm('Leave this project? You will lose access to it.')) void run(() => projectsService.removeProjectMember(m.id), 'Could not leave the project'); }}
                  ><LogOut className="h-3.5 w-3.5" /></Button>
                ) : canManage ? (
                  <Button variant="ghost" size="sm" disabled={busy} aria-label={`Remove ${name ?? 'member'}`}
                    onClick={() => void run(() => projectsService.removeProjectMember(m.id), 'Could not remove them')}
                  ><X className="h-3.5 w-3.5" /></Button>
                ) : null}
              />
            );
          })}
        </ul>

        {outside.length > 0 && (
          <div className="border-t border-hairline pt-2">
            <p className="text-xs font-semibold text-muted-foreground">Assigned work, not on the team</p>
            <ul className="divide-y divide-hairline">
              {outside.map(([key, n]) => (
                <PersonRow key={key} name={nameByKey.get(key) ?? null} missingLabel={missingLabel} open={n}
                  badge={<Badge variant="neutral" className="text-[11px]">{key.startsWith('employee:') ? 'Crew' : 'Assignee'}</Badge>}
                />
              ))}
            </ul>
          </div>
        )}

        {canManage && (
          <div className="space-y-1.5 border-t border-hairline pt-3">
            {assigneesFailed ? (
              <p className="text-xs text-amber-800 dark:text-amber-300">The workspace team could not be loaded, so nobody can be added right now.</p>
            ) : candidates.length === 0 ? (
              <p className="text-xs text-muted-foreground">Everyone in the workspace team is already on this project. Add people from Profile → Team.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Select value={pick} onValueChange={setPick}>
                    <SelectTrigger className="h-9 min-w-[180px] flex-1" aria-label="Teammate"><SelectValue placeholder="Add a teammate…" /></SelectTrigger>
                    <SelectContent>
                      {candidates.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={pickRole} onValueChange={(v) => setPickRole(v as ProjectMemberRole)}>
                    <SelectTrigger className="h-9 w-[120px]" aria-label="Role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['member', 'manager'] as const).map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="h-9" disabled={!pick || busy}
                    onClick={() => void run(async () => { await projectsService.addProjectMember(project.id, pick, pickRole); setPick(''); }, 'Could not add them to the project')}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="mr-1.5 h-4 w-4" />Add</>}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{ROLE_HINT[pickRole]}.</p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
