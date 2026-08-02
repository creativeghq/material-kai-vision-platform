/**
 * CrmActivityTimeline — unified feed for a CRM contact / company: everything that has
 * happened with this party, newest-first. The business half (quotes, orders, invoices,
 * supplier bills, payments in and out, credit notes, shipments) is DERIVED from the
 * documents by `crm_record_timeline`; the composer at the top adds the entries that
 * have no document — notes go to crm_notes, calls/meetings to crm_activities. No modal.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  FileText,
  Mail,
  Building2,
  Tag,
  ScrollText,
  Receipt,
  Loader2,
  Unlink,
  Trash2,
  Phone,
  CalendarDays,
  Users,
  ShoppingCart,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ReceiptText,
  Undo2,
  Truck,
  FolderKanban,
  Palette,
  Presentation,
  Share2,
  MessageSquare,
  Home,
  Eye,
  KeyRound,
  Download,
  MailOpen,
  MousePointerClick,
  MailWarning,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Textarea } from '@/components/core/ui/textarea';
import { Input } from '@/components/core/ui/input';
import { Checkbox } from '@/components/core/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { crmActivitiesService, type TimelineItem, type CrmActivityTarget } from '@/services/crmActivitiesService';
import { crmMeetingsService } from '@/services/crmMeetingsService';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { getErrorMessage } from '@/core/errors/utils';

/** A person the timeline can email or add as a meeting/call attendee. On a company
 *  record these are the attached contacts (+ optionally the company's own inbox). */
export interface TimelinePerson {
  id: string;
  name: string;
  email?: string | null;
  /** 'company' entries are emailable but never offered as meeting attendees. */
  kind?: 'contact' | 'company';
}

interface Props {
  target: CrmActivityTarget;
  /** Bump to force a reload (parent logged a new activity). */
  refreshKey?: number;
  /** Opens the composer's Send-email dialog (recipient selection happens there). */
  onComposeEmail?: () => void;
  /** Whether the party has an email on file (gates the Email action when `people` is omitted). */
  canEmail?: boolean;
  /**
   * People this record can email / meet with. On a COMPANY these are the company
   * inbox + attached contacts (so Email picks recipients and Call/Meeting entries
   * name attendees). On a CONTACT it's just the contact. Omit to fall back to `canEmail`.
   */
  people?: TimelinePerson[];
  /**
   * Called after a meeting is logged, with how many calendar invites went out
   * to attendees (0 when none were requested). Lets the parent surface a toast/refresh.
   */
  onMeetingLogged?: (info: { invitesSent: number; invitesFailed: number }) => void;
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
  quote_accepted: CheckCircle2,
  order_created: ShoppingCart,
  invoice_created: Receipt,
  invoice_paid: CheckCircle2,
  bill_received: ReceiptText,
  bill_paid: CheckCircle2,
  payment_received: ArrowDownLeft,
  payment_sent: ArrowUpRight,
  credit_note_issued: Undo2,
  supplier_credit_note_received: Undo2,
  shipment_created: Truck,
  registry_enrichment: Building2,
  // Projects & design work
  project_created: FolderKanban,
  project_event: FolderKanban,
  moodboard_created: Palette,
  sheet_created: Presentation,
  moodboard_quote_requested: ScrollText,
  client_view_shared: Share2,
  client_feedback: MessageSquare,
  property_viewing: Home,
  // Engagement — what they did with what we sent
  page_visit: Eye,
  catalog_access: KeyRound,
  quote_downloaded: Download,
  email_opened: MailOpen,
  email_clicked: MousePointerClick,
  email_bounced: MailWarning,
};

/**
 * Money-in reads green, money-out amber — the same two directions the ledger uses.
 * Engagement (they looked, they replied) reads sky, so inbound signal stands out from
 * the things we did ourselves.
 */
const TONES: Record<string, string> = {
  payment_received: 'bg-emerald-500/15 text-emerald-500',
  invoice_paid: 'bg-emerald-500/15 text-emerald-500',
  payment_sent: 'bg-amber-500/15 text-amber-500',
  bill_paid: 'bg-amber-500/15 text-amber-500',
  page_visit: 'bg-sky-500/15 text-sky-500',
  quote_downloaded: 'bg-sky-500/15 text-sky-500',
  catalog_access: 'bg-sky-500/15 text-sky-500',
  email_opened: 'bg-sky-500/15 text-sky-500',
  email_clicked: 'bg-sky-500/15 text-sky-500',
  client_feedback: 'bg-sky-500/15 text-sky-500',
  moodboard_quote_requested: 'bg-sky-500/15 text-sky-500',
  email_bounced: 'bg-destructive/15 text-destructive',
};

/** Entities that have a page of their own — the rest are read-only feed lines. */
const hrefFor = (kind: string | null | undefined, id: string | null | undefined, financeBase: string): string | null => {
  if (!kind || !id) return null;
  if (kind === 'order') return `${financeBase}/orders/${id}`;
  if (kind === 'invoice') return `${financeBase}/invoices/${id}`;
  if (kind === 'project') return `/projects/${id}`;
  if (kind === 'moodboard') return `/moodboard/${id}`;
  return null;
};

const money = (amount: number, currency: string | null | undefined): string =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'EUR' }).format(amount);

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

export const CrmActivityTimeline: React.FC<Props> = ({ target, refreshKey = 0, onComposeEmail, canEmail, people, onMeetingLogged }) => {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  const financeBase = useLocation().pathname.startsWith('/admin') ? '/admin/finance' : '/finance';
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [type, setType] = useState<ComposerKey>('note');
  const [draft, setDraft] = useState('');
  const [meetingAt, setMeetingAt] = useState(''); // datetime-local value, for Meeting entries
  const [remindEmail, setRemindEmail] = useState(false);
  const [remindWhatsapp, setRemindWhatsapp] = useState(false);
  const [reminderLead, setReminderLead] = useState(60); // minutes before meeting_at
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]); // contacts a call/meeting is with
  const [sendInvites, setSendInvites] = useState(true); // email a calendar invite to attendees
  const [saving, setSaving] = useState(false);

  // Person picker. Email can go to any person with an address; only real contacts
  // (not the company inbox) are offered as meeting/call attendees.
  const emailRecipients = (people ?? []).filter((p) => (p.email ?? '').trim());
  const attendeeCandidates = (people ?? []).filter((p) => (p.kind ?? 'contact') !== 'company');
  const hasPeople = Array.isArray(people);
  // Email action shows when there's someone to write to: an emailable person (company)
  // or the party's own address (contact, via canEmail).
  const canCompose = hasPeople ? emailRecipients.length > 0 : !!canEmail;
  const toggleAttendee = (id: string) =>
    setAttendeeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const load = useCallback(async () => {
    if (!target.id) { setItems([]); setLoading(false); return; }
    try {
      setLoading(true);
      setLoadError(null);
      setItems(await crmActivitiesService.listTimeline(target));
    } catch (err) {
      // An empty feed and a failed feed look identical otherwise — say which it is.
      setItems([]);
      setLoadError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.kind, target.id]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const current = COMPOSER.find((c) => c.key === type)!;
  const isFutureMeeting = !!meetingAt && new Date(meetingAt).getTime() > Date.now();
  // A meeting needs a date/time; note & call need text.
  const canSubmit = type === 'meeting' ? !!meetingAt : !!draft.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const body = draft.trim();
    // Attendees only apply to call/meeting entries. Prepend a "With <names>" line so
    // the timeline shows who was involved without an extra lookup (ids are the source of truth).
    const selectedAttendees = type === 'note' ? [] : attendeeCandidates.filter((p) => attendeeIds.includes(p.id));
    const withLine = selectedAttendees.length ? `With ${selectedAttendees.map((p) => p.name).join(', ')}` : '';
    const withBody = [withLine, body].filter(Boolean).join('\n');
    // Only future meetings with emailable attendees can carry a calendar invite.
    const invitableAttendees = selectedAttendees.filter((p) => (p.email ?? '').trim());
    const willInvite = type === 'meeting' && sendInvites && isFutureMeeting && invitableAttendees.length > 0;
    setSaving(true);
    try {
      if (type === 'meeting') {
        const res = await crmMeetingsService.create({
          target,
          workspaceId: activeWorkspaceId,
          meetingAt: new Date(meetingAt).toISOString(),
          notes: withBody || null,
          attendeeContactIds: selectedAttendees.map((p) => p.id),
          sendInvites: willInvite,
          remindEmail: isFutureMeeting && remindEmail,
          remindWhatsapp: isFutureMeeting && remindWhatsapp,
          reminderMinutesBefore: reminderLead,
        });
        onMeetingLogged?.({ invitesSent: res.invitesSent, invitesFailed: res.invitesFailed });
        if (res.invitesSent > 0) {
          toast({ title: `Invite sent to ${res.invitesSent} attendee${res.invitesSent === 1 ? '' : 's'}` });
        }
        if (res.invitesFailed > 0) {
          toast({ title: 'Some invites failed to send', description: res.inviteError || `${res.invitesFailed} attendee${res.invitesFailed === 1 ? '' : 's'} couldn’t be emailed.`, variant: 'destructive' });
        }
      } else if (current.activity) {
        await crmActivitiesService.addActivity(
          target, current.activity.type, current.activity.title, withBody,
          selectedAttendees.length ? { attendee_contact_ids: selectedAttendees.map((p) => p.id) } : {},
        );
      } else {
        await crmActivitiesService.addNote(target, body);
      }
      setDraft('');
      setMeetingAt('');
      setRemindEmail(false);
      setRemindWhatsapp(false);
      setAttendeeIds([]);
      setSendInvites(true);
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
        <CardTitle className="flex items-center gap-2">
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
              {/* Email action — opens the composer. Recipient selection (which
                  contact / the company inbox, one or many) happens in the dialog. */}
              {onComposeEmail && canCompose && (
                <button
                  type="button"
                  onClick={() => onComposeEmail()}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Compose and send an email — it's logged here automatically"
                >
                  <Mail className="h-3.5 w-3.5" /> Email
                </button>
              )}
            </div>
            {/* Attendees — pick which contact(s) a call/meeting is with (company record). */}
            {type !== 'note' && attendeeCandidates.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 px-2.5 pt-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <Users className="h-3.5 w-3.5" /> With
                </span>
                {attendeeCandidates.map((p) => {
                  const on = attendeeIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleAttendee(p.id)}
                      className={[
                        'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                        on ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:border-primary hover:text-foreground',
                      ].join(' ')}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            )}
            {type === 'meeting' && (
              <div className="space-y-2 px-2.5 pt-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <Input
                    type="datetime-local"
                    value={meetingAt}
                    onChange={(e) => setMeetingAt(e.target.value)}
                    className="h-8 w-auto max-w-[15rem] text-xs"
                    aria-label="Meeting date & time"
                  />
                </div>
                {isFutureMeeting && attendeeCandidates.some((p) => attendeeIds.includes(p.id) && (p.email ?? '').trim()) && (
                  <label htmlFor="crm-send-invites" className="flex cursor-pointer items-center gap-1.5 pl-5 text-xs text-foreground">
                    <Checkbox id="crm-send-invites" checked={sendInvites} onCheckedChange={(v) => setSendInvites(v === true)} />
                    Email a calendar invite to the selected attendee(s)
                  </label>
                )}
                {isFutureMeeting && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-5 text-xs text-muted-foreground">
                    <span>Remind me</span>
                    <label htmlFor="crm-remind-email" className="flex cursor-pointer items-center gap-1.5 text-foreground">
                      <Checkbox id="crm-remind-email" checked={remindEmail} onCheckedChange={(v) => setRemindEmail(v === true)} /> Email
                    </label>
                    <label htmlFor="crm-remind-whatsapp" className="flex cursor-pointer items-center gap-1.5 text-foreground">
                      <Checkbox id="crm-remind-whatsapp" checked={remindWhatsapp} onCheckedChange={(v) => setRemindWhatsapp(v === true)} /> WhatsApp
                    </label>
                    {(remindEmail || remindWhatsapp) && (
                      <select
                        value={reminderLead}
                        onChange={(e) => setReminderLead(Number(e.target.value))}
                        className="h-7 rounded-md border bg-background px-1.5 text-xs"
                        aria-label="Reminder lead time"
                      >
                        <option value={15}>15 min before</option>
                        <option value={60}>1 hour before</option>
                        <option value={1440}>1 day before</option>
                      </select>
                    )}
                  </div>
                )}
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
        ) : loadError ? (
          <p className="text-sm text-destructive py-2">Could not load the activity feed — {loadError}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No activity yet. Notes, calls and meetings you log show up here, alongside everything
            this party does — quotes, orders, invoices, supplier bills, payments in and out,
            credit notes, shipments, projects and moodboards, plus what they open: shared
            quotes and catalogues, statements and your emails.
          </p>
        ) : (
          <div className="space-y-0">
            {items.map((a, i) => {
              const Icon = ICONS[a.activity_type] ?? Activity;
              const isNote = a.source === 'note';
              const href = hrefFor(a.entity_kind, a.entity_id, financeBase);
              return (
                <div key={a.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isNote ? 'bg-amber-500/15 text-amber-500' : (TONES[a.activity_type] ?? 'bg-muted text-muted-foreground')}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {i < items.length - 1 && <span className="w-px flex-1 bg-border my-1" />}
                  </div>
                  <div className="pb-4 min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        {isNote ? <span className="font-medium">Note</span> : a.title}
                      </span>
                      {a.amount != null && (
                        <span className="shrink-0 tabular-nums">{money(a.amount, a.currency)}</span>
                      )}
                    </div>
                    {a.description && (
                      <div className={`text-xs mt-0.5 ${isNote ? 'text-foreground whitespace-pre-wrap' : 'text-muted-foreground'}`}>
                        {href ? <Link to={href} className="hover:text-primary hover:underline">{a.description}</Link> : a.description}
                      </div>
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
