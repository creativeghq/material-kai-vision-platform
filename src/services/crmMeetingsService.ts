import { supabase } from '@/integrations/supabase/client';
import type { CrmActivityTarget } from './crmActivitiesService';

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
  /** Log a meeting on a contact/company. reminder_at is computed by a DB trigger. */
  async create(input: {
    target?: CrmActivityTarget;
    workspaceId?: string | null;
    meetingAt: string; // ISO
    subject?: string;
    notes?: string | null;
    remindEmail?: boolean;
    remindWhatsapp?: boolean;
    reminderMinutesBefore?: number;
  }): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const { error } = await supabase.from('crm_meetings').insert({
      workspace_id: input.workspaceId ?? null,
      owner_user_id: user.id,
      target_kind: input.target?.kind ?? null,
      target_id: input.target?.id ?? null,
      subject: input.subject?.trim() || 'Meeting',
      notes: input.notes?.trim() || null,
      meeting_at: input.meetingAt,
      remind_email: !!input.remindEmail,
      remind_whatsapp: !!input.remindWhatsapp,
      reminder_minutes_before: input.reminderMinutesBefore ?? 60,
    });
    if (error) throw error;
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
