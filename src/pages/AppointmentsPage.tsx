import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, Clock, Loader2, User, Mail, MessageSquare, CheckCircle2,
  XCircle, ChevronRight, Inbox, StickyNote,
} from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { statusTone } from '@/utils/statusTone';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/core/ui/sheet';
import { FilterBar, useFilters } from '@/components/core/filters';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { buildAppointmentFilters } from './appointmentFilters';
import { supabase } from '@/integrations/supabase/client';
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
  created_at: string;
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
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNotes(appt?.notes ?? '');
  }, [appt]);

  if (!appt) return null;

  const updateStatus = async (status: Appointment['status']) => {
    setSaving(true);
    await supabase.from('appointments').update({ status }).eq('id', appt.id);
    setSaving(false);
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
    await supabase.from('appointments').update({ notes }).eq('id', appt.id);
    setSaving(false);
    toast({ title: 'Notes saved' });
    onUpdated();
  };

  const openInbox = () => {
    navigate('/profile?tab=inbox');
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
                className="flex-1 rounded-full gap-2"
                onClick={() => updateStatus('confirmed')}
                disabled={saving}
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirm
              </Button>
              <Button
                variant="outline"
                className="flex-1 rounded-full gap-2"
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
              className="w-full rounded-full gap-2"
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
            className="w-full rounded-full gap-2"
            onClick={openInbox}
          >
            <Inbox className="h-4 w-4" />
            Open inbox
          </Button>

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
              className="rounded-full h-7 text-xs"
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
export const AppointmentsPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { user } = useAuth();
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
    <div className={embedded ? 'space-y-6' : 'p-3 sm:p-6 max-w-4xl mx-auto space-y-6'}>
      {embedded ? (
        <SectionHeader icon={Calendar} title="Appointments" subtitle="Manage booking requests from clients on your public profile." />
      ) : (
        <div>
          <h1 className="text-2xl font-light tracking-tight">Appointments</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage booking requests from clients on your public profile.</p>
        </div>
      )}

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
        <Card className="rounded-2xl">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>{activeCount > 0 ? 'No appointments match your filters.' : 'No appointments yet.'}</p>
          </CardContent>
        </Card>
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
