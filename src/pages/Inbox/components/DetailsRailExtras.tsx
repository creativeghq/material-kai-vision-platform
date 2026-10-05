import React, { useState } from 'react';
import { CalendarClock, Check, Copy, FolderKanban, Handshake, ListTodo, Loader2, Plus, ShoppingCart, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { formatDate, formatTime } from '@/utils/datetime';
import { statusTone } from '@/utils/statusTone';
import { inboxApi, type InboxThread, type InboxThreadContext } from '@/services/inboxApi';
import { crmMeetingsService } from '@/services/crmMeetingsService';
import { projectsService, type ProjectStatus } from '@/modules/projects/services/projectsService';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_ORDER } from '@/modules/projects/projectStatus';
import { NewOrderDialog } from '@/modules/quotes/components/NewOrderDialog';
import { money } from '../inboxFormat';
import { SectionTitle } from './InboxPrimitives';

export const CopyButton: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const [done, setDone] = useState(false);
  return (
    <button type="button" title={`Copy ${label}`} className="text-muted-foreground hover:text-foreground shrink-0"
      onClick={() => { void navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); }}>
      {done ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

export const AddSenderToCrm: React.FC<{ thread: InboxThread; onAdded: () => void }> = ({ thread, onAdded }) => {
  const { toast } = useToast();
  const email = String((thread.metadata as Record<string, unknown> | null)?.email_from ?? '');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  if (!email) return null;
  const add = async () => {
    setBusy(true);
    try {
      const r = await inboxApi.createContactFromThread(thread.id, { name: name.trim() || undefined });
      toast({ title: r.created ? 'Added to the CRM' : 'Linked to the existing contact' });
      onAdded();
    } catch (e) {
      toast({ title: 'Could not add to the CRM', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };
  return (
    <div className="p-5 border-b border-hairline space-y-2">
      <SectionTitle icon={<UserPlus className="h-4 w-4" />}>Not in your CRM</SectionTitle>
      <p className="text-xs text-muted-foreground">{email} wrote to you. Add them as a contact so quotes, orders and this conversation stay together.</p>
      <div className="flex gap-1.5">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" className="h-8 text-xs" />
        <Button size="sm" className="h-8 text-xs shrink-0" disabled={busy} onClick={add}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add to CRM'}
        </Button>
      </div>
    </div>
  );
};

function ScheduleMeetingDialog({ contactId, contactName, email, projectId, onClose, onDone }: {
  contactId: string; contactName: string; email: string | null; projectId?: string | null; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const [subject, setSubject] = useState(`Meeting with ${contactName}`);
  const [when, setWhen] = useState('');
  const [location, setLocation] = useState('');
  const [invite, setInvite] = useState(!!email);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await crmMeetingsService.create({
        target: { kind: 'contact', id: contactId }, meetingAt: new Date(when).toISOString(), subject: subject.trim(),
        location: location.trim() || null, attendeeContactIds: [contactId], sendInvites: invite, remindEmail: true, projectId: projectId ?? null,
      });
      toast({
        title: 'Meeting scheduled',
        description: invite ? (r.invitesSent ? 'A calendar invite was emailed to them.' : `The invite was not sent${r.inviteError ? `: ${r.inviteError}` : '.'}`) : undefined,
        variant: invite && !r.invitesSent ? 'destructive' : undefined,
      });
      onDone();
    } catch (e) {
      toast({ title: 'Could not schedule', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule a Meeting</DialogTitle>
          <DialogDescription>It goes on your calendar, reminds you by email, and can send {contactName} a calendar invite.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          <div className="space-y-1"><Label htmlFor="mt-subject" className="text-xs text-muted-foreground">Subject</Label>
            <Input id="mt-subject" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="mt-when" className="text-xs text-muted-foreground">When</Label>
            <Input id="mt-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-56" /></div>
          <div className="space-y-1"><Label htmlFor="mt-where" className="text-xs text-muted-foreground">Where (optional)</Label>
            <Input id="mt-where" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Showroom, video link, site address…" /></div>
          {email && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} />Email a calendar invite to {email}
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !when || !subject.trim()}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Schedule'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddTaskDialog({ projects, defaultProjectId, threadId, onClose, onDone }: {
  projects: Array<{ id: string; name: string | null }>; defaultProjectId?: string; threadId: string; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await projectsService.createTask({
        project_id: projectId, title: title.trim(), due_date: due || undefined,
        description: `From the conversation: ${window.location.origin}/inbox?thread=${threadId}`,
      });
      toast({ title: 'Task added' });
      onDone();
    } catch (e) {
      toast({ title: 'Could not add the task', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a Task</DialogTitle>
          <DialogDescription>On the project&apos;s task list, linked back to this conversation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full h-9 rounded-sm border border-hairline bg-card px-2 text-sm" aria-label="Project">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name || 'Project'}</option>)}
          </select>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing" aria-label="Task" />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-44" aria-label="Due date" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !projectId || !title.trim()}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add task'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Quick actions, deals, upcoming meetings, open tasks and project status for the person on this conversation. */
export const DetailsRailExtras: React.FC<{ thread: InboxThread; context: InboxThreadContext; onChanged: () => void }> = ({ thread, context, onChanged }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const contact = context.contact;
  const projects = context.projects ?? [];
  const deals = context.deals ?? [];
  const meetings = context.meetings ?? [];
  const appointments = context.appointments ?? [];
  const tasks = context.tasks ?? [];
  const [orderOpen, setOrderOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [taskFor, setTaskFor] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  if (!contact) return null;

  const setStatus = async (projectId: string, status: ProjectStatus) => {
    setSavingStatus(projectId);
    try {
      await projectsService.updateProject(projectId, { status });
      toast({ title: `Project moved to ${PROJECT_STATUS_LABELS[status]}` });
      onChanged();
    } catch (e) {
      toast({ title: 'Could not update the project', description: (e as Error).message, variant: 'destructive' });
    } finally { setSavingStatus(null); }
  };

  return (
    <>
      <div className="px-5 py-3 border-b border-hairline flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOrderOpen(true)}><ShoppingCart className="w-3 h-3 mr-1" />New order</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMeetingOpen(true)}><CalendarClock className="w-3 h-3 mr-1" />Meeting</Button>
        {projects.length > 0 && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setTaskFor(projects[0].id)}><ListTodo className="w-3 h-3 mr-1" />Task</Button>}
      </div>

      {(meetings.length > 0 || appointments.length > 0) && (
        <div className="p-5 border-b border-hairline">
          <SectionTitle icon={<CalendarClock className="h-4 w-4" />} count={meetings.length + appointments.length}>Coming up</SectionTitle>
          <div className="space-y-1">
            {meetings.map((m) => (
              <div key={m.id} className="text-sm">
                <div className="truncate">{m.subject}</div>
                <div className="text-[11px] text-muted-foreground">{formatDate(m.meeting_at)} {formatTime(m.meeting_at)}{m.location ? ` · ${m.location}` : ''}</div>
              </div>
            ))}
            {appointments.map((a) => (
              <div key={a.id} className="text-sm">
                <div className="truncate">{a.service_name || 'Appointment'}</div>
                <div className="text-[11px] text-muted-foreground">{formatDate(a.appointment_date)} {String(a.appointment_time ?? '').slice(0, 5)} · {a.status}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-5 border-b border-hairline">
        <SectionTitle icon={<Handshake className="h-4 w-4" />} count={deals.length}>Deals</SectionTitle>
        {deals.length === 0 ? <div className="text-xs text-muted-foreground">No open deals with them.</div> : (
          <div className="space-y-0.5">
            {deals.map((d) => (
              <a key={d.id} href={`/crm/deals/${d.id}`} className="flex items-center gap-2 text-sm py-1.5 px-2 -mx-2 rounded-sm hover:bg-surface-hover">
                <span className="flex-1 min-w-0 truncate">{d.title || 'Deal'}</span>
                {d.value != null && <span className="text-xs text-muted-foreground shrink-0">{money(d.value, d.currency)}</span>}
                <span className={`text-[10px] capitalize shrink-0 ${statusTone(d.status ?? d.stage ?? '')}`}>{(d.stage ?? d.status ?? '').replace(/_/g, ' ')}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {projects.length > 0 && (
        <div className="p-5 border-b border-hairline">
          <SectionTitle icon={<FolderKanban className="h-4 w-4" />} count={projects.length}>Update a project</SectionTitle>
          <div className="space-y-2">
            {projects.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <a href={`/projects/${p.id}`} className="flex-1 min-w-0 truncate hover:underline">{p.name || 'Project'}</a>
                <select
                  aria-label={`Status of ${p.name ?? 'project'}`}
                  value={p.status ?? ''}
                  disabled={savingStatus === p.id}
                  onChange={(e) => void setStatus(p.id, e.target.value as ProjectStatus)}
                  className="h-7 rounded-sm border border-hairline bg-card px-1 text-xs"
                >
                  {PROJECT_STATUS_ORDER.map((st) => <option key={st} value={st}>{PROJECT_STATUS_LABELS[st]}</option>)}
                </select>
                <button type="button" title="Add a task" className="text-muted-foreground hover:text-foreground" onClick={() => setTaskFor(p.id)}><Plus className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          {tasks.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-[11px] font-semibold text-muted-foreground">Open tasks</div>
              {tasks.map((t) => (
                <a key={t.id} href={`/projects/${t.project_id}`} className="flex items-center gap-2 text-xs py-1 hover:underline">
                  <ListTodo className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="flex-1 min-w-0 truncate">{t.title}</span>
                  {t.due_date && <span className="text-muted-foreground shrink-0">{formatDate(t.due_date)}</span>}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      <NewOrderDialog
        open={orderOpen}
        onOpenChange={setOrderOpen}
        workspaceId={thread.workspace_id}
        initialCustomer={{ type: 'contact', id: contact.id, label: contact.name || contact.email || 'Contact', sub: contact.email ?? undefined }}
        initialName={thread.subject ? `${thread.subject}` : ''}
        onCreated={(quoteId) => { setOrderOpen(false); navigate(`/quotes/${quoteId}`); }}
      />
      {meetingOpen && (
        <ScheduleMeetingDialog contactId={contact.id} contactName={contact.name || contact.email || 'them'} email={contact.email ?? null}
          projectId={projects[0]?.id ?? null} onClose={() => setMeetingOpen(false)} onDone={() => { setMeetingOpen(false); onChanged(); }} />
      )}
      {taskFor && (
        <AddTaskDialog projects={projects} defaultProjectId={taskFor} threadId={thread.id}
          onClose={() => setTaskFor(null)} onDone={() => { setTaskFor(null); onChanged(); }} />
      )}
    </>
  );
};
