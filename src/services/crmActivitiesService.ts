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
   * Merged timeline = activity rows (excluding note_added, since notes are pulled
   * straight from crm_notes here) + the contact/company's notes, newest-first.
   * This is what the unified Activity view renders.
   */
  async listTimeline(target: CrmActivityTarget, limit = 200): Promise<TimelineItem[]> {
    const [actRes, noteRes] = await Promise.all([
      supabase
        .from('crm_activities')
        .select('id, activity_type, title, description, actor_user_id, created_at')
        .eq('target_kind', target.kind)
        .eq('target_id', target.id)
        .neq('activity_type', 'note_added')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('crm_notes')
        .select('id, body, created_by, created_at')
        .eq('target_kind', target.kind)
        .eq('target_id', target.id)
        .order('created_at', { ascending: false })
        .limit(limit),
    ]);
    const acts = (actRes.data || []) as Array<{ id: string; activity_type: string; title: string; description: string | null; actor_user_id: string | null; created_at: string }>;
    const notes = (noteRes.data || []) as Array<{ id: string; body: string; created_by: string | null; created_at: string }>;

    const items: TimelineItem[] = [
      ...acts.map((a) => ({
        id: `a-${a.id}`, source: 'activity' as const, activity_type: a.activity_type,
        title: a.title, description: a.description, created_at: a.created_at, actor_id: a.actor_user_id,
      })),
      ...notes.map((n) => ({
        id: `n-${n.id}`, source: 'note' as const, activity_type: 'note_added',
        title: 'Note', description: n.body, created_at: n.created_at, actor_id: n.created_by,
      })),
    ];

    const ids = [...new Set(items.map((i) => i.actor_id).filter(Boolean))] as string[];
    if (ids.length > 0) {
      const { data: profiles } = await supabase.from('user_profiles').select('user_id, full_name').in('user_id', ids);
      const byId = new Map<string, string | null>((profiles || []).map((p: any) => [p.user_id as string, (p.full_name ?? null) as string | null]));
      for (const i of items) i.actor_name = i.actor_id ? (byId.get(i.actor_id) ?? null) : null;
    }
    items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return items;
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
