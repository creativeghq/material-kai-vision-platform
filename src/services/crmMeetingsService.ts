import { supabase } from '@/integrations/supabase/client';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';
import { emailService } from '@/modules/email/services/emailService';
import { escapeHtml } from '@/utils/escapeHtml';
import type { CrmActivityTarget } from './crmActivitiesService';

/** RFC 5545 text escaping for a single ICS property value. */
const icsEscape = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** UTC basic-format stamp: 20260726T130000Z. */
const icsStamp = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** UTF-8-safe base64 for the .ics attachment content (Resend wants raw base64, no data: prefix). */
const toBase64 = (s: string): string => btoa(unescape(encodeURIComponent(s)));

/** Build a METHOD:REQUEST VEVENT for a meeting so email clients render it as an invite. */
function buildInviteIcs(input: {
  uid: string; start: Date; end: Date; subject: string; description?: string | null;
  location?: string | null; organizerEmail?: string | null; attendeeEmails: string[];
}): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MaterialsHub//CRM//EN', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(input.start)}`,
    `DTEND:${icsStamp(input.end)}`,
    `SUMMARY:${icsEscape(input.subject)}`,
    ...(input.description ? [`DESCRIPTION:${icsEscape(input.description)}`] : []),
    ...(input.location ? [`LOCATION:${icsEscape(input.location)}`] : []),
    ...(input.organizerEmail ? [`ORGANIZER:mailto:${input.organizerEmail}`] : []),
    ...input.attendeeEmails.map((e) => `ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${e}`),
    'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

export interface CrmMeeting {
  id: string;
  workspace_id: string | null;
  owner_user_id: string;
  target_kind: 'contact' | 'company' | null;
  target_id: string | null;
  subject: string;
  notes: string | null;
  meeting_at: string;
  location: string | null;
  attendee_contact_ids: string[];
  remind_email: boolean;
  remind_whatsapp: boolean;
  reminder_minutes_before: number;
  reminder_at: string | null;
  reminder_sent_at: string | null;
  status: 'scheduled' | 'done' | 'cancelled';
  created_at: string;
  /** Resolved party label for the Profile Calendar list. */
  party_name?: string | null;
}

class CrmMeetingsService {
  /**
   * Log a meeting on a contact/company. reminder_at is computed by a DB trigger.
   * When `sendInvites` is set, a calendar invite (.ics) is emailed to the attendee
   * contacts that have an address — best-effort: a failed invite never rolls back
   * the meeting. Returns how many invites went out so the caller can surface it.
   */
  async create(input: {
    target?: CrmActivityTarget;
    workspaceId?: string | null;
    meetingAt: string; // ISO
    subject?: string;
    notes?: string | null;
    location?: string | null;
    /** crm_contacts this appointment is with (used when logging on a company). */
    attendeeContactIds?: string[];
    /** Email a calendar invite to the attendee contacts that have an address. */
    sendInvites?: boolean;
    remindEmail?: boolean;
    remindWhatsapp?: boolean;
    reminderMinutesBefore?: number;
  }): Promise<{ id: string; invitesSent: number; invitesFailed: number; inviteError?: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    // Always stamp the workspace (fall back to the user's active workspace) — a null workspace_id made
    // the meeting invisible to the agent's "what meetings do I have?" (which filters by workspace) and
    // forced its reminder to send from the platform sender even in a BYOK-Resend tenant.
    const workspaceId = input.workspaceId ?? getActiveWorkspaceId(user.id);
    const subject = input.subject?.trim() || 'Meeting';
    const attendeeContactIds = input.attendeeContactIds ?? [];
    const { data, error } = await supabase.from('crm_meetings').insert({
      workspace_id: workspaceId,
      owner_user_id: user.id,
      target_kind: input.target?.kind ?? null,
      target_id: input.target?.id ?? null,
      subject,
      notes: input.notes?.trim() || null,
      location: input.location?.trim() || null,
      attendee_contact_ids: attendeeContactIds,
      meeting_at: input.meetingAt,
      remind_email: !!input.remindEmail,
      remind_whatsapp: !!input.remindWhatsapp,
      reminder_minutes_before: input.reminderMinutesBefore ?? 60,
    }).select('id').single();
    if (error) throw error;
    const meetingId = (data as { id: string }).id;

    let invitesSent = 0;
    let invitesFailed = 0;
    let inviteError: string | undefined;
    if (input.sendInvites && attendeeContactIds.length > 0) {
      try {
        const { data: rows } = await supabase
          .from('crm_contacts').select('id, name, email').in('id', attendeeContactIds);
        const attendees = (rows ?? []).filter((c: any) => (c.email ?? '').trim());
        const emails = attendees.map((c: any) => c.email.trim());
        if (emails.length > 0) {
          const start = new Date(input.meetingAt);
          const end = new Date(start.getTime() + 60 * 60 * 1000); // default 1h
          const ics = buildInviteIcs({
            uid: `${meetingId}@materialshub`, start, end, subject,
            description: input.notes?.trim() || null, location: input.location?.trim() || null,
            organizerEmail: user.email ?? null, attendeeEmails: emails,
          });
          const when = start.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
          const html = `<div style="font-family:'Open Sans',Arial,sans-serif;font-size:14px;line-height:1.6;color:#222">
            <p>You're invited to <strong>${escapeHtml(subject)}</strong>.</p>
            <p><strong>When:</strong> ${escapeHtml(when)}</p>
            ${input.location ? `<p><strong>Where:</strong> ${escapeHtml(input.location)}</p>` : ''}
            ${input.notes?.trim() ? `<p>${escapeHtml(input.notes.trim())}</p>` : ''}
            <p>Add it to your calendar with the attached invite.</p>
          </div>`;
          await emailService.sendEmail({
            to: emails,
            subject: `Invitation: ${subject} — ${when}`,
            html,
            text: `You're invited to ${subject}.\nWhen: ${when}${input.location ? `\nWhere: ${input.location}` : ''}${input.notes?.trim() ? `\n\n${input.notes.trim()}` : ''}`,
            attachments: [{ filename: 'invite.ics', content: toBase64(ics) }],
            emailType: 'transactional',
            workspaceId: workspaceId ?? undefined,
            requireWorkspaceSender: true,
          });
          invitesSent = emails.length;
        }
      } catch (err: any) {
        invitesFailed = attendeeContactIds.length;
        inviteError = err?.message ?? 'Invite send failed';
        console.warn('crm meeting invite send failed (non-fatal):', err);
      }
    }
    return { id: meetingId, invitesSent, invitesFailed, inviteError };
  }

  /** Meetings owned by the current user — powers the Profile Calendar. */
  async listMine(opts?: { upcomingOnly?: boolean; limit?: number }): Promise<CrmMeeting[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    let q = supabase
      .from('crm_meetings')
      .select('*')
      .eq('owner_user_id', user.id)
      .neq('status', 'cancelled')
      .order('meeting_at', { ascending: !!opts?.upcomingOnly })
      .limit(opts?.limit ?? 100);
    if (opts?.upcomingOnly) q = q.gte('meeting_at', new Date().toISOString());
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data || []) as CrmMeeting[];
    await this.resolvePartyNames(rows);
    return rows;
  }

  async setStatus(id: string, status: CrmMeeting['status']): Promise<void> {
    const { error } = await supabase.from('crm_meetings').update({ status }).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('crm_meetings').delete().eq('id', id);
    if (error) throw error;
  }

  /** Fill party_name from crm_contacts / crm_companies in two batched reads. */
  private async resolvePartyNames(rows: CrmMeeting[]): Promise<void> {
    const contactIds = [...new Set(rows.filter((r) => r.target_kind === 'contact' && r.target_id).map((r) => r.target_id as string))];
    const companyIds = [...new Set(rows.filter((r) => r.target_kind === 'company' && r.target_id).map((r) => r.target_id as string))];
    const names = new Map<string, string>();
    await Promise.all([
      contactIds.length
        ? supabase.from('crm_contacts').select('id, name').in('id', contactIds)
            .then(({ data }) => (data || []).forEach((c: any) => names.set(`contact:${c.id}`, c.name)))
        : Promise.resolve(),
      companyIds.length
        ? supabase.from('crm_companies').select('id, name').in('id', companyIds)
            .then(({ data }) => (data || []).forEach((c: any) => names.set(`company:${c.id}`, c.name)))
        : Promise.resolve(),
    ]);
    for (const r of rows) r.party_name = r.target_kind && r.target_id ? (names.get(`${r.target_kind}:${r.target_id}`) ?? null) : null;
  }
}

export const crmMeetingsService = new CrmMeetingsService();
