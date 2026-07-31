import { supabase } from '@/integrations/supabase/client';

export type CrmActivityTargetKind = 'contact' | 'company' | 'user';
export interface CrmActivityTarget { kind: CrmActivityTargetKind; id: string }

export interface CrmActivity {
  id: string;
  target_kind: CrmActivityTargetKind;
  target_id: string;
  activity_type: string;
  title: string;
  description: string | null;
  metadata: Record<string, any>;
  actor_user_id: string | null;
  created_at: string;
  actor_name?: string | null;
}

export interface TimelineItem {
  id: string;
  source: 'activity' | 'note';
  activity_type: string;
  title: string;
  description: string | null;
  created_at: string;
  actor_id: string | null;
  actor_name?: string | null;
  /** Document value (order/invoice/payment/… total) when the event has one. */
  amount?: number | null;
  currency?: string | null;
  /** The document behind a derived event — lets the feed link out to it. */
  entity_kind?: string | null;
  entity_id?: string | null;
}

class CrmActivitiesService {
  /**
   * Fire-and-forget activity log. NEVER throws — recording an activity must never
   * break the underlying action (sending the email, attaching the company, …).
   */
  async log(
    target: CrmActivityTarget,
    input: { activity_type: string; title: string; description?: string | null; metadata?: Record<string, any>; workspace_id?: string | null },
  ): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('crm_activities').insert({
        target_kind: target.kind,
        target_id: target.id,
        activity_type: input.activity_type,
        title: input.title,
        description: input.description ?? null,
        metadata: input.metadata ?? {},
        actor_user_id: user.id,
        workspace_id: input.workspace_id ?? null,
      });
    } catch (e) {
      console.warn('crm activity log failed (non-fatal):', e);
    }
  }

  /**
   * The record's full timeline, from `crm_record_timeline` — the SINGLE definition of
   * what counts as activity on a CRM party. Business events (quotes, orders, invoices,
   * supplier bills, payments in and out, credit notes, shipments) are DERIVED from the
   * documents themselves; crm_activities / crm_notes / crm_meetings supply only the
   * entries that have no document (notes, calls, emails sent, lead status changes).
   *
   * Never re-assemble this feed here: a write-log of business events goes stale the
   * moment a document is edited or deleted — the log this replaced was still showing
   * four "Invoice created" entries for invoices that no longer existed.
   */
  async listTimeline(target: CrmActivityTarget, limit = 200): Promise<TimelineItem[]> {
    const { data, error } = await supabase.rpc('crm_record_timeline', {
      p_target_kind: target.kind,
      p_target_id: target.id,
      p_limit: limit,
    });
    if (error) throw error;
    return (data || []).map((r) => ({
      id: r.id,
      source: r.source === 'note' ? ('note' as const) : ('activity' as const),
      activity_type: r.activity_type,
      title: r.title,
      description: r.description,
      created_at: r.occurred_at,
      actor_id: r.actor_id,
      actor_name: r.actor_name,
      amount: r.amount,
      currency: r.currency,
      entity_kind: r.entity_kind,
      entity_id: r.entity_id,
    }));
  }

  /** Add an internal note (also surfaces in the merged timeline). */
  async addNote(target: CrmActivityTarget, body: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const { error } = await supabase.from('crm_notes').insert({
      target_kind: target.kind, target_id: target.id, body, created_by: user.id,
    });
    if (error) throw error;
  }

  /**
   * Manually log a typed activity (a call, a meeting/event, …) from the timeline
   * composer. Unlike `log`, this THROWS on failure so the composer can surface an
   * error — it's a deliberate user action, not fire-and-forget bookkeeping.
   */
  async addActivity(target: CrmActivityTarget, activity_type: string, title: string, description: string, metadata: Record<string, any> = {}): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const { error } = await supabase.from('crm_activities').insert({
      target_kind: target.kind, target_id: target.id,
      activity_type, title, description, metadata,
      actor_user_id: user.id, workspace_id: null,
    });
    if (error) throw error;
  }

  async listForTarget(target: CrmActivityTarget, limit = 100): Promise<CrmActivity[]> {
    const { data, error } = await supabase
      .from('crm_activities')
      .select('id, target_kind, target_id, activity_type, title, description, metadata, actor_user_id, created_at')
      .eq('target_kind', target.kind)
      .eq('target_id', target.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const rows = (data || []) as CrmActivity[];

    // Resolve actor display names in one batch.
    const ids = [...new Set(rows.map((r) => r.actor_user_id).filter(Boolean))] as string[];
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, full_name')
        .in('user_id', ids);
      const byId = new Map<string, string | null>((profiles || []).map((p: any) => [p.user_id as string, (p.full_name ?? null) as string | null]));
      for (const r of rows) r.actor_name = r.actor_user_id ? (byId.get(r.actor_user_id) ?? null) : null;
    }
    return rows;
  }
}

export const crmActivitiesService = new CrmActivitiesService();
