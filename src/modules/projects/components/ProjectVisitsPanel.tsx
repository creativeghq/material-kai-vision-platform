import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CalendarPlus, Check, Loader2, MapPin, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDate, formatTime, fromLocalISODate, localISODateOffset } from '@/utils/datetime';
import { crmMeetingsService } from '@/services/crmMeetingsService';
import {
  projectsService, visitStart, type ProjectVisit, type ProjectWithClient, type VisitSlot,
} from '../services/projectsService';
import { VISIT_PURPOSES } from '../visitVocabulary';

const STATUS_BADGE: Record<string, { label: string; variant: 'neutral' | 'info' | 'warning' | 'success' | 'error' }> = {
  pending: { label: 'Requested', variant: 'warning' },
  confirmed: { label: 'Confirmed', variant: 'success' },
  scheduled: { label: 'Scheduled', variant: 'info' },
  done: { label: 'Done', variant: 'neutral' },
  completed: { label: 'Done', variant: 'neutral' },
  cancelled: { label: 'Cancelled', variant: 'error' },
};

const hhmm = (t: string) => t.slice(0, 5);

function viewerZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; }
}

export const ProjectVisitsPanel: React.FC<{ project: ProjectWithClient; isOwner: boolean; className?: string }> = ({ project, isOwner, className }) => {
  const { toast } = useToast();
  const [visits, setVisits] = useState<ProjectVisit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [booking, setBooking] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(() => {
    projectsService.listProjectVisits(project.id)
      .then((rows) => { setVisits(rows); setFailed(false); })
      .catch(() => setFailed(true));
  }, [project.id]);
  useEffect(() => { load(); }, [load]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const rows = (visits ?? []).filter((v) => v.status !== 'cancelled').map((v) => ({ v, at: visitStart(v) }));
    return {
      upcoming: rows.filter((r) => !r.at || r.at.getTime() >= now - 3_600_000).sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0)),
      past: rows.filter((r) => r.at && r.at.getTime() < now - 3_600_000).sort((a, b) => (b.at!.getTime()) - (a.at!.getTime())),
    };
  }, [visits]);

  const respond = async (v: ProjectVisit, status: 'confirmed' | 'cancelled') => {
    try {
      await projectsService.setAppointmentStatus(v.id, status);
      load();
    } catch (err) {
      toast({ title: 'Could not update the booking', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    }
  };

  const action = isOwner
    ? <Button size="sm" onClick={() => setBooking(true)}><CalendarPlus className="mr-1.5 h-4 w-4" />Book a visit</Button>
    : <Button size="sm" onClick={() => setRequesting(true)}><CalendarPlus className="mr-1.5 h-4 w-4" />Request a visit</Button>;

  const list = showPast ? past : upcoming;

  return (
    <Card className={cn('dashboard-card', className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 font-medium"><CalendarClock className="h-4 w-4 text-primary" />Visits & meetings</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {isOwner ? 'Showroom visits, surveys, presentations and calls for this project.' : 'Book time with the team — a showroom visit, a survey or a call.'}
          </p>
        </div>
        {!(visits && visits.length === 0) && action}
      </CardHeader>
      <CardContent>
        {failed ? (
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Visits could not be loaded.
            <Button variant="ghost" size="sm" className="ml-2" onClick={load}>Retry</Button>
          </p>
        ) : visits === null ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : visits.length === 0 ? (
          <HubEmptyState
            icon={CalendarClock}
            title={isOwner ? 'Nothing booked for this project' : 'No visits booked with you'}
            description={isOwner
              ? 'Invite the client to the showroom to pick tiles and materials, book a site survey, or schedule a design presentation.'
              : 'Pick a time the team is free and they will confirm it.'}
            action={action}
          />
        ) : (
          <>
            {past.length > 0 && (
              <div className="mb-2 flex gap-3 text-xs">
                <button type="button" className={cn(!showPast ? 'font-semibold text-foreground' : 'text-muted-foreground')} onClick={() => setShowPast(false)}>Upcoming ({upcoming.length})</button>
                <button type="button" className={cn(showPast ? 'font-semibold text-foreground' : 'text-muted-foreground')} onClick={() => setShowPast(true)}>Past ({past.length})</button>
              </div>
            )}
            {list.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">{showPast ? 'Nothing earlier.' : 'Nothing coming up — everything booked is in the past.'}</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {list.map(({ v, at }) => {
                  const badge = STATUS_BADGE[v.status] ?? { label: v.status, variant: 'neutral' as const };
                  return (
                    <li key={`${v.kind}:${v.id}`} className="flex items-start gap-3 py-2.5">
                      <div className="w-14 shrink-0 rounded-sm border border-hairline bg-surface-sunken py-1 text-center">
                        <div className="text-[11px] text-muted-foreground">{at ? at.toLocaleDateString('en-US', { month: 'short' }) : '—'}</div>
                        <div className="text-base font-semibold tabular-nums">{at ? at.getDate() : ''}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{v.title}</span>
                          <Badge variant={badge.variant} className="text-[11px]">
                            {showPast && v.status === 'pending' ? 'Never answered' : badge.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {at ? formatTime(at) : ''}
                          {v.party && isOwner && <> · {v.party}</>}
                          {v.location && <> · <MapPin className="inline h-3 w-3" /> {v.location}</>}
                        </p>
                        {v.notes && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{v.notes}</p>}
                      </div>
                      {isOwner && !showPast && v.kind === 'appointment' && v.status === 'pending' && (
                        <div className="flex shrink-0 gap-1">
                          <Button size="sm" variant="outline" onClick={() => void respond(v, 'confirmed')}><Check className="mr-1 h-3.5 w-3.5" />Confirm</Button>
                          <Button size="sm" variant="ghost" onClick={() => void respond(v, 'cancelled')} aria-label="Decline"><X className="h-3.5 w-3.5" /></Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </CardContent>

      {isOwner && <BookVisitDialog open={booking} onOpenChange={setBooking} project={project} onBooked={load} />}
      <RequestVisitDialog open={requesting} onOpenChange={setRequesting} projectId={project.id} onRequested={load} />
    </Card>
  );
};

const BookVisitDialog: React.FC<{
  open: boolean; onOpenChange: (v: boolean) => void; project: ProjectWithClient; onBooked: () => void;
}> = ({ open, onOpenChange, project, onBooked }) => {
  const { toast } = useToast();
  const [purpose, setPurpose] = useState<string>(VISIT_PURPOSES[0].key);
  const [date, setDate] = useState(localISODateOffset(1));
  const [time, setTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [invite, setInvite] = useState(true);
  const [remind, setRemind] = useState(true);
  const [busy, setBusy] = useState(false);
  const [free, setFree] = useState<string[] | null>(null);
  const contact = project.client_contact ?? null;

  useEffect(() => {
    if (!open || !date) return;
    let cancelled = false;
    setFree(null);
    projectsService.getVisitSlots(project.id, date, date)
      .then((rows) => { if (!cancelled) setFree(rows.map((r) => hhmm(r.slot_time))); })
      .catch(() => { if (!cancelled) setFree([]); });
    return () => { cancelled = true; };
  }, [open, date, project.id]);

  const submit = async () => {
    const p = VISIT_PURPOSES.find((x) => x.key === purpose) ?? VISIT_PURPOSES[0];
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    if (!y || Number.isNaN(hh)) return;
    setBusy(true);
    try {
      const res = await crmMeetingsService.create({
        workspaceId: project.workspace_id,
        projectId: project.id,
        target: contact ? { kind: 'contact', id: contact.id } : undefined,
        meetingAt: new Date(y, m - 1, d, hh, mm).toISOString(),
        subject: p.label,
        location: location || null,
        notes: notes || null,
        attendeeContactIds: contact ? [contact.id] : [],
        sendInvites: !!contact && invite,
        remindEmail: remind,
      });
      toast({
        title: `${p.label} booked`,
        description: res.invitesSent > 0 ? 'Calendar invite sent to the client.' : res.inviteError ? `Invite not sent: ${res.inviteError}` : undefined,
      });
      onOpenChange(false);
      setNotes('');
      onBooked();
    } catch (err) {
      toast({ title: 'Could not book the visit', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Book a visit</DialogTitle>
          <DialogDescription>On this project's schedule{contact ? `, with ${contact.name ?? 'the client'}` : ''}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>What for</Label>
            <Select value={purpose} onValueChange={setPurpose}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VISIT_PURPOSES.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{VISIT_PURPOSES.find((p) => p.key === purpose)?.hint}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="visit-date">Date</Label><Input id="visit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="visit-time">Time</Label><Input id="visit-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          </div>
          <div className="text-xs">
            {free === null ? (
              <span className="text-muted-foreground">Checking your availability…</span>
            ) : free.length === 0 ? (
              <span className="text-muted-foreground">You have no published free hours that day (Profile → Schedule). Any time can still be booked.</span>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground">You're free at</span>
                {free.map((t) => (
                  <button key={t} type="button" onClick={() => setTime(t)}
                    className={cn('rounded-sm border px-2 py-0.5 tabular-nums', t === time ? 'border-primary text-primary' : 'border-hairline hover:border-primary')}
                  >{t}</button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1.5"><Label htmlFor="visit-loc">Where</Label><Input id="visit-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Showroom, site address, or a call link" /></div>
          <div className="space-y-1.5"><Label htmlFor="visit-notes">Notes</Label><Textarea id="visit-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. bring the kitchen plan; prepare the large-format tile samples" /></div>
          {contact && (
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={invite} onCheckedChange={(v) => setInvite(!!v)} />Email a calendar invite to {contact.name ?? 'the client'}</label>
          )}
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={remind} onCheckedChange={(v) => setRemind(!!v)} />Remind me by email an hour before</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy || !date || !time}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Book</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const RequestVisitDialog: React.FC<{
  open: boolean; onOpenChange: (v: boolean) => void; projectId: string; onRequested: () => void;
}> = ({ open, onOpenChange, projectId, onRequested }) => {
  const { toast } = useToast();
  const [purpose, setPurpose] = useState<string>(VISIT_PURPOSES[0].key);
  const [slots, setSlots] = useState<VisitSlot[] | null>(null);
  const [picked, setPicked] = useState<{ date: string; time: string } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const loadSlots = useCallback(() => {
    setSlots(null);
    projectsService.getVisitSlots(projectId, localISODateOffset(1), localISODateOffset(21))
      .then(setSlots)
      .catch(() => setSlots([]));
  }, [projectId]);
  useEffect(() => { if (open) { setPicked(null); loadSlots(); } }, [open, loadSlots]);

  const byDate = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of slots ?? []) {
      if (!m.has(s.slot_date)) m.set(s.slot_date, []);
      m.get(s.slot_date)!.push(hhmm(s.slot_time));
    }
    return [...m.entries()];
  }, [slots]);

  const submit = async () => {
    if (!picked) return;
    const p = VISIT_PURPOSES.find((x) => x.key === purpose) ?? VISIT_PURPOSES[0];
    setBusy(true);
    try {
      await projectsService.requestVisit(projectId, { date: picked.date, time: picked.time, purpose: p.label, message });
      toast({ title: 'Visit requested', description: 'The team will confirm it.' });
      onOpenChange(false);
      setMessage('');
      onRequested();
    } catch (err) {
      toast({ title: 'Could not request that time', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
      loadSlots();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request a visit</DialogTitle>
          <DialogDescription>Pick a time the team is free. They confirm it and you get a notification.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>What for</Label>
            <Select value={purpose} onValueChange={setPurpose}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{VISIT_PURPOSES.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {slots && slots.length > 0 && slots[0].time_zone !== viewerZone() && (
            <p className="text-xs text-muted-foreground">Times are the team's local time ({slots[0].time_zone}).</p>
          )}
          <div className="max-h-64 space-y-3 overflow-y-auto">
            {slots === null ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : byDate.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                The team has no free hours published for the next three weeks. Send them a message from Requests and they will propose a time.
              </p>
            ) : byDate.map(([d, times]) => (
              <div key={d}>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">{formatDate(fromLocalISODate(d), { weekday: true })}</p>
                <div className="flex flex-wrap gap-1.5">
                  {times.map((t) => {
                    const on = picked?.date === d && picked.time === t;
                    return (
                      <button key={t} type="button" onClick={() => setPicked({ date: d, time: t })}
                        className={cn('rounded-sm border px-2.5 py-1 text-sm tabular-nums', on ? 'border-primary bg-primary/[0.08] text-primary' : 'border-hairline hover:border-primary')}
                      >{t}</button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1.5"><Label htmlFor="visit-msg">Message (optional)</Label><Textarea id="visit-msg" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. I'd like to see the oak flooring and matt tiles" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy || !picked}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
