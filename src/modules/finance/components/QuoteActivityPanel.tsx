// Quote activity log + follow-up scheduler. Mounts on the QuoteDetailAdminPage
// "Activity" tab. Lets admins/owners record calls/emails/notes and schedule
// follow-up reminders that the daily cron will surface as bell notifications.
import React, { useEffect, useState } from 'react';
import {
  Phone,
  Mail,
  CalendarClock,
  StickyNote,
  Send,
  MessageSquare,
  Activity as ActivityIcon,
  Loader2,
  CheckCircle2,
  Bell,
  Eye,
  ArrowRightCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Textarea } from '@/components/core/ui/textarea';
import { Input } from '@/components/core/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { statusTone } from '@/utils/statusTone';
import {
  financeService,
  type QuoteActivity,
  type QuoteActivityKind,
} from '@/modules/finance/services/financeService';

const KIND_ICON: Record<QuoteActivityKind, React.ComponentType<{ className?: string }>> = {
  note: StickyNote,
  call: Phone,
  email: Mail,
  sms: MessageSquare,
  meeting: CalendarClock,
  follow_up_scheduled: Bell,
  status_change: ArrowRightCircle,
  viewed: Eye,
  sent: Send,
  reminder_dispatched: Bell,
};

const KIND_LABEL: Record<QuoteActivityKind, string> = {
  note: 'Note',
  call: 'Call',
  email: 'Email',
  sms: 'SMS',
  meeting: 'Meeting',
  follow_up_scheduled: 'Follow-up scheduled',
  status_change: 'Status change',
  viewed: 'Viewed',
  sent: 'Sent',
  reminder_dispatched: 'Reminder',
};

const LOGGABLE_KINDS: QuoteActivityKind[] = ['note', 'call', 'email', 'sms', 'meeting'];

interface Props {
  quoteId: string;
}

export const QuoteActivityPanel: React.FC<Props> = ({ quoteId }) => {
  const { toast } = useToast();
  const [activities, setActivities] = useState<QuoteActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<QuoteActivityKind>('note');
  const [body, setBody] = useState('');
  const [scheduledFor, setScheduledFor] = useState<string>('');

  useEffect(() => { void load(); }, [quoteId]);

  const load = async () => {
    try {
      setLoading(true);
      const rows = await financeService.listQuoteActivities(quoteId);
      setActivities(rows);
    } catch (err: any) {
      toast({ title: 'Load failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!body.trim() && !scheduledFor) {
      toast({ title: 'Add a note or pick a date', variant: 'destructive' });
      return;
    }
    try {
      setBusy(true);
      await financeService.createQuoteActivity({
        quoteId,
        kind: scheduledFor ? 'follow_up_scheduled' : kind,
        body: body.trim() || null,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
      });
      setBody('');
      setScheduledFor('');
      toast({ title: 'Activity logged' });
      await load();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await financeService.completeQuoteActivity(id);
      await load();
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 dashboard-card">
        <CardContent className="space-y-3 p-5">
          <div className="text-sm font-semibold flex items-center gap-2">
            <ActivityIcon className="h-4 w-4" />
            Log activity / Schedule follow-up
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[150px_1fr_180px]">
            <Select value={kind} onValueChange={(v: QuoteActivityKind) => setKind(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LOGGABLE_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="What happened? (e.g. left voicemail, sent quote PDF)"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <Input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              placeholder="Schedule follow-up"
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Picking a date converts this entry into a scheduled follow-up. The daily cron pings the quote owner when it's due.
            </p>
            <Button onClick={handleSubmit} disabled={busy} size="sm">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Log'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
          ) : activities.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No activity yet. Use the form above to log a call or note.</div>
          ) : (
            <ul className="divide-y divide-border/40">
              {activities.map((a) => {
                const Icon = KIND_ICON[a.kind] ?? StickyNote;
                const overdue =
                  a.scheduled_for &&
                  !a.completed_at &&
                  new Date(a.scheduled_for).getTime() < Date.now();
                return (
                  <li key={a.id} className="flex gap-3 p-4">
                    <div className={`mt-0.5 h-7 w-7 shrink-0 rounded-full ${overdue ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'} flex items-center justify-center`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{KIND_LABEL[a.kind]}</span>
                        <span>· {new Date(a.created_at).toLocaleString()}</span>
                        {a.scheduled_for && (
                          <span className={`text-[10px] ${statusTone(a.completed_at ? 'completed' : overdue ? 'overdue' : 'scheduled')}`}>
                            {a.completed_at ? 'completed' : overdue ? 'overdue' : 'scheduled'}
                            {' · '}
                            {new Date(a.scheduled_for).toLocaleString()}
                          </span>
                        )}
                      </div>
                      {a.body && <div className="text-sm">{a.body}</div>}
                    </div>
                    {a.scheduled_for && !a.completed_at && (
                      <Button size="sm" variant="ghost" onClick={() => void handleComplete(a.id)}>
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
