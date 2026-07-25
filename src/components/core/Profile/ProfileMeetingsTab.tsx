/**
 * Profile → Calendar: the meetings the current user has logged across CRM contacts
 * and companies (crm_meetings.owner_user_id = me). Upcoming first, then past. Each
 * row links back to the party and shows its reminder channels.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Clock, Mail, MessageSquare, Loader2, Check, Trash2, Building2, User } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { statusTone } from '@/utils/statusTone';
import { useToast } from '@/hooks/use-toast';
import { crmMeetingsService, type CrmMeeting } from '@/services/crmMeetingsService';
import { getErrorMessage } from '@/core/errors/utils';

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });

export const ProfileMeetingsTab: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [meetings, setMeetings] = useState<CrmMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMeetings(await crmMeetingsService.listMine({ limit: 200 }));
    } catch (err) {
      toast({ title: 'Could not load your meetings', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try { await fn(); await load(); }
    catch (err) { toast({ title: 'Action failed', description: getErrorMessage(err), variant: 'destructive' }); }
    finally { setBusyId(null); }
  };

  const now = Date.now();
  const isUpcoming = (m: CrmMeeting) => m.status === 'scheduled' && new Date(m.meeting_at).getTime() >= now;
  const upcoming = meetings.filter(isUpcoming).sort((a, b) => (a.meeting_at < b.meeting_at ? -1 : 1));
  const past = meetings.filter((m) => !isUpcoming(m)).sort((a, b) => (a.meeting_at < b.meeting_at ? 1 : -1));

  const openParty = (m: CrmMeeting) => {
    if (!m.target_kind || !m.target_id) return;
    navigate(`/admin/crm/${m.target_kind === 'contact' ? 'contacts' : 'companies'}/${m.target_id}`);
  };

  const Row: React.FC<{ m: CrmMeeting; done?: boolean }> = ({ m, done }) => (
    <div className={`flex flex-wrap items-start gap-3 rounded-lg border p-3 ${done ? 'opacity-70' : ''}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <CalendarDays className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{m.subject || 'Meeting'}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> {fmt(m.meeting_at)}
        </div>
        {m.notes && <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{m.notes}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {m.party_name && m.target_id && (
            <button type="button" onClick={() => openParty(m)}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-accent">
              {m.target_kind === 'company' ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
              {m.party_name}
            </button>
          )}
          {m.status === 'done' && <span className={`text-[10px] capitalize ${statusTone(m.status)}`}>Done</span>}
          {isUpcoming(m) && m.remind_email && (
            <Badge variant="outline" className="gap-1 text-[10px]"><Mail className="h-3 w-3" /> Email{m.reminder_sent_at ? ' · sent' : ''}</Badge>
          )}
          {isUpcoming(m) && m.remind_whatsapp && (
            <Badge variant="outline" className="gap-1 text-[10px]"><MessageSquare className="h-3 w-3" /> WhatsApp{m.reminder_sent_at ? ' · sent' : ''}</Badge>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {isUpcoming(m) && (
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Mark done"
            disabled={busyId === m.id} onClick={() => act(m.id, () => crmMeetingsService.setStatus(m.id, 'done'))}>
            {busyId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Delete"
          disabled={busyId === m.id} onClick={() => act(m.id, () => crmMeetingsService.remove(m.id))}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> Upcoming meetings
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Meetings you've logged on CRM contacts &amp; companies. Log a meeting from a contact's Activity tab.</p>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : upcoming.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No upcoming meetings.</p>
        ) : (
          <div className="space-y-2">{upcoming.map((m) => <Row key={m.id} m={m} />)}</div>
        )}
      </div>

      {past.length > 0 && (
        <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Clock className="h-4 w-4" /> Past &amp; done</h3>
          </div>
          <div className="space-y-2">{past.map((m) => <Row key={m.id} m={m} done />)}</div>
        </div>
      )}
    </div>
  );
};

export default ProfileMeetingsTab;
