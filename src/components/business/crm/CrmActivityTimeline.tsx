/**
 * CrmActivityTimeline — unified feed for a CRM contact / company: tracked actions
 * (quote/invoice created, email sent, company attach, lead status change) merged
 * with the party's internal notes, newest-first. New entries are logged from the
 * inline composer at the top — pick a type (Note / Call / Meeting) and write; notes
 * go to crm_notes, calls/meetings to crm_activities. No modal.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, FileText, Mail, Building2, Tag, ScrollText, Receipt, CreditCard, Loader2, Unlink, Trash2, Phone, CalendarDays,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Textarea } from '@/components/core/ui/textarea';
import { Input } from '@/components/core/ui/input';
import { useToast } from '@/hooks/use-toast';
import { crmActivitiesService, type TimelineItem, type CrmActivityTarget } from '@/services/crmActivitiesService';
import { getErrorMessage } from '@/core/errors/utils';

interface Props {
  target: CrmActivityTarget;
  /** Bump to force a reload (parent logged a new activity). */
  refreshKey?: number;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  note_added: FileText,
  call_logged: Phone,
  meeting_logged: CalendarDays,
  email_sent: Mail,
  company_attached: Building2,
  company_detached: Unlink,
  company_deleted: Trash2,
  lead_status_changed: Tag,
  quote_created: ScrollText,
  invoice_created: Receipt,
  payment_received: CreditCard,
};

// Composer entry types. `note` persists to crm_notes; the rest log a typed row to
// crm_activities (activity_type / title) — all merge back into the timeline below.
type ComposerKey = 'note' | 'call' | 'meeting';
const COMPOSER: Array<{
  key: ComposerKey; label: string; icon: React.ComponentType<{ className?: string }>;
  placeholder: string; submit: string; activity?: { type: string; title: string };
}> = [
  { key: 'note', label: 'Note', icon: FileText, placeholder: 'Write an internal note — visible to your team…', submit: 'Add note' },
  { key: 'call', label: 'Call', icon: Phone, placeholder: 'Log a call — who, and what was discussed…', submit: 'Log call', activity: { type: 'call_logged', title: 'Call logged' } },
  { key: 'meeting', label: 'Meeting', icon: CalendarDays, placeholder: 'Log a meeting or event…', submit: 'Log meeting', activity: { type: 'meeting_logged', title: 'Meeting logged' } },
];

const relativeTime = (iso: string): string => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24); if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
};

export const CrmActivityTimeline: React.FC<Props> = ({ target, refreshKey = 0 }) => {
  const { toast } = useToast();
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<ComposerKey>('note');
  const [draft, setDraft] = useState('');
  const [meetingAt, setMeetingAt] = useState(''); // datetime-local value, for Meeting entries
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!target.id) { setItems([]); setLoading(false); return; }
    try {
      setLoading(true);
      setItems(await crmActivitiesService.listTimeline(target));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.kind, target.id]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const current = COMPOSER.find((c) => c.key === type)!;
  // Meeting can be logged with just a time; note/call need text.
  const canSubmit = type === 'meeting' ? (!!draft.trim() || !!meetingAt) : !!draft.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const body = draft.trim();
    setSaving(true);
    try {
      if (type === 'meeting') {
        const when = meetingAt ? new Date(meetingAt) : null;
        const title = when
          ? `Meeting — ${when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
          : 'Meeting logged';
        await crmActivitiesService.addActivity(target, 'meeting_logged', title, body, when ? { meeting_at: when.toISOString() } : {});
      } else if (current.activity) {
        await crmActivitiesService.addActivity(target, current.activity.type, current.activity.title, body);
      } else {
        await crmActivitiesService.addNote(target, body);
      }
      setDraft('');
      setMeetingAt('');
      await load(); // instant refresh
    } catch (err) {
      toast({ title: 'Could not save', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Cmd/Ctrl+Enter submits from the textarea.
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void handleSubmit(); }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" /> Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Inline composer — active textbox with a type switcher (Note / Call / Meeting). */}
        {target.id && (
          <div className="rounded-xl border bg-muted/20 transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/25">
            <div className="flex items-center gap-1 px-2 pt-2">
              {COMPOSER.map((c) => {
                const on = c.key === type;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setType(c.key)}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                      on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    ].join(' ')}
                  >
                    <c.icon className="h-3.5 w-3.5" /> {c.label}
                  </button>
                );
              })}
            </div>
            {type === 'meeting' && (
              <div className="flex items-center gap-2 px-2.5 pt-2">
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Input
                  type="datetime-local"
                  value={meetingAt}
                  onChange={(e) => setMeetingAt(e.target.value)}
                  className="h-8 w-auto max-w-[15rem] text-xs"
                  aria-label="Meeting date & time"
                />
              </div>
            )}
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              placeholder={type === 'meeting' ? 'What was the meeting about? (optional)' : current.placeholder}
              className="min-h-[2.75rem] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <div className="flex items-center justify-between gap-2 px-2.5 pb-2">
              <span className="text-[10.5px] text-muted-foreground">⌘/Ctrl + Enter to save</span>
              <Button size="sm" onClick={handleSubmit} disabled={saving || !canSubmit}>
                {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                {current.submit}
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-3 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No activity yet. Notes, calls and meetings you log — plus tracked actions (emails,
            quotes, invoices, company changes, lead status) — show up here.
          </p>
        ) : (
          <div className="space-y-0">
            {items.map((a, i) => {
              const Icon = ICONS[a.activity_type] ?? Activity;
              const isNote = a.source === 'note';
              return (
                <div key={a.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isNote ? 'bg-amber-500/15 text-amber-500' : 'bg-muted text-muted-foreground'}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {i < items.length - 1 && <span className="w-px flex-1 bg-border my-1" />}
                  </div>
                  <div className="pb-4 min-w-0 flex-1">
                    <div className="text-sm">
                      {isNote ? <span className="font-medium">Note</span> : a.title}
                    </div>
                    {a.description && (
                      <div className={`text-xs mt-0.5 ${isNote ? 'text-foreground whitespace-pre-wrap' : 'text-muted-foreground'}`}>{a.description}</div>
                    )}
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {relativeTime(a.created_at)}{a.actor_name ? ` · ${a.actor_name}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CrmActivityTimeline;
