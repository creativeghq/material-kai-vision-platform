import React, { useEffect, useState } from 'react';
import { CalendarCheck, CalendarClock, ListTodo, Loader2, Plus, Save, TextQuote } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { destinationRoute } from '@/config/appDestinations';
import { formatDate, formatTime, localISODateOffset, todayLocalISO } from '@/utils/datetime';
import { mergeFields, proposeSlots, type BusyBlock, type DayAvailability } from '../meetingSlots';

interface Snippet { id: string; name: string; body: string; shared: boolean; use_count: number; created_by: string }

async function me(): Promise<string | null> {
  return (await supabase.auth.getUser()).data.user?.id ?? null;
}

/** Things a reply can carry that the platform already knows: saved snippets, a booking link, free times, a task. */
export const ComposerInsertMenu: React.FC<{
  workspaceId: string | null;
  onInsert: (text: string) => void;
  currentText: string;
  recipient?: { name?: string | null; email?: string | null };
  disabled?: boolean;
}> = ({ workspaceId, onInsert, currentText, recipient, disabled }) => {
  const { toast } = useToast();
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const loadSnippets = async () => {
    if (!workspaceId) return;
    const { data, error } = await supabase.from('inbox_snippets')
      .select('id, name, body, shared, use_count, created_by').eq('workspace_id', workspaceId)
      .order('use_count', { ascending: false }).limit(30);
    if (error) { setSnippets([]); return; }
    setSnippets((data ?? []) as Snippet[]);
  };

  const applySnippet = async (s: Snippet) => {
    onInsert(mergeFields(s.body, recipient ?? {}));
    const { error } = await supabase.rpc('inbox_snippet_used', { p_id: s.id });
    if (error) console.warn('[inbox] snippet use not counted', error.message);
  };

  const insertBookingLink = async () => {
    setBusy('booking');
    try {
      const uid = await me();
      const { data } = await supabase.from('user_profiles').select('booking_enabled').eq('user_id', uid ?? '').maybeSingle();
      if (!data?.booking_enabled) {
        toast({
          title: 'Online booking is off',
          description: `Turn it on and set your free hours in Profile → Availability (${destinationRoute('availability') ?? '/profile'}).`,
          variant: 'destructive',
        });
        return;
      }
      onInsert(`You can pick a time that suits you here: ${window.location.origin}/u/${uid}?tab=services#booking`);
    } finally { setBusy(null); }
  };

  const insertFreeTimes = async () => {
    setBusy('times');
    try {
      const uid = await me();
      if (!uid) return;
      const from = todayLocalISO();
      const to = localISODateOffset(14);
      const [avail, appts, meetings] = await Promise.all([
        supabase.from('appointment_availability').select('available_date, time_ranges').eq('user_id', uid).gte('available_date', from).lte('available_date', to),
        supabase.from('appointments').select('appointment_date, appointment_time, status').eq('professional_user_id', uid).gte('appointment_date', from).lte('appointment_date', to),
        supabase.from('crm_meetings').select('meeting_at, status').eq('owner_user_id', uid).gte('meeting_at', new Date().toISOString()).lte('meeting_at', new Date(Date.now() + 15 * 86_400_000).toISOString()),
      ]);
      const availability: DayAvailability[] = ((avail.data ?? []) as Array<{ available_date: string; time_ranges: DayAvailability['ranges'] | null }>)
        .map((r) => ({ date: r.available_date, ranges: r.time_ranges ?? [] }));
      if (!availability.length) {
        toast({ title: 'No free hours set', description: 'Add the hours you take meetings in Profile → Availability, then try again.', variant: 'destructive' });
        return;
      }
      const busyBlocks: BusyBlock[] = [
        ...((appts.data ?? []) as Array<{ appointment_date: string; appointment_time: string | null; status: string }>)
          .filter((a) => a.status !== 'cancelled' && a.appointment_time)
          .map((a) => { const s = new Date(`${a.appointment_date}T${String(a.appointment_time).slice(0, 5)}:00`); return { start: s, end: new Date(s.getTime() + 3_600_000) }; }),
        ...((meetings.data ?? []) as Array<{ meeting_at: string; status: string }>)
          .filter((m) => m.status !== 'cancelled')
          .map((m) => { const s = new Date(m.meeting_at); return { start: s, end: new Date(s.getTime() + 3_600_000) }; }),
      ];
      const slots = proposeSlots({ availability, busy: busyBlocks });
      if (!slots.length) {
        toast({ title: 'No free time in the next two weeks', description: 'Everything inside your set hours is booked.' });
        return;
      }
      onInsert(`I'm free at any of these times — let me know which suits you:\n${slots.map((d) => `- ${formatDate(d.toISOString())} at ${formatTime(d.toISOString())}`).join('\n')}`);
    } finally { setBusy(null); }
  };

  return (
    <>
      <DropdownMenu onOpenChange={(o) => { if (o) void loadSnippets(); }}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1" disabled={disabled} title="Insert a snippet, booking link, free times or a task">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}Insert
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 max-h-96 overflow-y-auto">
          <DropdownMenuItem onSelect={() => { void insertBookingLink(); }}><CalendarCheck className="w-3.5 h-3.5 mr-2" />My booking link</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { void insertFreeTimes(); }}><CalendarClock className="w-3.5 h-3.5 mr-2" />Propose meeting times</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTaskOpen(true)}><ListTodo className="w-3.5 h-3.5 mr-2" />A project task</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] text-muted-foreground">Snippets</DropdownMenuLabel>
          {snippets === null && <DropdownMenuItem disabled><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Loading…</DropdownMenuItem>}
          {snippets?.length === 0 && <DropdownMenuItem disabled>No snippets yet</DropdownMenuItem>}
          {snippets?.map((s) => (
            <DropdownMenuItem key={s.id} onSelect={() => { void applySnippet(s); }}>
              <TextQuote className="w-3.5 h-3.5 mr-2 shrink-0" />
              <span className="flex-1 truncate">{s.name}</span>
              <span className="text-[10px] text-muted-foreground ml-2">{s.shared ? 'team' : 'mine'} · {s.use_count}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!currentText.trim()} onSelect={() => setSaveOpen(true)}><Save className="w-3.5 h-3.5 mr-2" />Save this message as a snippet</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {saveOpen && workspaceId && <SaveSnippetDialog workspaceId={workspaceId} body={currentText} onClose={() => setSaveOpen(false)} />}
      {taskOpen && <InsertTaskDialog onInsert={(t) => { onInsert(t); setTaskOpen(false); }} onClose={() => setTaskOpen(false)} />}
    </>
  );
};

function SaveSnippetDialog({ workspaceId, body, onClose }: { workspaceId: string; body: string; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [text, setText] = useState(body);
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from('inbox_snippets').insert({ workspace_id: workspaceId, name: name.trim(), body: text, shared });
    setBusy(false);
    if (error) { toast({ title: 'Could not save the snippet', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Snippet saved' });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as a Snippet</DialogTitle>
          <DialogDescription>Use {'{first_name}'}, {'{name}'} and {'{email}'} and they are filled in for each recipient.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Delivery times" aria-label="Snippet name" />
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[140px]" aria-label="Snippet text" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />Share with my team</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !name.trim() || !text.trim()}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InsertTaskDialog({ onInsert, onClose }: { onInsert: (text: string) => void; onClose: () => void }) {
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; due_date: string | null; project_id: string; projects: { name: string | null } | null }> | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    void supabase.from('project_tasks').select('id, title, due_date, project_id, projects(name)').neq('status', 'done')
      .order('due_date', { ascending: true, nullsFirst: false }).limit(60)
      .then(({ data }) => setTasks((data ?? []) as unknown as NonNullable<typeof tasks>));
  }, []);
  const shown = (tasks ?? []).filter((t) => !q.trim() || `${t.title} ${t.projects?.name ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reference a Task</DialogTitle>
          <DialogDescription>Puts the task and a link to it in your message.</DialogDescription>
        </DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks or projects" aria-label="Search tasks" />
        <div className="max-h-72 overflow-y-auto divide-y divide-hairline border border-hairline rounded-sm">
          {tasks === null ? <div className="p-3"><Loader2 className="w-4 h-4 animate-spin" /></div> : shown.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No open tasks found.</div>
          ) : shown.map((t) => (
            <button key={t.id} type="button" className="w-full text-left px-3 py-2 hover:bg-surface-hover"
              onClick={() => onInsert(`Task: ${t.title}${t.due_date ? ` (due ${formatDate(t.due_date)})` : ''} — ${window.location.origin}/projects/${t.project_id}`)}>
              <div className="text-sm truncate">{t.title}</div>
              <div className="text-[11px] text-muted-foreground truncate">{t.projects?.name ?? 'Project'}{t.due_date ? ` · due ${formatDate(t.due_date)}` : ''}</div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
