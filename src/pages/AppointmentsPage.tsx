import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar, Clock, Loader2, User, Mail, MessageSquare, CheckCircle2,
  XCircle, ChevronRight, Inbox, StickyNote, Link2 as LinkIcon,
} from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { SubjectLinkField, type SubjectKind, type SubjectValue } from '@/components/business/crm/SubjectLinkField';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { statusTone } from '@/utils/statusTone';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/core/ui/sheet';
import { FilterBar, useFilters } from '@/components/core/filters';
import { buildAppointmentFilters } from './appointmentFilters';
import { supabase } from '@/integrations/supabase/client';
import { propertyLabel } from '@/utils/propertyLabel';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { flowEventService } from '@/services/flows/flowEventService';

export interface Appointment {
  id: string;
  professional_user_id: string;
  client_user_id: string | null;
  client_name: string;
  client_email: string;
  client_message: string | null;
  service_id: string | null;
  service_name: string | null;
  appointment_date: string;
  appointment_time: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  notes: string | null;
  inbox_conversation_id: string | null;
  /**
   * What the appointment is ABOUT (#378 C4). At most ONE is set — enforced by
   * `appointments_single_subject_ck` — because an appointment about two things is about neither.
   */
  project_id: string | null;
  deal_id: string | null;
  property_id: string | null;
  order_id: string | null;
  created_at: string;
}

/** The subjects this surface offers. The schema also carries deal and order, set from those records. */
/** Which of an appointment's four subject columns is set, if any. At most one — the CHECK says so. */
function appointmentSubjectRef(appt: Appointment | null): { kind: SubjectKind; id: string } | null {
  if (!appt) return null;
  if (appt.project_id) return { kind: 'project', id: appt.project_id };
  if (appt.deal_id) return { kind: 'deal', id: appt.deal_id };
  if (appt.property_id) return { kind: 'property', id: appt.property_id };
  if (appt.order_id) return { kind: 'order', id: appt.order_id };
  return null;
}

/** The stored id resolved to something a human recognises. Null when the row is gone. */
async function resolveSubjectLabel(kind: SubjectKind, id: string): Promise<string | null> {
  const spec: Record<SubjectKind, { table: string; cols: string; pick: (r: Record<string, unknown>) => string }> = {
    project: { table: 'projects', cols: 'name', pick: (r) => (r.name as string) || 'Project' },
    deal: { table: 'crm_deals', cols: 'title', pick: (r) => (r.title as string) || 'Deal' },
    // `propertyLabel` is the one fallback chain for naming a building.
    property: { table: 'properties', cols: 'title, address, reference_code', pick: (r) => propertyLabel(r) },
    order: { table: 'orders', cols: 'order_number', pick: (r) => (r.order_number as string) || 'Order' },
  };
  const { table, cols, pick } = spec[kind];
  const { data } = await supabase.from(table).select(cols).eq('id', id).maybeSingle();
  return data ? pick(data as Record<string, unknown>) : null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  confirmed: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
  completed: 'bg-blue-100 text-blue-700 border-blue-200',
};

function formatSlot(slot: string) {
  const [h, m] = slot.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── Detail Drawer ──────────────────────────────────────────────────────────────
function AppointmentDetailDrawer({
  appt,
  open,
  onClose,
  onUpdated,
}: {
  appt: Appointment | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { activeWorkspaceId } = useWorkspace();
  const [subject, setSubject] = useState<SubjectValue | null>(null);
  const [savingSubject, setSavingSubject] = useState(false);

  /**
   * Set or clear the subject. Goes through the RPC because the appointment's own RLS cannot check
   * the SUBJECT's workspace — see the block that renders this.
   */
  const saveSubject = async (next: SubjectValue | null) => {
    if (!appt) return;
    setSavingSubject(true);
    const { error } = await (supabase as any).rpc('set_appointment_subject', {
      p_appointment_id: appt.id,
      p_kind: next?.kind ?? 'none',
      p_subject_id: next?.id ?? null,
    });
    setSavingSubject(false);
    if (error) {
      toast({ title: 'Could not set what this is about', description: error.message, variant: 'destructive' });
      return;
    }
    setSubject(next);
    onUpdated();
  };

  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNotes(appt?.notes ?? '');
    // The row carries ids; the control needs a label. Resolved on open rather than denormalized,
    // so a renamed project does not leave a stale name on the appointment.
    let cancelled = false;
    void (async () => {
      const found = appointmentSubjectRef(appt);
      if (!found) { if (!cancelled) setSubject(null); return; }
      const label = await resolveSubjectLabel(found.kind, found.id);
      if (!cancelled) setSubject(label ? { ...found, label } : null);
    })();
    return () => { cancelled = true; };
  }, [appt]);

  if (!appt) return null;

  const updateStatus = async (status: Appointment['status']) => {
    setSaving(true);
    // Checked before the flow event fires below (#389): emitting
    // `appointment_confirmed` for a status change that was refused notifies the
    // customer about something that did not happen.
    const { error } = await supabase.from('appointments').update({ status }).eq('id', appt.id);
    setSaving(false);
    if (error) return;
    const eventType =
      status === 'confirmed' ? 'appointment_confirmed' :
      status === 'completed' ? 'appointment_completed' :
      'appointment_cancelled';
    // The client notification (confirmed/cancelled, registered users only) is
    // delivered by the matching appointment flow; the event carries the payload.
    const notifyClient = !!appt.client_user_id && (status === 'confirmed' || status === 'cancelled');
    const apptTitle = status === 'confirmed'
      ? `Your appointment on ${formatDate(appt.appointment_date)} has been confirmed`
      : `Your appointment on ${formatDate(appt.appointment_date)} was cancelled`;
    flowEventService.emit(eventType, {
      user_id: notifyClient ? appt.client_user_id : null, // recipient (client)
      type: eventType,
      title: notifyClient ? apptTitle : '',
      body: appt.service_name ? `Service: ${appt.service_name}` : '',
      appointment_id: appt.id,
      professional_user_id: appt.professional_user_id,
    });

    toast({ title: `Appointment ${status}` });
    onUpdated();
  };

  const saveNotes = async () => {
    setSaving(true);
    // supabase-js RESOLVES on an RLS denial rather than throwing, so a discarded result meant
    // "Notes saved" fired on a write that never landed (#347 audit).
    const { error } = await supabase.from('appointments').update({ notes }).eq('id', appt.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save notes', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Notes saved' });
    onUpdated();
  };

  const openInbox = () => {
    navigate('/inbox');
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Appointment Details
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          {/* Date / time / status */}
          <div className="rounded-xl border bg-primary/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="h-4 w-4 text-primary" />
                {formatDate(appt.appointment_date)}
              </span>
              <Badge className={`text-xs border ${STATUS_COLORS[appt.status]}`}>
                {appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
              </Badge>
            </div>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {formatSlot(appt.appointment_time)}
              {appt.service_name && <span className="text-foreground font-medium">· {appt.service_name}</span>}
            </span>
          </div>

          {/* Client info */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Client</p>
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium">{appt.client_name}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <a href={`mailto:${appt.client_email}`} className="text-primary hover:underline">
                {appt.client_email}
              </a>
            </div>
            {appt.client_message && (
              <div className="flex gap-2 text-sm mt-1">
                <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-muted-foreground leading-relaxed">{appt.client_message}</p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {appt.status === 'pending' && (
            <div className="flex gap-2">
              <Button
                className="flex-1 gap-2"
                onClick={() => updateStatus('confirmed')}
                disabled={saving}
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirm
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => updateStatus('cancelled')}
                disabled={saving}
              >
                <XCircle className="h-4 w-4" />
                Decline
              </Button>
            </div>
          )}

          {appt.status === 'confirmed' && (
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => updateStatus('completed')}
              disabled={saving}
            >
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Mark as completed
            </Button>
          )}

          {/* Inbox shortcut */}
          <Button
            variant="secondary"
            className="w-full gap-2"
            onClick={openInbox}
          >
            <Inbox className="h-4 w-4" />
            Open inbox
          </Button>

          {/* What this appointment is ABOUT (#378 C4, completed by N10).

              A site visit, a measure-up, a viewing and a handover are all appointments about
              something. C4 gave the table four subject columns and this screen wrote two of them:
              `deal_id` and `order_id` were declared, typed, CHECK-constrained and reachable from
              nothing — the comment here even claimed they were "set from those records", and
              nothing set them. One control offering all four now, shared with the CRM calendar so
              the two surfaces cannot drift into supporting different subjects.

              Written through `set_appointment_subject`, never as a direct column update:
              `appointments` has no workspace_id and its RLS is keyed on professional_user_id, so
              nothing about a plain UPDATE would stop attaching this to a job in a workspace the
              caller has nothing to do with. The RPC resolves the workspace FROM the target. */}
          {activeWorkspaceId && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5" /> What is this about?
              </p>
              <SubjectLinkField
                workspaceId={activeWorkspaceId}
                value={subject}
                disabled={savingSubject}
                label=""
                onChange={(next) => saveSubject(next)}
              />
            </div>
          )}

          {/* Private notes */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5" /> Private Notes
            </p>
            <textarea
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              rows={4}
              placeholder="Notes visible only to you…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={saveNotes}
              disabled={saving}
            >
              Save notes
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
/**
 * Booking requests from clients on your public profile.
 *
 * Rendered ONLY as the `appointments` section of Profile → Schedule (`SchedulePanel`). It used to
 * take an `embedded` prop guarding a standalone `<h1>`, which was dead the whole time: there has
 * never been an `/appointments` route, so the un-embedded branch could not be reached. The rail
 * supplies the heading now.
 */
export const AppointmentsPage: React.FC = () => {
  const { user } = useAuth();
  const [, setSearchParams] = useSearchParams();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (user) load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('appointments')
      .select('*')
      .eq('professional_user_id', user!.id)
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true });
    setAppointments((data ?? []) as Appointment[]);
    setLoading(false);
  };

  const filterGroups = useMemo(() => buildAppointmentFilters(appointments), [appointments]);
  const { values: filterValues, setValues: setFilterValues, filtered, previewCount, activeCount } =
    useFilters<Appointment>(appointments, filterGroups);

  const pendingCount = appointments.filter((a) => a.status === 'pending').length;

  return (
    <div className="space-y-6">
      <FilterBar
        groups={filterGroups}
        values={filterValues}
        onChange={setFilterValues}
        previewCount={previewCount}
        title="Filter appointments"
        searchPlaceholder="Search client / service…"
      >
        {pendingCount > 0 && (
          <Badge className="bg-amber-100 text-amber-700 border-amber-200 border text-xs">
            {pendingCount} pending
          </Badge>
        )}
      </FilterBar>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        activeCount > 0 ? (
          <HubEmptyState
            icon={Calendar}
            variant="filtered"
            title="No appointments match your filters"
            description={`Your filters exclude all ${appointments.length} of them.`}
            action={<Button size="sm" variant="outline" onClick={() => setFilterValues({})}>Clear filters</Button>}
          />
        ) : (
          // The way out of an empty Appointments list is one section away in the same rail, which
          // is the whole reason these three surfaces merged: a professional with no bookings is
          // usually a professional who never turned Accept bookings on, and that answer used to
          // live two tabs from the list that raised the question. Nobody can "add" an appointment
          // here — a client makes it — so the action published the hours, it does not create a row.
          <HubEmptyState
            icon={Calendar}
            title="No appointments yet"
            description="Clients book you from your public profile, inside the hours you publish."
            action={(
              <Button size="sm" onClick={() => setSearchParams((p) => {
                const next = new URLSearchParams(p);
                next.set('section', 'availability');
                return next;
              }, { replace: true })}>
                Set your availability
              </Button>
            )}
          />
        )
      ) : (
        <div className="space-y-3">
          {filtered.map((appt) => (
            <Card
              key={appt.id}
              className="rounded-xl cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => { setSelected(appt); setDrawerOpen(true); }}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{appt.client_name}</span>
                      {appt.service_name && (
                        <span className="text-xs text-muted-foreground">· {appt.service_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(appt.appointment_date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatSlot(appt.appointment_time)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-xs capitalize ${statusTone(appt.status)}`}>
                      {appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AppointmentDetailDrawer
        appt={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUpdated={() => { load(); if (selected) setSelected(null); setDrawerOpen(false); }}
      />
    </div>
  );
};
